import { addCalendarDays, dailyDateFor, managesTeam, type Ref } from '@standcast/core';
import {
  getInstallationMemberIds,
  listCurrentOpenBlockerStates,
  listLatestDailies,
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
import { listsBlocker } from './blocker-states';
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
  const dates = new Map(all.map((team) => [team.name, dailyDateFor(now, team)]));
  const byName = new Map(readable.map((team) => [team.name, team]));
  const teamsOf = (author: string) =>
    readable
      .filter((team) => team.memberLogins.includes(author))
      .map((team) => team.name)
      .sort((a, b) => a.localeCompare(b));
  const calendarOf = (author: string) => {
    const team =
      all.find((entry) => entry.memberLogins.includes(author)) ??
      (readable[0] as (typeof readable)[number]);
    return { timezone: team.timezone, date: dates.get(team.name) ?? dailyDateFor(now, team) };
  };
  const canResolveFor = (author: string) =>
    author === login ||
    admin ||
    all.some((team) => team.memberLogins.includes(author) && managesTeam(login, team));
  const logins = [...new Set(readable.flatMap((team) => team.memberLogins))];
  const ids = [...(await getInstallationMemberIds(deps.db, installation.id, logins)).values()];
  const states = await listCurrentOpenBlockerStates(deps.db, installation.id, ids);
  const contextOf = (state: OpenBlockerState) => {
    const author = state.authorLogin.toLowerCase();
    const teams = teamsOf(author)
      .map((name) => byName.get(name))
      .filter((team) => team !== undefined);
    return {
      ...calendarOf(author),
      managers: new Set(teams.flatMap((team) => team.managerLogins)),
    };
  };
  const open = await buildOpenBlockers(deps, installation, states, contextOf);
  const latest = readable
    .map((team) => dates.get(team.name) ?? '')
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
  const latestDailies = await listLatestDailies(deps.db, installation.id, [
    ...new Set(resolvedRows.map((row) => row.authorMemberId)),
  ]);
  const stillListed = (row: (typeof resolvedRows)[number]) =>
    listsBlocker(latestDailies.get(row.authorMemberId)?.payload.blockers ?? [], row.blockerId);
  return {
    open: open.map((blocker) => {
      const calendar = calendarOf(blocker.author);
      return {
        ...blocker,
        teams: teamsOf(blocker.author),
        canResolve: canResolveFor(blocker.author),
        timezone: calendar.timezone,
        today: calendar.date,
      };
    }),
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
        canResolve: stillListed(row) && canResolveFor(author),
      };
    }),
  };
}
