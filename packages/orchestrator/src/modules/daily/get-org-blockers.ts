import { addCalendarDays, dailyDateFor, managesTeam, type Ref } from '@standcast/core';
import {
  getInstallationMemberIds,
  listResolvedBlockerStates,
  type MemberRow,
  operationalConfig,
} from '@standcast/db';
import type { Deps } from '../../deps';
import { guarded } from '../../guarded';
import { resolveTeams } from '../../teams';
import { authorizeInstallation } from '../access/authorize-installation';
import { DomainError } from '../access/errors';
import { isInstallationAdmin } from '../access/is-installation-admin';
import type { MembershipCheck } from '../access/org-context';
import type { TeamAccess } from '../access/team-access';
import { openTeamBlockers, type TodayBlocker } from './get-team-today';

const ADMIN_CHECK_TIMEOUT_MS = 3000;
const RESOLVED_WINDOW_DAYS = 14;

export type OrgOpenBlocker = TodayBlocker & { teams: string[]; canResolve: boolean };

export type OrgResolvedBlocker = {
  id: string;
  teams: string[];
  author: string;
  text: string;
  ref: Ref | null;
  resolvedOn: string;
  resolvedBy: string | null;
};

export type OrgBlockers = { open: OrgOpenBlocker[]; resolved: OrgResolvedBlocker[] };

export async function getOrgBlockers(
  deps: Deps,
  isMember: MembershipCheck,
  member: MemberRow,
  input: { installationId: number; team?: string },
): Promise<OrgBlockers> {
  const { member: current, installation } = await authorizeInstallation(
    deps,
    isMember,
    member,
    input.installationId,
  );
  const config = operationalConfig(installation);
  if (!config) {
    if (input.team !== undefined) throw new DomainError('not_found', 'team not found');
    return { open: [], resolved: [] };
  }
  const all = await resolveTeams(deps, installation.id, installation.accountLogin, config);
  const selected = input.team === undefined ? all : all.filter((t) => t.name === input.team);
  if (selected.length === 0) throw new DomainError('not_found', 'team not found');
  const login = current.login.toLowerCase();
  const own = (team: (typeof all)[number]) =>
    team.memberLogins.includes(login) || managesTeam(login, team);
  const admin =
    !selected.every(own) &&
    (await guarded(
      isInstallationAdmin(deps, installation.id, current),
      false,
      ADMIN_CHECK_TIMEOUT_MS,
      'org blockers admin check failed',
      { installationId: String(installation.id) },
    ));
  const readable = selected.filter((team) => admin || own(team));
  if (input.team !== undefined && readable.length === 0) {
    throw new DomainError('forbidden', 'you cannot read this team');
  }
  const now = deps.now();
  const accesses: TeamAccess[] = readable.map((team) => ({
    member: current,
    installation,
    team,
    date: dailyDateFor(now, team),
    elevated: admin || managesTeam(login, team),
    belongs: team.memberLogins.includes(login),
  }));
  const perTeam = await Promise.all(
    accesses.map(async (access) => ({ access, blockers: await openTeamBlockers(deps, access) })),
  );
  const open = new Map<string, OrgOpenBlocker>();
  for (const { access, blockers } of perTeam) {
    for (const blocker of blockers) {
      const canResolve = access.elevated || blocker.author === login;
      const existing = open.get(blocker.id);
      if (existing) {
        existing.teams.push(access.team.name);
        existing.canResolve = existing.canResolve || canResolve;
      } else {
        open.set(blocker.id, { ...blocker, teams: [access.team.name], canResolve });
      }
    }
  }
  const logins = [...new Set(readable.flatMap((team) => team.memberLogins))];
  const ids = await getInstallationMemberIds(deps.db, installation.id, logins);
  const latest = accesses
    .map((access) => access.date)
    .sort()
    .at(-1);
  const resolvedRows = latest
    ? await listResolvedBlockerStates(
        deps.db,
        installation.id,
        [...ids.values()],
        addCalendarDays(latest, -RESOLVED_WINDOW_DAYS),
      )
    : [];
  const teamsOf = (author: string) =>
    readable
      .filter((team) => team.memberLogins.includes(author))
      .map((team) => team.name)
      .sort((a, b) => a.localeCompare(b));
  return {
    open: [...open.values()]
      .map((blocker) => ({ ...blocker, teams: blocker.teams.sort((a, b) => a.localeCompare(b)) }))
      .sort(
        (a, b) =>
          a.openedOn.localeCompare(b.openedOn) ||
          a.author.localeCompare(b.author) ||
          a.text.localeCompare(b.text),
      ),
    resolved: resolvedRows.map((row) => {
      const author = row.authorLogin.toLowerCase();
      return {
        id: row.id,
        teams: teamsOf(author),
        author,
        text: row.text,
        ref: row.ref ?? null,
        resolvedOn: row.resolvedOn ?? '',
        resolvedBy: row.resolvedByLogin?.toLowerCase() ?? null,
      };
    }),
  };
}
