import { addCalendarDays, dailyDateFor, managesTeam, type Ref } from '@standcast/core';
import {
  getInstallationMemberIds,
  listCurrentOpenBlockerStates,
  listResolvedBlockerStates,
  type MemberRow,
  type OpenBlockerState,
  operationalConfig,
} from '@standcast/db';
import type { Deps } from '../../deps';
import { guarded } from '../../guarded';
import { resolveTeams } from '../../teams';
import { authorizeInstallation } from '../access/authorize-installation';
import { DomainError } from '../access/errors';
import { isInstallationAdmin } from '../access/is-installation-admin';
import type { MembershipCheck } from '../access/org-context';
import { buildOpenBlockers, type TodayBlocker } from './get-team-today';

const ADMIN_CHECK_TIMEOUT_MS = 3000;
const RESOLVED_WINDOW_DAYS = 14;

export type OrgOpenBlocker = TodayBlocker & {
  teams: string[];
  canResolve: boolean;
  timezone: string;
  today: string;
};

export type OrgResolvedBlocker = {
  id: string;
  teams: string[];
  author: string;
  text: string;
  ref: Ref | null;
  resolvedOn: string;
  resolvedBy: string | null;
  canResolve: boolean;
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
    !selected.every((team) => managesTeam(login, team)) &&
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
  const byName = new Map(
    readable.map((team) => [
      team.name,
      { team, date: dailyDateFor(now, team), elevated: admin || managesTeam(login, team) },
    ]),
  );
  const teamsOf = (author: string) =>
    readable
      .filter((team) => team.memberLogins.includes(author))
      .map((team) => team.name)
      .sort((a, b) => a.localeCompare(b));
  const canResolveFor = (author: string, teams: string[]) =>
    author === login || teams.some((name) => byName.get(name)?.elevated === true);
  const logins = [...new Set(readable.flatMap((team) => team.memberLogins))];
  const ids = [...(await getInstallationMemberIds(deps.db, installation.id, logins)).values()];
  const states = await listCurrentOpenBlockerStates(deps.db, installation.id, ids);
  const contextOf = (state: OpenBlockerState) => {
    const teams = teamsOf(state.authorLogin.toLowerCase())
      .map((name) => byName.get(name))
      .filter((entry) => entry !== undefined);
    const first = teams[0];
    return {
      timezone: first?.team.timezone ?? 'UTC',
      date: first?.date ?? dailyDateFor(now, readable[0] as (typeof readable)[number]),
      managers: new Set(teams.flatMap((entry) => entry.team.managerLogins)),
    };
  };
  const open = await buildOpenBlockers(deps, installation, states, contextOf);
  const latest = [...byName.values()]
    .map((entry) => entry.date)
    .sort()
    .at(-1);
  const resolvedRows = latest
    ? await listResolvedBlockerStates(
        deps.db,
        installation.id,
        ids,
        addCalendarDays(latest, -RESOLVED_WINDOW_DAYS),
      )
    : [];
  return {
    open: open.map((blocker) => {
      const teams = teamsOf(blocker.author);
      const context = byName.get(teams[0] ?? '');
      return {
        ...blocker,
        teams,
        canResolve: canResolveFor(blocker.author, teams),
        timezone: context?.team.timezone ?? 'UTC',
        today: context?.date ?? blocker.openedOn,
      };
    }),
    resolved: resolvedRows.map((row) => {
      const author = row.authorLogin.toLowerCase();
      const teams = teamsOf(author);
      return {
        id: row.id,
        teams,
        author,
        text: row.text,
        ref: row.ref ?? null,
        resolvedOn: row.resolvedOn ?? '',
        resolvedBy: row.resolvedByLogin?.toLowerCase() ?? null,
        canResolve: canResolveFor(author, teams),
      };
    }),
  };
}
