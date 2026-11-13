import { addCalendarDays, type ChatProvider, type Item, type Ref } from '@standcast/core';
import {
  type DailyRecord,
  getConnectionInfo,
  getDelivery,
  listDailiesPage,
  listDigestDeliveries,
  type MemberRow,
} from '@standcast/db';
import type { Deps } from '../../deps';
import { DomainError } from '../access/errors';
import type { MembershipCheck } from '../access/org-context';
import { parseDay } from '../access/pagination';
import { loadTeamAccess, type TeamAccess } from '../access/team-access';
import { chatLink } from './chat-link';

const HISTORY_DAYS = 28;
const SHIPPED_DAYS = 7;
const MAX_RANGE_DAYS = 92;
const SEARCH_LIMIT = 100;
const MIN_QUERY_LENGTH = 2;
const MAX_DAILIES = 5000;

export type HistoryStatus = 'sent' | 'failed' | 'pending' | 'none';

export type HistoryDay = {
  date: string;
  status: HistoryStatus;
  sentAt: string | null;
  dailies: number;
  blockers: number;
  chatUrl: string | null;
};

export type TeamHistory = { team: string; provider: ChatProvider; days: HistoryDay[] };

export type HistoryEntry = { author: string; text: string; ref: Ref | null };

export type TeamDigest = {
  date: string;
  status: HistoryStatus;
  sentAt: string | null;
  provider: ChatProvider;
  chatUrl: string | null;
  blockers: HistoryEntry[];
  shipped: HistoryEntry[];
  today: { author: string; items: { text: string; ref: Ref | null }[] }[];
};

export type HistorySection = 'yesterday' | 'today' | 'blockers' | 'support';

export type SearchResult = HistoryEntry & { date: string; section: HistorySection };

export type TeamShipped = {
  from: string;
  to: string;
  days: { date: string; items: HistoryEntry[] }[];
};

type Input = { installationId: number; team: string };

const SECTIONS: HistorySection[] = ['yesterday', 'today', 'blockers', 'support'];

const GITHUB_REF = /^https:\/\/github\.com\/[\w.-]+\/([\w.-]+)\/(?:pull|issues)\/(\d+)/;

function refLabelOf(ref: Ref | undefined): string | undefined {
  const match = ref ? GITHUB_REF.exec(ref.url) : null;
  return match ? `${match[1]}#${match[2]}` : undefined;
}

async function readableTeam(
  deps: Deps,
  isMember: MembershipCheck,
  member: MemberRow,
  input: Input,
): Promise<TeamAccess> {
  const access = await loadTeamAccess(deps, isMember, member, input);
  if (!access.elevated && !access.belongs) {
    throw new DomainError('forbidden', 'you cannot read this team');
  }
  return access;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function range(
  access: TeamAccess,
  query: { from?: string; to?: string },
  defaultDays: number,
): { from: string; to: string } {
  const to = parseDay(query.to, 'to') ?? access.date;
  const from = parseDay(query.from, 'from') ?? addCalendarDays(to, 1 - defaultDays);
  if (from > to) throw new DomainError('invalid_request', 'from must not be after to');
  if (daysBetween(from, to) >= MAX_RANGE_DAYS) {
    throw new DomainError('invalid_request', `the range must be at most ${MAX_RANGE_DAYS} days`);
  }
  return { from, to };
}

function teamDailies(
  deps: Deps,
  access: TeamAccess,
  filter: { from?: string; to?: string; date?: string },
): Promise<DailyRecord[]> {
  return listDailiesPage(deps.db, access.installation.id, {
    ...filter,
    logins: access.team.memberLogins,
    limit: MAX_DAILIES,
  });
}

async function slackTeamId(deps: Deps, access: TeamAccess): Promise<string | null> {
  if (access.team.chat.provider !== 'slack') return null;
  return (await getConnectionInfo(deps.db, access.installation.id, 'slack'))?.externalId ?? null;
}

const entry = (record: DailyRecord, item: Item): HistoryEntry => ({
  author: record.login.toLowerCase(),
  text: item.text,
  ref: item.ref ?? null,
});

const shippedItem = (item: Item) => item.ref?.kind === 'pull_request' || item.ref?.kind === 'card';

const itemsOf = (record: DailyRecord, section: HistorySection): Item[] =>
  section === 'support' ? (record.payload.support ?? []) : record.payload[section];

const byDateThenAuthor = (a: DailyRecord, b: DailyRecord) =>
  b.date.localeCompare(a.date) || a.login.toLowerCase().localeCompare(b.login.toLowerCase());

export async function getTeamHistory(
  deps: Deps,
  isMember: MembershipCheck,
  member: MemberRow,
  input: Input & { from?: string; to?: string },
): Promise<TeamHistory> {
  const access = await readableTeam(deps, isMember, member, input);
  const { from, to } = range(access, input, HISTORY_DAYS);
  const [deliveries, records, slack] = await Promise.all([
    listDigestDeliveries(deps.db, access.installation.id, {
      team: access.team.name,
      from,
      to,
      limit: MAX_RANGE_DAYS,
    }),
    teamDailies(deps, access, { from, to }),
    slackTeamId(deps, access),
  ]);
  const counts = new Map<string, { dailies: number; blockers: number }>();
  for (const record of records) {
    const count = counts.get(record.date) ?? { dailies: 0, blockers: 0 };
    count.dailies += 1;
    count.blockers += record.payload.blockers.length;
    counts.set(record.date, count);
  }
  const byDate = new Map(deliveries.map((row) => [row.date, row]));
  const dates = [...new Set([...byDate.keys(), ...counts.keys()])].sort((a, b) =>
    b.localeCompare(a),
  );
  const provider = access.team.chat.provider;
  return {
    team: access.team.name,
    provider,
    days: dates.map((date) => {
      const row = byDate.get(date);
      const count = counts.get(date) ?? { dailies: 0, blockers: 0 };
      const sent = row?.status === 'sent';
      return {
        date,
        status: row?.status ?? 'none',
        sentAt: sent ? row.updatedAt.toISOString() : null,
        dailies: count.dailies,
        blockers: count.blockers,
        chatUrl: sent ? chatLink(provider, row.ref ?? null, slack) : null,
      };
    }),
  };
}

export async function getTeamDigest(
  deps: Deps,
  isMember: MembershipCheck,
  member: MemberRow,
  input: Input & { date: string },
): Promise<TeamDigest> {
  const access = await readableTeam(deps, isMember, member, input);
  const date = parseDay(input.date, 'date') as string;
  const [row, records, slack] = await Promise.all([
    getDelivery(deps.db, {
      installationId: access.installation.id,
      teamName: access.team.name,
      date,
      kind: 'digest',
    }),
    teamDailies(deps, access, { date }),
    slackTeamId(deps, access),
  ]);
  const sorted = [...records].sort(byDateThenAuthor);
  const provider = access.team.chat.provider;
  const sent = row?.status === 'sent';
  return {
    date,
    status: row?.status ?? 'none',
    sentAt: sent ? row.updatedAt.toISOString() : null,
    provider,
    chatUrl: sent ? chatLink(provider, row.ref ?? null, slack) : null,
    blockers: sorted.flatMap((record) =>
      record.payload.blockers.map((item) => entry(record, item)),
    ),
    shipped: sorted.flatMap((record) =>
      record.payload.yesterday.filter(shippedItem).map((item) => entry(record, item)),
    ),
    today: sorted
      .filter((record) => record.payload.today.length > 0)
      .map((record) => ({
        author: record.login.toLowerCase(),
        items: record.payload.today.map((item) => ({ text: item.text, ref: item.ref ?? null })),
      })),
  };
}

export async function searchTeamDailies(
  deps: Deps,
  isMember: MembershipCheck,
  member: MemberRow,
  input: Input & { q?: string; from?: string; to?: string },
): Promise<{ results: SearchResult[] }> {
  const access = await readableTeam(deps, isMember, member, input);
  const query = (input.q ?? '').trim().toLowerCase();
  if (query.length < MIN_QUERY_LENGTH) {
    throw new DomainError(
      'invalid_request',
      `the search needs at least ${MIN_QUERY_LENGTH} characters`,
    );
  }
  const { from, to } = range(access, input, HISTORY_DAYS);
  const records = (await teamDailies(deps, access, { from, to })).sort(byDateThenAuthor);
  const matches = (item: Item) =>
    [item.text, item.ref?.url, item.ref?.title, refLabelOf(item.ref)].some((value) =>
      value?.toLowerCase().includes(query),
    );
  const results: SearchResult[] = [];
  for (const record of records) {
    for (const section of SECTIONS) {
      for (const item of itemsOf(record, section)) {
        if (!matches(item)) continue;
        results.push({ date: record.date, section, ...entry(record, item) });
        if (results.length >= SEARCH_LIMIT) return { results };
      }
    }
  }
  return { results };
}

export async function getTeamShipped(
  deps: Deps,
  isMember: MembershipCheck,
  member: MemberRow,
  input: Input & { from?: string; to?: string },
): Promise<TeamShipped> {
  const access = await readableTeam(deps, isMember, member, input);
  const { from, to } = range(access, input, SHIPPED_DAYS);
  const records = (await teamDailies(deps, access, { from, to })).sort(byDateThenAuthor);
  const days = new Map<string, HistoryEntry[]>();
  for (const record of records) {
    const items = record.payload.yesterday.filter(shippedItem).map((item) => entry(record, item));
    if (items.length === 0) continue;
    days.set(record.date, [...(days.get(record.date) ?? []), ...items]);
  }
  return {
    from,
    to,
    days: [...days.entries()].map(([date, items]) => ({ date, items })),
  };
}
