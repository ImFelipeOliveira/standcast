import {
  type ManagerTeam,
  type MemberTeam,
  parseTeamReference,
  type ResolvedTeam,
  type StandcastConfig,
  type TeamConfig,
} from '@standcast/core';
import type { Deps } from './deps';
import { guarded } from './guarded';
import { logError } from './log-error';
import { scopedTtlCache } from './ttl-cache';
import { withDeadline } from './with-deadline';

export const TEAMS_CACHE_TTL_MS = 5 * 60 * 1000;
export const TEAM_FAILURE_TTL_MS = 60 * 1000;
export const TEAM_READ_TIMEOUT_MS = 60 * 1000;
const MANAGER_NOTICES_TIMEOUT_MS = 2000;
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

type ResolvedMembers = {
  logins: string[];
  missing: string[];
  truncated: string[];
  failure?: TeamFailure;
};

type ResolvedManagers = Omit<ResolvedMembers, 'failure'> & { unavailable: string[] };

export type TeamResolution = { teams: ResolvedTeam[]; notices: TeamNotice[] };

type ResolveDeps = Pick<Deps, 'github' | 'now'>;

type Scope = { installationId: number; owner: string };

type Octokit = Awaited<ReturnType<Deps['github']['installationOctokit']>>;

const listingsCache = scopedTtlCache<TeamListing>(TEAMS_CACHE_TTL_MS);

const failuresCache = scopedTtlCache<TeamFailure>(TEAM_FAILURE_TTL_MS);

const pendingLookups = new WeakMap<object, Map<string, Promise<TeamLookup>>>();

function pendingFor(scope: object): Map<string, Promise<TeamLookup>> {
  const existing = pendingLookups.get(scope);
  if (existing) return existing;
  const created = new Map<string, Promise<TeamLookup>>();
  pendingLookups.set(scope, created);
  return created;
}

const keyPrefix = (installationId: number) => `${installationId}:`;

export function invalidateResolvedTeams(deps: Pick<Deps, 'github'>, installationId: number): void {
  const prefix = keyPrefix(installationId);
  const matches = (key: string) => key.startsWith(prefix);
  listingsCache(deps.github).deleteWhere(matches);
  failuresCache(deps.github).deleteWhere(matches);
  const pending = pendingFor(deps.github);
  for (const key of pending.keys()) if (matches(key)) pending.delete(key);
}

function referenceKey(scope: Scope, reference: string): string {
  return `${keyPrefix(scope.installationId)}${scope.owner.toLowerCase()}:${reference.toLowerCase()}`;
}

function isFailure(lookup: TeamLookup): lookup is TeamFailure {
  return 'error' in lookup;
}

export function isOwnTeam(entry: string, owner: string): boolean {
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

async function readTeam(
  deps: ResolveDeps,
  scope: Scope,
  octokit: () => Promise<Octokit>,
  reference: string,
): Promise<TeamLookup> {
  try {
    const resolved = await withDeadline(
      (async () => deps.github.resolveTeamMembers(await octokit(), scope.owner, [reference]))(),
      TEAM_READ_TIMEOUT_MS,
    );
    return {
      logins: [...new Set(resolved.logins.map((login) => login.toLowerCase()))],
      missing: resolved.missingTeams.length > 0,
      truncated: resolved.truncatedTeams.length > 0,
    };
  } catch (error) {
    logError('github team resolution failed', error, {
      installationId: String(scope.installationId),
    });
    return { error };
  }
}

function teamLookup(
  deps: ResolveDeps,
  scope: Scope,
): (reference: string, reuseFailure: boolean) => Promise<TeamLookup> {
  let client: Promise<Octokit> | undefined;
  const octokit = () => {
    client ??= deps.github.installationOctokit(scope.installationId);
    return client;
  };
  return (reference, reuseFailure) => {
    const listings = listingsCache(deps.github);
    const failures = failuresCache(deps.github);
    const pending = pendingFor(deps.github);
    const key = referenceKey(scope, reference);
    const now = deps.now().getTime();
    const cached = listings.get(key, now) ?? (reuseFailure ? failures.get(key, now) : undefined);
    if (cached) return Promise.resolve(cached);
    const inFlight = pending.get(key);
    if (inFlight) return inFlight;
    const read: Promise<TeamLookup> = readTeam(deps, scope, octokit, reference).then((lookup) => {
      if (pending.get(key) !== read) return lookup;
      pending.delete(key);
      if (isFailure(lookup)) failures.set(key, lookup, deps.now().getTime());
      else listings.set(key, lookup, deps.now().getTime());
      return lookup;
    });
    pending.set(key, read);
    return read;
  };
}

async function lookupAll(
  references: string[],
  lookup: (reference: string) => Promise<TeamLookup>,
  found: Lookups = new Map(),
): Promise<Lookups> {
  const unique = new Map<string, string>();
  for (const reference of references) {
    if (!unique.has(reference.toLowerCase())) unique.set(reference.toLowerCase(), reference);
  }
  const pending = [...unique.values()];
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
  let failure: TeamFailure | undefined;
  for (const entry of team.members) {
    const lookup = parseTeamReference(entry) ? lookups.get(entry.toLowerCase()) : undefined;
    if (!lookup) {
      logins.add(entry.toLowerCase());
      continue;
    }
    if (isFailure(lookup)) {
      failure ??= lookup;
      continue;
    }
    for (const login of lookup.logins) logins.add(login);
    if (lookup.missing) missing.push(entry);
    if (lookup.truncated) truncated.push(entry);
  }
  return { logins: [...logins].sort(), missing, truncated, ...(failure ? { failure } : {}) };
}

function memberLogins(team: TeamConfig, lookups: Lookups): string[] {
  const members = resolveMembers(team, lookups);
  if (members.failure) throw members.failure.error;
  return members.logins;
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

async function lookupTeams(
  deps: ResolveDeps,
  installationId: number,
  owner: string,
  config: StandcastConfig,
  withManagers: boolean,
  managersTimeoutMs?: number,
): Promise<Lookups> {
  const members = config.teams.flatMap(memberReferences);
  const memberKeys = new Set(members.map((reference) => reference.toLowerCase()));
  const managers = withManagers
    ? config.teams
        .flatMap((team) => managerReferences(team, owner))
        .filter((reference) => !memberKeys.has(reference.toLowerCase()))
    : [];
  const lookup = teamLookup(deps, { installationId, owner });
  const found: Lookups = new Map();
  const memberLookups = lookupAll(members, (reference) => lookup(reference, false), found);
  const managerLookups = lookupAll(managers, (reference) => lookup(reference, true), found);
  await Promise.all([
    memberLookups,
    managersTimeoutMs === undefined
      ? managerLookups
      : guarded(managerLookups, found, managersTimeoutMs, 'manager team resolution timed out', {
          installationId: String(installationId),
        }),
  ]);
  return new Map(found);
}

function resolveTeam(team: TeamConfig, owner: string, lookups: Lookups) {
  const members = resolveMembers(team, lookups);
  const managers = resolveManagers(team, owner, lookups);
  const notices: TeamNotice[] = [];
  const add = (references: string[], kind: TeamNotice['kind']) => {
    for (const reference of references) notices.push({ team: team.name, reference, kind });
  };
  add(members.missing, 'missing');
  add(members.truncated, 'truncated');
  add(managers.missing, 'managers_missing');
  add(managers.truncated, 'managers_truncated');
  add(managers.unavailable, 'managers_unavailable');
  return { members, managers, notices };
}

export async function resolveTeamsWithNotices(
  deps: ResolveDeps,
  installationId: number,
  owner: string,
  config: StandcastConfig,
): Promise<TeamResolution> {
  const lookups = await lookupTeams(deps, installationId, owner, config, true);
  const teams: ResolvedTeam[] = [];
  const notices: TeamNotice[] = [];
  for (const team of config.teams) {
    const resolved = resolveTeam(team, owner, lookups);
    if (resolved.members.failure) throw resolved.members.failure.error;
    teams.push({
      ...team,
      memberLogins: resolved.members.logins,
      managerLogins: resolved.managers.logins,
    });
    notices.push(...resolved.notices);
  }
  return { teams, notices };
}

export async function resolveManagerTeams(
  deps: ResolveDeps,
  installationId: number,
  owner: string,
  config: StandcastConfig,
  timeoutMs: number,
): Promise<ManagerTeam[]> {
  const references = config.teams.flatMap((team) => managerReferences(team, owner));
  const lookup = teamLookup(deps, { installationId, owner });
  const found: Lookups = new Map();
  await guarded(
    lookupAll(references, (reference) => lookup(reference, true), found),
    found,
    timeoutMs,
    'manager team resolution timed out',
    { installationId: String(installationId) },
  );
  const lookups = new Map(found);
  return config.teams.map((team) => ({
    ...team,
    managerLogins: resolveManagers(team, owner, lookups).logins,
  }));
}

export async function resolveMemberTeams(
  deps: ResolveDeps,
  installationId: number,
  owner: string,
  config: StandcastConfig,
): Promise<MemberTeam[]> {
  const lookups = await lookupTeams(deps, installationId, owner, config, false);
  return config.teams.map((team) => ({ ...team, memberLogins: memberLogins(team, lookups) }));
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
  const lookups = await lookupTeams(
    deps,
    installationId,
    owner,
    config,
    true,
    MANAGER_NOTICES_TIMEOUT_MS,
  );
  return config.teams.flatMap((team) => resolveTeam(team, owner, lookups).notices);
}
