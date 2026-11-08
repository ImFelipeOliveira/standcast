import { describe, expect, spyOn, test } from 'bun:test';
import { parseConfig, type StandcastConfig } from '@standcast/core';
import type { Deps } from '../src';
import {
  invalidateResolvedTeams,
  resolveManagerTeams,
  resolveMemberTeams,
  resolveTeams,
  TEAM_FAILURE_TTL_MS,
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
    expect(resolved).toHaveLength(1);
    await resolveTeams(deps, 8, 'acme', parsed());
    expect(resolved).toHaveLength(2);
    advance(TEAMS_CACHE_TTL_MS + 1);
    await resolveTeams(deps, 7, 'acme', parsed());
    expect(resolved).toHaveLength(3);
  });

  test('explicit member logins need no GitHub call and only a new team reference is fetched', async () => {
    const { deps, resolved } = counting();
    const config = parsed();
    await resolveTeams(deps, 7, 'acme', config);
    const [alpha, beta] = config.teams;
    if (!alpha || !beta) throw new Error('teams');
    await resolveTeams(deps, 7, 'acme', {
      ...config,
      teams: [alpha, { ...beta, members: ['erin', '@acme/frontend'] }],
    });
    expect(resolved).toEqual([['@acme/backend'], ['@acme/frontend']]);
  });

  test('a team reference in members and managers of several teams is fetched once', async () => {
    const { deps, resolved } = counting();
    const config = parsed();
    const [alpha, beta] = config.teams;
    if (!alpha || !beta) throw new Error('teams');
    const teams = await resolveTeams(deps, 7, 'acme', {
      ...config,
      teams: [
        { ...alpha, managers: ['@acme/backend'] },
        { ...beta, members: ['@ACME/backend'], managers: ['@acme/backend'] },
      ],
    });
    expect(resolved).toEqual([['@acme/backend']]);
    expect(teams.map((t) => t.managerLogins)).toEqual([['@acme/backend'], ['@acme/backend']]);
  });

  test('distinct team references are fetched concurrently', async () => {
    const config = parsed();
    const [alpha] = config.teams;
    if (!alpha) throw new Error('teams');
    const started: string[] = [];
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const deps = {
      now: () => new Date('2026-10-28T15:00:00Z'),
      github: {
        installationOctokit: async () => ({}),
        resolveTeamMembers: async (_o: unknown, _owner: string, members: string[]) => {
          started.push(...members);
          await gate;
          return { logins: [], missingTeams: [], truncatedTeams: [] };
        },
      },
    } as unknown as Deps;
    const pending = resolveTeams(deps, 9, 'acme', {
      ...config,
      teams: [{ ...alpha, members: ['@acme/a', '@acme/b'], managers: ['@acme/c'] }],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toEqual(['@acme/a', '@acme/b', '@acme/c']);
    release();
    await pending;
  });

  test('invalidation drops the installation entries only', async () => {
    const { deps, resolved } = counting();
    await resolveTeams(deps, 7, 'acme', parsed());
    await resolveTeams(deps, 8, 'acme', parsed());
    invalidateResolvedTeams(deps, 7);
    await resolveTeams(deps, 7, 'acme', parsed());
    await resolveTeams(deps, 8, 'acme', parsed());
    expect(resolved).toHaveLength(3);
  });

  test('concurrent resolutions share one read of a team', async () => {
    const { deps, calls, release } = gatedDeps([{ logins: ['Bob'], gated: true }]);
    const first = resolveTeams(deps, 7, 'acme', parsed());
    const second = resolveTeams(deps, 7, 'acme', parsed());
    await tick();
    expect(calls).toEqual([['@acme/backend']]);
    release();
    const results = await Promise.all([first, second]);
    expect(results.map((teams) => teams[0]?.memberLogins)).toEqual([
      ['alice', 'bob'],
      ['alice', 'bob'],
    ]);
    await resolveTeams(deps, 7, 'acme', parsed());
    expect(calls).toHaveLength(1);
  });

  test('a read invalidated while in flight is not cached', async () => {
    const { deps, calls, release } = gatedDeps([
      { logins: ['Old'], gated: true },
      { logins: ['New'], gated: false },
    ]);
    const stale = resolveTeams(deps, 7, 'acme', parsed());
    await tick();
    invalidateResolvedTeams(deps, 7);
    const fresh = await resolveTeams(deps, 7, 'acme', parsed());
    expect(fresh[0]?.memberLogins).toEqual(['alice', 'new']);
    release();
    expect((await stale)[0]?.memberLogins).toEqual(['alice', 'old']);
    const cached = await resolveTeams(deps, 7, 'acme', parsed());
    expect(cached[0]?.memberLogins).toEqual(['alice', 'new']);
    expect(calls).toHaveLength(2);
  });
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function gatedDeps(answers: { logins: string[]; gated: boolean }[]) {
  const calls: string[][] = [];
  const gates: (() => void)[] = [];
  const deps = {
    now: () => new Date('2026-10-28T15:00:00Z'),
    github: {
      installationOctokit: async () => ({}),
      resolveTeamMembers: async (_o: unknown, _owner: string, members: string[]) => {
        const answer = answers[calls.length] ?? { logins: [], gated: false };
        calls.push(members);
        if (answer.gated) await new Promise<void>((resolve) => gates.push(resolve));
        return { logins: answer.logins, missingTeams: [], truncatedTeams: [] };
      },
    },
  } as unknown as Deps;
  const release = () => {
    for (const open of gates.splice(0)) open();
  };
  return { deps, calls, release };
}

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

type Listing = { logins: string[]; missing?: boolean; truncated?: boolean } | 'error' | 'hang';

function managerDeps(listings: Record<string, Listing>) {
  const calls: string[][] = [];
  let now = new Date('2026-10-28T15:00:00Z');
  const deps = {
    now: () => now,
    github: {
      installationOctokit: async () => ({}),
      resolveTeamMembers: async (_o: unknown, _owner: string, members: string[]) => {
        calls.push(members);
        const logins: string[] = [];
        const missingTeams: string[] = [];
        const truncatedTeams: string[] = [];
        for (const member of members) {
          const listing = listings[member];
          if (listing === 'hang') return await new Promise<never>(() => {});
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
  const advance = (ms: number) => {
    now = new Date(now.getTime() + ms);
  };
  return { deps, calls, advance };
}

function managerConfig(managers: string): StandcastConfig {
  const result = parseConfig(managerSource(managers));
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.config;
}

describe('resolveTeams managers', () => {
  test('expands manager teams into deduplicated lowercase managerLogins in config order', async () => {
    const { deps } = managerDeps({ '@acme/leads': { logins: ['Dave', 'boss', 'erin'] } });
    const teams = await resolveTeams(deps, 7, 'acme', managerConfig('["@acme/leads", Zed, Boss]'));
    expect(teams[0]?.managerLogins).toEqual(['zed', 'boss', 'dave', 'erin']);
    expect(teams[1]?.managerLogins).toEqual(['dave', 'boss', 'erin']);
    expect(teams[0]?.managers).toEqual(['@acme/leads', 'Zed', 'Boss']);
  });

  test('explicit manager logins need no GitHub call', async () => {
    const { deps, calls } = managerDeps({});
    const config = managerConfig('[Boss, Zed]');
    const alpha = config.teams[0];
    if (!alpha) throw new Error('team');
    const teams = await resolveTeams(deps, 7, 'acme', { ...config, teams: [alpha] });
    expect(teams[0]?.managerLogins).toEqual(['boss', 'zed']);
    expect(calls).toEqual([]);
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

  test('a GitHub error on a manager team fails closed, keeps explicit logins and raises a notice', async () => {
    const errors = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { deps } = managerDeps({ '@acme/leads': 'error' });
      const config = managerConfig('[boss, "@acme/leads"]');
      const teams = await resolveTeams(deps, 7, 'acme', config);
      expect(teams.map((t) => t.managerLogins)).toEqual([['boss'], []]);
      expect(teams[0]?.memberLogins).toEqual(['alice']);
      expect(await teamResolutionNotices(deps, 7, 'acme', config)).toEqual([
        { team: 'Alpha', reference: '@acme/leads', kind: 'managers_unavailable' },
        { team: 'Beta', reference: '@acme/leads', kind: 'managers_unavailable' },
      ]);
      expect(String(errors.mock.calls[0]?.[0])).toBe('github team resolution failed');
    } finally {
      errors.mockRestore();
    }
  });

  test('a failed manager team is not asked again until the failure expires', async () => {
    const errors = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const listings: Record<string, Listing> = { '@acme/leads': 'error' };
      const { deps, calls, advance } = managerDeps(listings);
      const config = managerConfig('[boss, "@acme/leads"]');
      await resolveTeams(deps, 7, 'acme', config);
      listings['@acme/leads'] = { logins: ['dave'] };
      const cached = await resolveTeams(deps, 7, 'acme', config);
      expect(cached[1]?.managerLogins).toEqual([]);
      expect(calls).toEqual([['@acme/leads']]);
      advance(TEAM_FAILURE_TTL_MS + 1);
      const again = await resolveTeams(deps, 7, 'acme', config);
      expect(again[1]?.managerLogins).toEqual(['dave']);
      expect(calls).toEqual([['@acme/leads'], ['@acme/leads']]);
    } finally {
      errors.mockRestore();
    }
  });

  test('a failing manager team does not affect the other manager teams', async () => {
    const errors = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { deps } = managerDeps({
        '@acme/leads': 'error',
        '@acme/oncall': { logins: ['Olga'] },
      });
      const config = managerConfig('[boss, "@acme/leads", "@acme/oncall"]');
      const teams = await resolveTeams(deps, 7, 'acme', config);
      expect(teams.map((t) => t.managerLogins)).toEqual([['boss', 'olga'], []]);
    } finally {
      errors.mockRestore();
    }
  });

  test('a failing member team still fails the resolution', async () => {
    const errors = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { deps } = managerDeps({ '@acme/backend': 'error' });
      const config = managerConfig('[boss]');
      const [alpha] = config.teams;
      if (!alpha) throw new Error('team');
      const failing = { ...config, teams: [{ ...alpha, members: ['@acme/backend'] }] };
      await expect(resolveTeams(deps, 7, 'acme', failing)).rejects.toThrow('boom');
    } finally {
      errors.mockRestore();
    }
  });

  test('a failed member team is asked again on the next resolution', async () => {
    const errors = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const listings: Record<string, Listing> = { '@acme/backend': 'error' };
      const { deps, calls } = managerDeps(listings);
      const config = managerConfig('[boss]');
      const [alpha] = config.teams;
      if (!alpha) throw new Error('team');
      const failing = { ...config, teams: [{ ...alpha, members: ['@acme/backend'] }] };
      await expect(resolveTeams(deps, 7, 'acme', failing)).rejects.toThrow('boom');
      listings['@acme/backend'] = { logins: ['Bob'] };
      const teams = await resolveTeams(deps, 7, 'acme', failing);
      expect(teams[0]?.memberLogins).toEqual(['bob']);
      expect(calls).toEqual([['@acme/backend'], ['@acme/backend']]);
    } finally {
      errors.mockRestore();
    }
  });

  test('a team in members and managers that failed is asked again for its members', async () => {
    const errors = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const listings: Record<string, Listing> = { '@acme/leads': 'error' };
      const { deps, calls } = managerDeps(listings);
      const config = managerConfig('["@acme/leads"]');
      await resolveManagerTeams(deps, 7, 'acme', config, 1000);
      listings['@acme/leads'] = { logins: ['Dave'] };
      const [alpha] = config.teams;
      if (!alpha) throw new Error('team');
      const both = { ...config, teams: [{ ...alpha, members: ['@acme/leads'] }] };
      const teams = await resolveTeams(deps, 7, 'acme', both);
      expect(teams[0]?.memberLogins).toEqual(['dave']);
      expect(teams[0]?.managerLogins).toEqual(['dave']);
      expect(calls).toEqual([['@acme/leads'], ['@acme/leads']]);
    } finally {
      errors.mockRestore();
    }
  });

  test('resolveMemberTeams reads only member teams', async () => {
    const { deps, calls } = managerDeps({
      '@acme/leads': 'hang',
      '@acme/backend': { logins: ['Bob'] },
    });
    const config = managerConfig('[boss, "@acme/leads"]');
    const [alpha, beta] = config.teams;
    if (!alpha || !beta) throw new Error('teams');
    const teams = await resolveMemberTeams(deps, 7, 'acme', {
      ...config,
      teams: [{ ...alpha, members: ['alice', '@acme/backend'] }, beta],
    });
    expect(teams.map((t) => t.memberLogins)).toEqual([['alice', 'bob'], ['carol']]);
    expect(teams.some((t) => 'managerLogins' in t)).toBe(false);
    expect(calls).toEqual([['@acme/backend']]);
  });

  test('notices still show an unavailable manager team when a member team also fails', async () => {
    const errors = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { deps } = managerDeps({
        '@acme/leads': 'error',
        '@acme/backend': 'error',
        '@acme/gone': { logins: [], missing: true },
      });
      const config = managerConfig('[boss, "@acme/leads"]');
      const [alpha, beta] = config.teams;
      if (!alpha || !beta) throw new Error('teams');
      const notices = await teamResolutionNotices(deps, 7, 'acme', {
        ...config,
        teams: [{ ...alpha, members: ['@acme/backend', '@acme/gone'] }, beta],
      });
      expect(notices).toEqual([
        { team: 'Alpha', reference: '@acme/gone', kind: 'missing' },
        { team: 'Alpha', reference: '@acme/leads', kind: 'managers_unavailable' },
        { team: 'Beta', reference: '@acme/leads', kind: 'managers_unavailable' },
      ]);
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

  test('resolveManagerTeams reads only manager teams', async () => {
    const { deps, calls } = managerDeps({ '@acme/leads': { logins: ['dave'] } });
    const teams = await resolveManagerTeams(
      deps,
      7,
      'acme',
      managerConfig('[boss, "@acme/leads"]'),
      1000,
    );
    expect(teams.map((t) => t.managerLogins)).toEqual([['boss', 'dave'], ['dave']]);
    expect(calls).toEqual([['@acme/leads']]);
  });

  test('resolveManagerTeams gives up on a slow manager team and keeps the others', async () => {
    const errors = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { deps } = managerDeps({ '@acme/slow': 'hang', '@acme/leads': { logins: ['dave'] } });
      const started = Date.now();
      const teams = await resolveManagerTeams(
        deps,
        7,
        'acme',
        managerConfig('[boss, "@acme/slow"]'),
        50,
      );
      expect(Date.now() - started).toBeLessThan(1000);
      expect(teams.map((t) => t.managerLogins)).toEqual([['boss'], ['dave']]);
      expect(String(errors.mock.calls[0]?.[0])).toBe('manager team resolution timed out');
    } finally {
      errors.mockRestore();
    }
  });

  test('a manager request that gives up leaves the read for the next request', async () => {
    const errors = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { deps, calls, release } = gatedDeps([{ logins: ['Dave'], gated: true }]);
      const config = managerConfig('[boss, "@acme/leads"]');
      const first = await resolveManagerTeams(deps, 7, 'acme', config, 20);
      expect(first.map((t) => t.managerLogins)).toEqual([['boss'], []]);
      const second = resolveManagerTeams(deps, 7, 'acme', config, 1000);
      release();
      expect((await second).map((t) => t.managerLogins)).toEqual([['boss', 'dave'], ['dave']]);
      expect(calls).toEqual([['@acme/leads']]);
    } finally {
      errors.mockRestore();
    }
  });
});
