import { managesTeam, type TeamConfig } from '@standcast/core';
import { getInstallation, type MemberRow, operationalConfig } from '@standcast/db';
import type { Deps } from '../../deps';
import { currentLogin } from '../../membership';
import { resolveManagerTeams } from '../../teams';
import { isInstallationAdmin } from './is-installation-admin';

const MANAGER_TEAMS_TIMEOUT_MS = 3000;

export async function readableTeams(
  deps: Deps,
  installationId: number,
  member: MemberRow,
): Promise<TeamConfig[]> {
  const installation = await getInstallation(deps.db, installationId);
  const config = operationalConfig(installation);
  if (!installation || !config || config.teams.length === 0) return [];
  if (await isInstallationAdmin(deps, installationId, member)) return config.teams;
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
  return teams.filter((team) => managesTeam(login, team));
}
