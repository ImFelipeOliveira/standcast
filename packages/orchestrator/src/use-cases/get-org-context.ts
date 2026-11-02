import { teamsForMember } from '@standcast/core';
import { type MemberRow, operationalConfig } from '@standcast/db';
import type { Deps } from '../deps';
import { guarded } from '../guarded';
import { resolveTeams } from '../teams';
import { authorizeInstallation } from './authorize-installation';
import { isInstallationAdmin } from './is-installation-admin';
import type { MembershipCheck } from './org-context';

const TEAM_RESOLUTION_TIMEOUT_MS = 3000;

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
    isInstallationAdmin(deps, installation.id, current).catch(() => false),
    config
      ? guarded(
          resolveTeams(deps, installation.id, installation.accountLogin, config),
          [],
          TEAM_RESOLUTION_TIMEOUT_MS,
          'org context team resolution failed',
          { installationId: String(installation.id) },
        )
      : [],
  ]);
  return {
    admin,
    managerOf: (config?.teams ?? [])
      .filter((team) => team.managers.some((m) => m.toLowerCase() === login))
      .map((team) => team.name),
    memberOf: teamsForMember(login, resolved).map((team) => team.name),
  };
}
