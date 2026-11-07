import {
  parseTeamReference,
  type ResolvedTeam,
  type StandcastConfig,
  type TeamConfig,
} from '@standcast/core';
import type { Deps } from './deps';
import { guarded } from './guarded';
import { logError } from './log-error';
import { scopedTtlCache } from './ttl-cache';

export const TEAMS_CACHE_TTL_MS = 5 * 60 * 1000;
export const TEAM_FAILURE_TTL_MS = 60 * 1000;
const TEAM_LOOKUP_CONCURRENCY = 4;

export type TeamNotice = {
  team: string;
  reference: string;
  kind:
    | 'missing'
    | 'truncated'
    | 'managers_missing'
    | 'managers_truncated'
    | 'managers_unavailable'
    | 'channel_not_found'
    | 'channel_not_member'
    | 'space_not_linked'
    | 'space_not_found'
    | 'space_not_member';
};

type TeamListing = { logins: string[]; missing: boolean; truncated: boolean };

type TeamFailure = { error: unknown };

type TeamLookup = TeamListing | TeamFailure;

type Lookups = Map<string, TeamLookup>;

type ResolvedMembers = { logins: string[]; missing: string[]; truncated: string[] };

type ResolvedManagers = ResolvedMembers & { unavailable: string[] };

type ResolveDeps = Pick<Deps, 'github' | 'now'>;

type Scope = { installationId: number; owner: string };

type Octokit = Awaited<ReturnType<Deps['github']['installationOctokit']>>;

const listingsCache = scopedTtlCache<TeamListing>(TEAMS_CACHE_TTL_MS);

const failuresCache = scopedTtlCache<TeamFailure>(TEAM_FAILURE_TTL_MS);

const keyPrefix = (installationId: number) => `${installationId}:`;

export function invalidateResolvedTeams(deps: Pick<Deps, 'github'>, installationId: number): void {
  const prefix = keyPrefix(installationId);
  const matches = (key: string) => key.startsWith(prefix);
  listingsCache(deps.github).deleteWhere(matches);
  failuresCache(deps.github).deleteWhere(matches);
}

function referenceKey(scope: Scope, reference: string): string {
  return `${keyPrefix(scope.installationId)}${scope.owner.toLowerCase()}:${reference.toLowerCase()}`;
}

function isFailure(lookup: TeamLookup): lookup is TeamFailure {
  return 'error' in lookup;
}

function isOwnTeam(entry: string, owner: string): boolean {
  return parseTeamReference(entry)?.org.toLowerCase() === owner.toLowerCase();
}

function memberReferences(team: TeamConfig): string[] {
  return team.members.filter((entry) => parseTeamReference(entry) !== null);
}

function managerReferences(team: TeamConfig, owner: string): string[] {
  return team.managers.filter((entry) => isOwnTeam(entry, owner));
}

function explicitManagerLogins(team: TeamConfig): string[] {
  const explicit = team.managers.filter((entry) => parseTeamReference(entry) === null);
  return [...new Set(explicit.map((entry) => entry.toLowerCase()))];
}

function teamLookup(deps: ResolveDeps, scope: Scope): (reference: string) => Promise<TeamLookup> {
  let client: Promise<Octokit> | undefined;
  const octokit = () => {
    client ??= deps.github.installationOctokit(scope.installationId);
    return client;
  };
  return async (reference) => {
    const listings = listingsCache(deps.github);
    const failures = failuresCache(deps.github);
    const key = referenceKey(scope, reference);
    const now = deps.now().getTime();
    const cached = listings.get(key, now) ?? failures.get(key, now);
    if (cached) return cached;
    try {
      const resolved = await deps.github.resolveTeamMembers(await octokit(), scope.owner, [
        reference,
      ]);
      const listing: TeamListing = {
        logins: [...new Set(resolved.logins.map((login) => login.toLowerCase()))],
        missing: resolved.missingTeams.length > 0,
        truncated: resolved.truncatedTeams.length > 0,
      };
      listings.set(key, listing, deps.now().getTime());
      return listing;
    } catch (error) {
      logError('github team resolution failed', error, {
        installationId: String(scope.installationId),
      });
      const failure: TeamFailure = { error };
      failures.set(key, failure, deps.now().getTime());
      return failure;
    }
  };
}

async function lookupAll(
  references: string[],
  lookup: (reference: string) => Promise<TeamLookup>,
  found: Lookups = new Map(),
): Promise<Lookups> {
  const pending = [...new Map(references.map((r) => [r.toLowerCase(), r])).values()];
  const lane = async () => {
    while (pending.length > 0) {
      const reference = pending.shift() as string;
      found.set(reference.toLowerCase(), await lookup(reference));
    }
  };
  const lanes = Math.min(TEAM_LOOKUP_CONCURRENCY, pending.length);
  await Promise.all(Array.from({ length: lanes }, lane));
  return found;
}

function resolveMembers(team: TeamConfig, lookups: Lookups): ResolvedMembers {
  const logins = new Set<string>();
  const missing: string[] = [];
  const truncated: string[] = [];
  for (const entry of team.members) {
    const lookup = parseTeamReference(entry) ? lookups.get(entry.toLowerCase()) : undefined;
    if (!lookup) {
      logins.add(entry.toLowerCase());
      continue;
    }
    if (isFailure(lookup)) throw lookup.error;
    for (const login of lookup.logins) logins.add(login);
    if (lookup.missing) missing.push(entry);
    if (lookup.truncated) truncated.push(entry);
  }
  return { logins: [...logins].sort(), missing, truncated };
}

function resolveManagers(team: TeamConfig, owner: string, lookups: Lookups): ResolvedManagers {
  const logins = explicitManagerLogins(team);
  const seen = new Set(logins);
  const missing: string[] = [];
  const truncated: string[] = [];
  const unavailable: string[] = [];
  for (const entry of team.managers) {
    if (parseTeamReference(entry) === null) continue;
    if (!isOwnTeam(entry, owner)) {
      missing.push(entry);
      continue;
    }
    const lookup = lookups.get(entry.toLowerCase());
    if (!lookup || isFailure(lookup)) unavailable.push(entry);
    else if (lookup.missing) missing.push(entry);
    else if (lookup.truncated) truncated.push(entry);
    else {
      for (const login of lookup.logins) {
        if (seen.has(login)) continue;
        seen.add(login);
        logins.push(login);
      }
    }
  }
  return { logins, missing, truncated, unavailable };
}

async function resolveTeamsWithNotices(
  deps: ResolveDeps,
  installationId: number,
  owner: string,
  config: StandcastConfig,
): Promise<{ teams: ResolvedTeam[]; notices: TeamNotice[] }> {
  const references = config.teams.flatMap((team) => [
    ...memberReferences(team),
    ...managerReferences(team, owner),
  ]);
  const lookups = await lookupAll(references, teamLookup(deps, { installationId, owner }));
  const teams: ResolvedTeam[] = [];
  const notices: TeamNotice[] = [];
  for (const team of config.teams) {
    const members = resolveMembers(team, lookups);
    const managers = resolveManagers(team, owner, lookups);
    teams.push({ ...team, memberLogins: members.logins, managerLogins: managers.logins });
    const add = (references: string[], kind: TeamNotice['kind']) => {
      for (const reference of references) notices.push({ team: team.name, reference, kind });
    };
    add(members.missing, 'missing');
    add(members.truncated, 'truncated');
    add(managers.missing, 'managers_missing');
    add(managers.truncated, 'managers_truncated');
    add(managers.unavailable, 'managers_unavailable');
  }
  return { teams, notices };
}

export function explicitManagerTeams(config: StandcastConfig): ResolvedTeam[] {
  return config.teams.map((team) => ({
    ...team,
    memberLogins: [],
    managerLogins: explicitManagerLogins(team),
  }));
}

export async function resolveManagerTeams(
  deps: ResolveDeps,
  installationId: number,
  owner: string,
  config: StandcastConfig,
  timeoutMs: number,
): Promise<ResolvedTeam[]> {
  const references = config.teams.flatMap((team) => managerReferences(team, owner));
  const found: Lookups = new Map();
  await guarded(
    lookupAll(references, teamLookup(deps, { installationId, owner }), found),
    found,
    timeoutMs,
    'manager team resolution timed out',
    { installationId: String(installationId) },
  );
  const lookups = new Map(found);
  return config.teams.map((team) => ({
    ...team,
    memberLogins: [],
    managerLogins: resolveManagers(team, owner, lookups).logins,
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
