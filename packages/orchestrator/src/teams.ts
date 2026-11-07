import {
  parseTeamReference,
  type ResolvedTeam,
  type StandcastConfig,
  type TeamConfig,
} from '@standcast/core';
import type { Deps } from './deps';
import { logError } from './log-error';
import { scopedTtlCache } from './ttl-cache';

export const TEAMS_CACHE_TTL_MS = 5 * 60 * 1000;

export type TeamNotice = {
  team: string;
  reference: string;
  kind:
    | 'missing'
    | 'truncated'
    | 'managers_missing'
    | 'managers_truncated'
    | 'channel_not_found'
    | 'channel_not_member'
    | 'space_not_linked'
    | 'space_not_found'
    | 'space_not_member';
};

type CachedTeam = { logins: string[]; missingTeams: string[]; truncatedTeams: string[] };

type ManagerTeam = { logins: string[]; missing: boolean; truncated: boolean };

type ResolvedManagers = { logins: string[]; missing: string[]; truncated: string[] };

type ResolveDeps = Pick<Deps, 'github' | 'now'>;

type Octokit = Awaited<ReturnType<Deps['github']['installationOctokit']>>;

const membersCache = scopedTtlCache<CachedTeam>(TEAMS_CACHE_TTL_MS);

const managerTeamsCache = scopedTtlCache<ManagerTeam>(TEAMS_CACHE_TTL_MS);

const keyPrefix = (installationId: number) => `${installationId}:`;

export function invalidateResolvedTeams(deps: Pick<Deps, 'github'>, installationId: number): void {
  const prefix = keyPrefix(installationId);
  membersCache(deps.github).deleteWhere((key) => key.startsWith(prefix));
  managerTeamsCache(deps.github).deleteWhere((key) => key.startsWith(prefix));
}

async function resolveManagerTeam(
  deps: ResolveDeps,
  installationId: number,
  owner: string,
  reference: string,
  octokit: () => Promise<Octokit>,
): Promise<ManagerTeam | null> {
  const cache = managerTeamsCache(deps.github);
  const key = `${keyPrefix(installationId)}${owner.toLowerCase()}:${reference.toLowerCase()}`;
  const cached = cache.get(key, deps.now().getTime());
  if (cached) return cached;
  try {
    const resolved = await deps.github.resolveTeamMembers(await octokit(), owner, [reference]);
    const entry: ManagerTeam = {
      logins: [...new Set(resolved.logins.map((l) => l.toLowerCase()))],
      missing: resolved.missingTeams.length > 0,
      truncated: resolved.truncatedTeams.length > 0,
    };
    cache.set(key, entry, deps.now().getTime());
    return entry;
  } catch (error) {
    logError('manager team resolution failed', error, { installationId: String(installationId) });
    return null;
  }
}

async function resolveManagers(
  deps: ResolveDeps,
  installationId: number,
  owner: string,
  team: TeamConfig,
  octokit: () => Promise<Octokit>,
): Promise<ResolvedManagers> {
  const logins = new Set<string>();
  const missing: string[] = [];
  const truncated: string[] = [];
  for (const entry of team.managers) {
    const reference = parseTeamReference(entry);
    if (!reference) {
      logins.add(entry.toLowerCase());
      continue;
    }
    if (reference.org.toLowerCase() !== owner.toLowerCase()) {
      missing.push(entry);
      continue;
    }
    const resolved = await resolveManagerTeam(deps, installationId, owner, entry, octokit);
    if (!resolved) continue;
    if (resolved.missing) missing.push(entry);
    else if (resolved.truncated) truncated.push(entry);
    else for (const login of resolved.logins) logins.add(login);
  }
  return { logins: [...logins].sort(), missing, truncated };
}

async function resolveTeamsWithNotices(
  deps: ResolveDeps,
  installationId: number,
  owner: string,
  config: StandcastConfig,
): Promise<{ teams: ResolvedTeam[]; notices: TeamNotice[] }> {
  const cache = membersCache(deps.github);
  let client: Promise<Octokit> | undefined;
  const octokit = () => {
    client ??= deps.github.installationOctokit(installationId);
    return client;
  };
  const teams: ResolvedTeam[] = [];
  const notices: TeamNotice[] = [];
  for (const team of config.teams) {
    const key = `${keyPrefix(installationId)}${owner.toLowerCase()}:${JSON.stringify(team.members)}`;
    let entry = cache.get(key, deps.now().getTime());
    if (!entry) {
      const resolved = await deps.github.resolveTeamMembers(await octokit(), owner, team.members);
      entry = {
        logins: [...new Set(resolved.logins.map((l) => l.toLowerCase()))],
        missingTeams: resolved.missingTeams,
        truncatedTeams: resolved.truncatedTeams,
      };
      cache.set(key, entry, deps.now().getTime());
    }
    const managers = await resolveManagers(deps, installationId, owner, team, octokit);
    teams.push({ ...team, memberLogins: entry.logins, managerLogins: managers.logins });
    for (const reference of entry.missingTeams) {
      notices.push({ team: team.name, reference, kind: 'missing' });
    }
    for (const reference of entry.truncatedTeams) {
      notices.push({ team: team.name, reference, kind: 'truncated' });
    }
    for (const reference of managers.missing) {
      notices.push({ team: team.name, reference, kind: 'managers_missing' });
    }
    for (const reference of managers.truncated) {
      notices.push({ team: team.name, reference, kind: 'managers_truncated' });
    }
  }
  return { teams, notices };
}

export function explicitManagerTeams(config: StandcastConfig): ResolvedTeam[] {
  return config.teams.map((team) => ({
    ...team,
    memberLogins: [],
    managerLogins: [
      ...new Set(
        team.managers
          .filter((entry) => parseTeamReference(entry) === null)
          .map((entry) => entry.toLowerCase()),
      ),
    ].sort(),
  }));
}

export async function resolveTeams(
  deps: ResolveDeps,
  installationId: number,
  owner: string,
  config: StandcastConfig,
): Promise<ResolvedTeam[]> {
  return (await resolveTeamsWithNotices(deps, installationId, owner, config)).teams;
}

export async function teamResolutionNotices(
  deps: ResolveDeps,
  installationId: number,
  owner: string,
  config: StandcastConfig,
): Promise<TeamNotice[]> {
  return (await resolveTeamsWithNotices(deps, installationId, owner, config)).notices;
}
