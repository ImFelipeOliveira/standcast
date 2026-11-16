import { dailyDateFor, managesTeam, type ResolvedTeam, teamsForMember } from '@standcast/core';
import { type InstallationRow, type MemberRow, operationalConfig } from '@standcast/db';
import type { Deps } from '../../deps';
import { guarded } from '../../guarded';
import { resolveTeams } from '../../teams';
import { authorizeInstallation } from '../access/authorize-installation';
import { DomainError } from '../access/errors';
import { isInstallationAdmin } from '../access/is-installation-admin';
import type { MembershipCheck } from '../access/org-context';

const ADMIN_CHECK_TIMEOUT_MS = 3000;

export type AwayCaller = {
  member: MemberRow;
  installation: InstallationRow;
  login: string;
  teams: ResolvedTeam[];
};

export type AwayAccess = {
  caller: AwayCaller;
  login: string;
  self: boolean;
  today: string;
};

export async function loadAwayCaller(
  deps: Deps,
  isMember: MembershipCheck,
  member: MemberRow,
  installationId: number,
): Promise<AwayCaller> {
  const { member: current, installation } = await authorizeInstallation(
    deps,
    isMember,
    member,
    installationId,
  );
  const config = operationalConfig(installation);
  const teams = config
    ? await resolveTeams(deps, installation.id, installation.accountLogin, config)
    : [];
  return { member: current, installation, login: current.login.toLowerCase(), teams };
}

async function isAdmin(deps: Deps, caller: AwayCaller): Promise<boolean> {
  return guarded(
    isInstallationAdmin(deps, caller.installation.id, caller.member),
    false,
    ADMIN_CHECK_TIMEOUT_MS,
    'away access admin check failed',
    { installationId: String(caller.installation.id) },
  );
}

export async function awayAccessFor(
  deps: Deps,
  caller: AwayCaller,
  target: string | undefined,
): Promise<AwayAccess> {
  const login = (target ?? caller.login).toLowerCase();
  const self = login === caller.login;
  const [first] = teamsForMember(login, caller.teams);
  if (self) {
    if (!first) {
      throw new DomainError('not_in_team', 'you are not in any team of this organization');
    }
    return { caller, login, self, today: dailyDateFor(deps.now(), first) };
  }
  if (!first) {
    const elevated =
      caller.teams.some((team) => managesTeam(caller.login, team)) || (await isAdmin(deps, caller));
    if (!elevated) throw new DomainError('forbidden', 'you cannot act on this person');
    throw new DomainError('not_found', 'person not found in any team');
  }
  const elevated =
    teamsForMember(login, caller.teams).some((team) => managesTeam(caller.login, team)) ||
    (await isAdmin(deps, caller));
  if (!elevated) throw new DomainError('forbidden', 'you cannot act on this person');
  return { caller, login, self, today: dailyDateFor(deps.now(), first) };
}
