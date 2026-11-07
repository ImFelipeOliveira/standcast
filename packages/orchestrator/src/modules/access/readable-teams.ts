import { managesTeam, type ResolvedTeam } from '@standcast/core';
import { getInstallation, type MemberRow, operationalConfig } from '@standcast/db';
import type { Deps } from '../../deps';
import { logError } from '../../log-error';
import { currentLogin } from '../../membership';
import { explicitManagerTeams, resolveTeams } from '../../teams';
import { isInstallationAdmin } from './is-installation-admin';

async function configuredTeams(deps: Deps, installationId: number): Promise<ResolvedTeam[]> {
  const installation = await getInstallation(deps.db, installationId);
  const config = operationalConfig(installation);
  if (!installation || !config) return [];
  try {
    return await resolveTeams(deps, installationId, installation.accountLogin, config);
  } catch (error) {
    logError('readable teams resolution failed', error, { installationId: String(installationId) });
    return explicitManagerTeams(config);
  }
}

export async function readableTeams(
  deps: Deps,
  installationId: number,
  member: MemberRow,
): Promise<ResolvedTeam[]> {
  const teams = await configuredTeams(deps, installationId);
  if (teams.length === 0) return [];
  const octokit = await deps.github.installationOctokit(installationId);
  const login = (await currentLogin(deps, octokit, member.githubUserId))?.toLowerCase();
  const managed = teams.filter((team) => login !== undefined && managesTeam(login, team));
  if (managed.length === teams.length) return managed;
  return (await isInstallationAdmin(deps, installationId, member)) ? teams : managed;
}
