import { describe, expect, spyOn, test } from 'bun:test';
import { parseConfig, type StandcastConfig } from '@standcast/core';
import type { Deps } from '../src';
import {
  explicitManagerTeams,
  invalidateResolvedTeams,
  resolveTeams,
  TEAMS_CACHE_TTL_MS,
  teamResolutionNotices,
} from '../src';

const source = `
teams:
  - name: Alpha
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [Boss]
    members: [Alice, "@acme/backend"]
    chat: { provider: slack, channel: "#alpha" }
  - name: Beta
    timezone: UTC
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [Boss]
    members: [carol]
    chat: { provider: slack, channel: "#beta" }
`;

describe('resolveTeams', () => {
  test('expands github teams', async () => {
    const parsed = parseConfig(source);
    if (!parsed.ok) throw new Error('bad config');
    const octokit = {};
    const calls: unknown[][] = [];
    const deps = {
      now: () => new Date(),
      github: {
        installationOctokit: async (id: number) => {
          calls.push(['octokit', id]);
          return octokit;
        },
        resolveTeamMembers: async (_o: unknown, owner: string, members: string[]) => {
          calls.push([owner, members]);
          return {
            logins: members.flatMap((m) => (m === '@acme/backend' ? ['Bob', 'DAVE'] : [m])),
            missingTeams: [],
            truncatedTeams: [],
          };
        },
      },
    } as unknown as Deps;

    const teams = await resolveTeams(deps, 7, 'acme', parsed.config);

    expect(teams.map((t) => t.name)).toEqual(['Alpha', 'Beta']);
    expect(teams[0]?.memberLogins).toEqual(['alice', 'bob', 'dave']);
    expect(teams[1]?.memberLogins).toEqual(['carol']);
    expect(calls[0]).toEqual(['octokit', 7]);
  });

  function counting() {
    let now = new Date('2026-10-28T15:00:00Z');
    const resolved: string[][] = [];
    const deps = {
      now: () => now,
      github: {
        installationOctokit: async () => ({}),
        resolveTeamMembers: async (_o: unknown, _owner: string, members: string[]) => {
          resolved.push(members);
          return { logins: members, missingTeams: [], truncatedTeams: [] };
        },
      },
    } as unknown as Deps;
    const advance = (ms: number) => {
      now = new Date(now.getTime() + ms);
    };
    return { deps, resolved, advance };
  }

  function parsed(): StandcastConfig {
    const result = parseConfig(source);
    if (!result.ok) throw new Error('bad config');
    return result.config;
  }

  test('caches resolved members per installation for five minutes', async () => {
    const { deps, resolved, advance } = counting();
    await resolveTeams(deps, 7, 'acme', parsed());
    await resolveTeams(deps, 7, 'acme', parsed());
    expect(resolved).toHaveLength(2);
    await resolveTeams(deps, 8, 'acme', parsed());
    expect(resolved).toHaveLength(4);
    advance(TEAMS_CACHE_TTL_MS + 1);
    await resolveTeams(deps, 7, 'acme', parsed());
    expect(resolved).toHaveLength(6);
  });

  test('a changed member list misses the cache', async () => {
    const { deps, resolved } = counting();
    const config = parsed();
    await resolveTeams(deps, 7, 'acme', config);
    const [alpha, beta] = config.teams;
    if (!alpha || !beta) throw new Error('teams');
    await resolveTeams(deps, 7, 'acme', {
      ...config,
      teams: [alpha, { ...beta, members: ['erin'] }],
    });
    expect(resolved).toEqual([['Alice', '@acme/backend'], ['carol'], ['erin']]);
  });

  test('invalidation drops the installation entries only', async () => {
    const { deps, resolved } = counting();
    await resolveTeams(deps, 7, 'acme', parsed());
    await resolveTeams(deps, 8, 'acme', parsed());
    invalidateResolvedTeams(deps, 7);
    await resolveTeams(deps, 7, 'acme', parsed());
    await resolveTeams(deps, 8, 'acme', parsed());
    expect(resolved).toHaveLength(6);
  });
});

const managerSource = (managers: string) => `
teams:
  - name: Alpha
    timezone: UTC
    remind_at: "09:00"
    digest_at: "10:00"
    managers: ${managers}
    members: [alice]
    chat: { provider: slack, channel: "#alpha" }
  - name: Beta
    timezone: UTC
    remind_at: "09:00"
    digest_at: "10:00"
    managers: ["@acme/leads"]
    members: [carol]
    chat: { provider: slack, channel: "#beta" }
`;

type Listing = { logins: string[]; missing?: boolean; truncated?: boolean } | 'error';

function managerDeps(listings: Record<string, Listing>) {
  const calls: string[][] = [];
  const deps = {
    now: () => new Date('2026-10-28T15:00:00Z'),
    github: {
      installationOctokit: async () => ({}),
      resolveTeamMembers: async (_o: unknown, _owner: string, members: string[]) => {
        calls.push(members);
        const logins: string[] = [];
        const missingTeams: string[] = [];
        const truncatedTeams: string[] = [];
        for (const member of members) {
          const listing = listings[member];
          if (listing === 'error') throw Object.assign(new Error('boom'), { status: 502 });
          if (!listing) {
            logins.push(member);
            continue;
          }
          logins.push(...listing.logins);
          if (listing.missing) missingTeams.push(member);
          if (listing.truncated) truncatedTeams.push(member);
        }
        return { logins, missingTeams, truncatedTeams };
      },
    },
  } as unknown as Deps;
  return { deps, calls };
}

function managerConfig(managers: string): StandcastConfig {
  const result = parseConfig(managerSource(managers));
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.config;
}

describe('resolveTeams managers', () => {
  test('expands manager teams into deduplicated lowercase managerLogins', async () => {
    const { deps } = managerDeps({ '@acme/leads': { logins: ['Dave', 'boss', 'erin'] } });
    const teams = await resolveTeams(deps, 7, 'acme', managerConfig('[Boss, "@acme/leads"]'));
    expect(teams[0]?.managerLogins).toEqual(['boss', 'dave', 'erin']);
    expect(teams[1]?.managerLogins).toEqual(['boss', 'dave', 'erin']);
    expect(teams[0]?.managers).toEqual(['Boss', '@acme/leads']);
  });

  test('explicit manager logins need no GitHub call', async () => {
    const { deps, calls } = managerDeps({});
    const config = managerConfig('[Boss, Zed]');
    const alpha = config.teams[0];
    if (!alpha) throw new Error('team');
    const teams = await resolveTeams(deps, 7, 'acme', { ...config, teams: [alpha] });
    expect(teams[0]?.managerLogins).toEqual(['boss', 'zed']);
    expect(calls).toEqual([['alice']]);
  });

  test('a manager team is resolved once and cached across teams', async () => {
    const { deps, calls } = managerDeps({ '@acme/leads': { logins: ['dave'] } });
    await resolveTeams(deps, 7, 'acme', managerConfig('["@acme/leads"]'));
    await resolveTeams(deps, 7, 'acme', managerConfig('["@acme/leads"]'));
    expect(calls.filter((c) => c.includes('@acme/leads'))).toEqual([['@acme/leads']]);
  });

  test('invalidation drops cached manager teams', async () => {
    const { deps, calls } = managerDeps({ '@acme/leads': { logins: ['dave'] } });
    await resolveTeams(deps, 7, 'acme', managerConfig('["@acme/leads"]'));
    invalidateResolvedTeams(deps, 7);
    await resolveTeams(deps, 7, 'acme', managerConfig('["@acme/leads"]'));
    expect(calls.filter((c) => c.includes('@acme/leads'))).toHaveLength(2);
  });

  test('a missing manager team grants nothing and raises a managers notice', async () => {
    const { deps } = managerDeps({ '@acme/leads': { logins: [], missing: true } });
    const config = managerConfig('[boss, "@acme/leads"]');
    const teams = await resolveTeams(deps, 7, 'acme', config);
    expect(teams[0]?.managerLogins).toEqual(['boss']);
    expect(teams[1]?.managerLogins).toEqual([]);
    expect(await teamResolutionNotices(deps, 7, 'acme', config)).toEqual([
      { team: 'Alpha', reference: '@acme/leads', kind: 'managers_missing' },
      { team: 'Beta', reference: '@acme/leads', kind: 'managers_missing' },
    ]);
  });

  test('a truncated manager team grants nothing and raises a managers notice', async () => {
    const { deps } = managerDeps({ '@acme/leads': { logins: ['dave'], truncated: true } });
    const config = managerConfig('[boss, "@acme/leads"]');
    const teams = await resolveTeams(deps, 7, 'acme', config);
    expect(teams[0]?.managerLogins).toEqual(['boss']);
    expect(teams[1]?.managerLogins).toEqual([]);
    const notices = await teamResolutionNotices(deps, 7, 'acme', config);
    expect(notices[0]).toEqual({
      team: 'Alpha',
      reference: '@acme/leads',
      kind: 'managers_truncated',
    });
  });

  test('a GitHub error on a manager team fails closed, keeps explicit logins and is retried', async () => {
    const errors = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const listings: Record<string, Listing> = { '@acme/leads': 'error' };
      const { deps, calls } = managerDeps(listings);
      const config = managerConfig('[boss, "@acme/leads"]');
      const teams = await resolveTeams(deps, 7, 'acme', config);
      expect(teams.map((t) => t.managerLogins)).toEqual([['boss'], []]);
      expect(teams[0]?.memberLogins).toEqual(['alice']);
      listings['@acme/leads'] = { logins: ['dave'] };
      const again = await resolveTeams(deps, 7, 'acme', config);
      expect(again[1]?.managerLogins).toEqual(['dave']);
      expect(calls.filter((c) => c.includes('@acme/leads'))).toHaveLength(3);
      expect(String(errors.mock.calls[0]?.[0])).toBe('manager team resolution failed');
    } finally {
      errors.mockRestore();
    }
  });

  test('a manager team of another organization is never queried and grants nothing', async () => {
    const { deps, calls } = managerDeps({ '@other/leads': { logins: ['mallory'] } });
    const config = managerConfig('[boss, "@other/leads"]');
    const teams = await resolveTeams(deps, 7, 'acme', config);
    expect(teams[0]?.managerLogins).toEqual(['boss']);
    expect(calls.some((c) => c.includes('@other/leads'))).toBe(false);
    const notices = await teamResolutionNotices(deps, 7, 'acme', config);
    expect(notices).toContainEqual({
      team: 'Alpha',
      reference: '@other/leads',
      kind: 'managers_missing',
    });
  });

  test('explicitManagerTeams keeps only explicit manager logins', () => {
    const teams = explicitManagerTeams(managerConfig('[Boss, "@acme/leads"]'));
    expect(teams.map((t) => t.managerLogins)).toEqual([['boss'], []]);
    expect(teams.map((t) => t.memberLogins)).toEqual([[], []]);
  });
});
