import { managesTeam, teamsForMember } from '@standcast/core';
import { type MemberRow, operationalConfig } from '@standcast/db';
import type { Deps } from '../../deps';
import { guarded } from '../../guarded';
import { explicitManagerTeams, resolveTeams } from '../../teams';
import { authorizeInstallation } from '../access/authorize-installation';
import { isInstallationAdmin } from '../access/is-installation-admin';
import type { MembershipCheck } from '../access/org-context';

const TEAM_RESOLUTION_TIMEOUT_MS = 3000;
const ADMIN_CHECK_TIMEOUT_MS = 3000;

export type OrgMemberContext = { admin: boolean; managerOf: string[]; memberOf: string[] };

export async function getOrgContext(
  deps: Deps,
  isMember: MembershipCheck,
  member: MemberRow,
  installationId: number | undefined,
): Promise<OrgMemberContext> {
  const { member: current, installation } = await authorizeInstallation(
    deps,
    isMember,
    member,
    installationId,
  );
  const config = operationalConfig(installation);
  const login = current.login.toLowerCase();
  const [admin, resolved] = await Promise.all([
    guarded(
      isInstallationAdmin(deps, installation.id, current),
      false,
      ADMIN_CHECK_TIMEOUT_MS,
      'org context admin check failed',
      { installationId: String(installation.id) },
    ),
    config
      ? guarded(
          resolveTeams(deps, installation.id, installation.accountLogin, config),
          explicitManagerTeams(config),
          TEAM_RESOLUTION_TIMEOUT_MS,
          'org context team resolution failed',
          { installationId: String(installation.id) },
        )
      : [],
  ]);
  return {
    admin,
    managerOf: resolved.filter((team) => managesTeam(login, team)).map((team) => team.name),
    memberOf: teamsForMember(login, resolved).map((team) => team.name),
  };
}
