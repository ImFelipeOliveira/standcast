import { managesTeam, type TeamConfig } from '@standcast/core';
import { getInstallation, type MemberRow, operationalConfig } from '@standcast/db';
import type { Deps } from '../../deps';
import { guarded } from '../../guarded';
import { currentLogin } from '../../membership';
import { resolveManagerTeams } from '../../teams';
import { isInstallationAdmin } from './is-installation-admin';

const MANAGER_TEAMS_TIMEOUT_MS = 3000;
const ADMIN_CHECK_TIMEOUT_MS = 3000;

export async function readableTeams(
  deps: Deps,
  installationId: number,
  member: MemberRow,
): Promise<TeamConfig[]> {
  const installation = await getInstallation(deps.db, installationId);
  const config = operationalConfig(installation);
  if (!installation || !config || config.teams.length === 0) return [];
  const octokit = await deps.github.installationOctokit(installationId);
  const login = (await currentLogin(deps, octokit, member.githubUserId))?.toLowerCase();
  if (login === undefined) return [];
  const teams = await resolveManagerTeams(
    deps,
    installationId,
    installation.accountLogin,
    config,
    MANAGER_TEAMS_TIMEOUT_MS,
  );
  const managed = teams.filter((team) => managesTeam(login, team));
  if (managed.length === teams.length) return config.teams;
  const admin = await guarded(
    isInstallationAdmin(deps, installationId, member),
    false,
    ADMIN_CHECK_TIMEOUT_MS,
    'readable teams admin check failed',
    { installationId: String(installationId) },
  );
  return admin ? config.teams : managed;
}
