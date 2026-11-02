import { addCalendarDays, type Item, parsePullRequestUrl, type Ref } from '@standcast/core';
import {
  getInstallationMemberIds,
  listBlockerRouteRecipients,
  listCurrentOpenBlockerStates,
  listDailies,
  listDailiesPage,
  type MemberRow,
  type OpenBlockerState,
} from '@standcast/db';
import type { Deps } from '../deps';
import { guarded } from '../guarded';
import { logError } from '../log-error';
import { DomainError } from './errors';
import type { MembershipCheck } from './org-context';
import { digestState, loadTeamAccess, remindWindowOpen, type TeamAccess } from './team-access';

const HINT_TIMEOUT_MS = 3000;
const MAX_HINT_CALLS = 10;
const SUPPORT_WINDOW_DAYS = 14;

export type TodayDaily = { yesterday: Item[]; today: Item[]; blockers: Item[]; support: Item[] };

export type TodayPerson = {
  login: string;
  status: 'sent' | 'late' | 'missing';
  submittedAt: string | null;
  daily: TodayDaily | null;
};

export type TodayBlocker = {
  id: string;
  author: string;
  text: string;
  ref: Ref | null;
  openedOn: string;
  ageDays: number;
  recurring: boolean;
  routedTo: { logins: string[]; reason: string } | null;
  hint: { kind: 'pr_merged'; at: string } | null;
};

export type TodaySupport = { author: string; text: string; ref: Ref | null; since: string };

export type TodayShipped = { author: string; text: string; ref: Ref };

export type TeamToday = {
  team: { name: string; timezone: string; remindAt: string; digestAt: string };
  date: string;
  digest: { status: 'scheduled' | 'sent' | 'failed'; sentAt: string | null };
  canRemind: boolean;
  canResolve: boolean;
  people: TodayPerson[];
  blockers: TodayBlocker[];
  support: TodaySupport[];
  shipped: TodayShipped[];
};

type TodayRow = Awaited<ReturnType<typeof listDailies>>[number];

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const sameText = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();

function routeReason(ref: Ref | null, logins: string[], managers: Set<string>): string {
  const viaRef = ref?.kind === 'pull_request' || ref?.kind === 'card';
  if (!viaRef || logins.every((l) => managers.has(l))) return 'manager';
  return ref.kind;
}

async function routesOf(
  deps: Deps,
  access: TeamAccess,
  states: OpenBlockerState[],
): Promise<Map<string, string[]>> {
  const rows = await listBlockerRouteRecipients(
    deps.db,
    access.installation.id,
    [...new Set(states.map((s) => s.authorMemberId))],
    [...new Set(states.map((s) => s.blockerId))],
  );
  const routes = new Map<string, string[]>();
  for (const row of rows) {
    const key = `${row.authorMemberId}:${row.blockerId}`;
    const logins = routes.get(key) ?? [];
    if (!logins.includes(row.login)) logins.push(row.login);
    routes.set(key, logins);
  }
  return routes;
}

async function lookupHints(
  deps: Deps,
  access: TeamAccess,
  states: OpenBlockerState[],
): Promise<Map<string, string>> {
  const owner = access.installation.accountLogin.toLowerCase();
  const targets = states
    .flatMap((state) => {
      const pull = state.ref?.kind === 'pull_request' ? parsePullRequestUrl(state.ref.url) : null;
      return pull && pull.owner.toLowerCase() === owner ? [{ id: state.id, pull }] : [];
    })
    .slice(0, MAX_HINT_CALLS);
  const hints = new Map<string, string>();
  if (targets.length === 0) return hints;
  const octokit = await deps.github.installationOctokit(access.installation.id);
  await Promise.all(
    targets.map(async ({ id, pull }) => {
      try {
        const result = await deps.github.pullRequestMerged(octokit, pull);
        if (result?.merged && result.mergedAt) hints.set(id, result.mergedAt);
      } catch (error) {
        logError('today hint lookup failed', error, {
          installationId: String(access.installation.id),
        });
      }
    }),
  );
  return hints;
}

async function openBlockers(deps: Deps, access: TeamAccess): Promise<TodayBlocker[]> {
  const ids = await getInstallationMemberIds(
    deps.db,
    access.installation.id,
    access.team.memberLogins,
  );
  const states = await listCurrentOpenBlockerStates(deps.db, access.installation.id, [
    ...ids.values(),
  ]);
  if (states.length === 0) return [];
  const [routes, hints] = await Promise.all([
    routesOf(deps, access, states),
    guarded(
      lookupHints(deps, access, states),
      new Map<string, string>(),
      HINT_TIMEOUT_MS,
      'today hints failed',
      {
        installationId: String(access.installation.id),
      },
    ),
  ]);
  const managers = new Set(access.team.managers.map((m) => m.toLowerCase()));
  return states
    .map((state) => {
      const logins = routes.get(`${state.authorMemberId}:${state.blockerId}`);
      const at = hints.get(state.id);
      const ref = state.ref ?? null;
      return {
        id: state.id,
        author: state.authorLogin.toLowerCase(),
        text: state.text,
        ref,
        openedOn: state.openedOn,
        ageDays: Math.max(0, daysBetween(state.openedOn, access.date)),
        recurring: state.lastSeenOn > state.openedOn,
        routedTo: logins ? { logins, reason: routeReason(ref, logins, managers) } : null,
        hint: at ? { kind: 'pr_merged' as const, at } : null,
      };
    })
    .sort(
      (a, b) =>
        a.openedOn.localeCompare(b.openedOn) ||
        a.author.localeCompare(b.author) ||
        a.text.localeCompare(b.text),
    );
}

async function supportRequests(
  deps: Deps,
  access: TeamAccess,
  rows: TodayRow[],
): Promise<TodaySupport[]> {
  const asking = rows.filter((row) => (row.payload.support ?? []).length > 0);
  if (asking.length === 0) return [];
  const logins = asking.map((row) => row.login.toLowerCase());
  const history = await listDailiesPage(deps.db, access.installation.id, {
    from: addCalendarDays(access.date, 1 - SUPPORT_WINDOW_DAYS),
    to: access.date,
    logins,
    limit: logins.length * SUPPORT_WINDOW_DAYS,
  });
  const firstSeen = new Map<string, string>();
  for (const record of history) {
    for (const item of record.payload.support ?? []) {
      const key = `${record.login.toLowerCase()}\n${sameText(item.text)}`;
      const seen = firstSeen.get(key);
      if (!seen || record.date < seen) firstSeen.set(key, record.date);
    }
  }
  return asking.flatMap((row) => {
    const author = row.login.toLowerCase();
    return (row.payload.support ?? []).map((item) => ({
      author,
      text: item.text,
      ref: item.ref ?? null,
      since: firstSeen.get(`${author}\n${sameText(item.text)}`) ?? access.date,
    }));
  });
}

function shippedFrom(rows: TodayRow[]): TodayShipped[] {
  return rows.flatMap((row) =>
    row.payload.yesterday.flatMap((item) =>
      item.ref && (item.ref.kind === 'pull_request' || item.ref.kind === 'card')
        ? [{ author: row.login.toLowerCase(), text: item.text, ref: item.ref }]
        : [],
    ),
  );
}

export async function getTeamToday(
  deps: Deps,
  isMember: MembershipCheck,
  member: MemberRow,
  input: { installationId: number; team: string },
): Promise<TeamToday> {
  const access = await loadTeamAccess(deps, isMember, member, input);
  if (!access.elevated && !access.belongs) {
    throw new DomainError('forbidden', 'you cannot read this team');
  }
  const { team, date } = access;
  const digest = await digestState(deps, access);
  const logins = [...team.memberLogins].sort((a, b) => a.localeCompare(b));
  const byLogin = new Map(
    (await listDailies(deps.db, access.installation.id, date))
      .filter((row) => logins.includes(row.login.toLowerCase()))
      .map((row) => [row.login.toLowerCase(), row]),
  );
  const rows = logins.flatMap((login) => {
    const row = byLogin.get(login);
    return row ? [row] : [];
  });
  const people = logins.map((login): TodayPerson => {
    const row = byLogin.get(login);
    if (!row) return { login, status: 'missing', submittedAt: null, daily: null };
    const late = digest.sentAt !== null && row.firstSubmittedAt.getTime() > digest.sentAt.getTime();
    return {
      login,
      status: late ? 'late' : 'sent',
      submittedAt: row.submittedAt.toISOString(),
      daily: {
        yesterday: row.payload.yesterday,
        today: row.payload.today,
        blockers: row.payload.blockers,
        support: row.payload.support ?? [],
      },
    };
  });
  const [blockers, support] = await Promise.all([
    openBlockers(deps, access),
    supportRequests(deps, access, rows),
  ]);
  return {
    team: {
      name: team.name,
      timezone: team.timezone,
      remindAt: team.remindAt,
      digestAt: team.digestAt,
    },
    date,
    digest: { status: digest.status, sentAt: digest.sentAt?.toISOString() ?? null },
    canRemind: access.elevated && digest.status !== 'sent' && remindWindowOpen(deps, access),
    canResolve: access.elevated,
    people,
    blockers,
    support,
    shipped: shippedFrom(rows),
  };
}
