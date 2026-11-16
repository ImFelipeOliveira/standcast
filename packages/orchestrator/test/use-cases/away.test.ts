import { describe, expect, test } from 'bun:test';
import { parseConfig, type StandcastConfig } from '@standcast/core';
import { setMemberInstallations, upsertMember } from '@standcast/db';
import type { EnqueueOptions } from '@standcast/queue';
import { db, useCleanDb } from '../../../db/test/setup';
import { cancelAway, createMembershipCheck, listAway, markAway } from '../../src';
import { config, fakeDeps, INST, seedMember, seedOrg } from './fakes';

useCleanDb();

function twoTeams(): StandcastConfig {
  const parsed = parseConfig(`
teams:
  - name: Alpha
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [alice]
    members: [Alice, bob, carol, Frank]
    chat: { provider: slack, channel: "#alpha" }
  - name: Beta
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [dave]
    members: [dave, erin]
    chat: { provider: slack, channel: "#beta" }
`);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.config;
}

async function setup(cfg: StandcastConfig = twoTeams()) {
  await seedOrg(cfg);
  const alice = await seedMember();
  const bob = await upsertMember(db, { githubUserId: 2, login: 'bob', email: null });
  const carol = await upsertMember(db, { githubUserId: 3, login: 'carol', email: null });
  const dave = await upsertMember(db, { githubUserId: 4, login: 'dave', email: null });
  for (const m of [alice, bob, carol, dave]) await setMemberInstallations(db, m.id, [INST]);
  const fake = fakeDeps();
  for (const [id, login] of [
    [2, 'bob'],
    [3, 'carol'],
    [4, 'dave'],
  ] as const) {
    fake.users.set(id, login);
    fake.orgMembers.add(login);
  }
  fake.setNow(new Date('2026-10-28T12:00:00Z'));
  const enqueued: { name: string; data: object; opts?: EnqueueOptions }[] = [];
  const original = fake.queue.enqueue.bind(fake.queue);
  fake.deps.queue.enqueue = async (name, data, opts) => {
    enqueued.push({ name, data, ...(opts ? { opts } : {}) });
    await original(name, data, opts);
  };
  const notices = () => enqueued.filter((e) => e.name === 'send-away-notice');
  return {
    ...fake,
    enqueued,
    notices,
    alice,
    bob,
    carol,
    dave,
    isMember: createMembershipCheck(fake.deps),
  };
}

const period = { from: '2026-11-02', until: '2026-11-06' };

describe('markAway and listAway', () => {
  test('a person marks and lists their own period', async () => {
    const { deps, isMember, alice, notices } = await setup();
    const marked = await markAway(deps, isMember, alice, { installationId: INST, ...period });
    expect(marked).toMatchObject({
      login: 'alice',
      from: '2026-11-02',
      until: '2026-11-06',
      markedBy: 'alice',
      mine: true,
    });
    expect(typeof marked.markedAt).toBe('string');
    expect(await listAway(deps, isMember, alice, { installationId: INST })).toEqual([marked]);
    expect(notices()).toEqual([]);
  });

  test('from defaults to today', async () => {
    const { deps, isMember, bob } = await setup();
    const marked = await markAway(deps, isMember, bob, {
      installationId: INST,
      until: '2026-10-30',
    });
    expect(marked.from).toBe('2026-10-28');
  });

  test('a manager marks a member of their team and the notice is enqueued once', async () => {
    const { deps, isMember, alice, bob, notices } = await setup();
    const marked = await markAway(deps, isMember, alice, {
      installationId: INST,
      login: 'BOB',
      ...period,
    });
    expect(marked).toMatchObject({ login: 'bob', markedBy: 'alice', mine: false });
    expect(notices()).toEqual([
      {
        name: 'send-away-notice',
        data: { installationId: INST, periodId: marked.id, action: 'marked', byLogin: 'alice' },
        opts: { singletonKey: `away-notice:${INST}:${marked.id}:marked` },
      },
    ]);
    const mine = await listAway(deps, isMember, bob, { installationId: INST });
    expect(mine).toEqual([{ ...marked, mine: true }]);
  });

  test('an admin who manages no team can mark and cancel', async () => {
    const { deps, isMember, carol, roles, notices } = await setup();
    roles.set('carol', { role: 'admin', state: 'active' });
    const marked = await markAway(deps, isMember, carol, {
      installationId: INST,
      login: 'erin',
      ...period,
    });
    expect(marked).toMatchObject({ login: 'erin', markedBy: 'carol', mine: false });
    await cancelAway(deps, isMember, carol, { installationId: INST, periodId: marked.id });
    expect(await listAway(deps, isMember, carol, { installationId: INST, login: 'erin' })).toEqual(
      [],
    );
    expect(notices().map((n) => (n.data as { action: string }).action)).toEqual([
      'marked',
      'cancelled',
    ]);
  });

  test('a manager of another team is forbidden', async () => {
    const { deps, isMember, dave, notices } = await setup();
    await expect(
      markAway(deps, isMember, dave, { installationId: INST, login: 'bob', ...period }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      listAway(deps, isMember, dave, { installationId: INST, login: 'bob' }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(notices()).toEqual([]);
  });

  test('a member marking someone else is forbidden', async () => {
    const { deps, isMember, bob } = await setup();
    await expect(
      markAway(deps, isMember, bob, { installationId: INST, login: 'carol', ...period }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  test('a login in no team is not_found', async () => {
    const { deps, isMember, alice } = await setup();
    await seedOrg(config('[zed]', '', '[zed]'), { id: 12, accountLogin: 'other' });
    for (const login of ['nobody', 'zed']) {
      await expect(
        markAway(deps, isMember, alice, { installationId: INST, login, ...period }),
      ).rejects.toMatchObject({ code: 'not_found' });
    }
  });

  test('a caller in no team marking themselves is not_in_team', async () => {
    const { deps, isMember, orgMembers, users } = await setup();
    const zoe = await upsertMember(db, { githubUserId: 9, login: 'zoe', email: null });
    await setMemberInstallations(db, zoe.id, [INST]);
    users.set(9, 'zoe');
    orgMembers.add('zoe');
    await expect(
      markAway(deps, isMember, zoe, { installationId: INST, ...period }),
    ).rejects.toMatchObject({ code: 'not_in_team' });
  });

  test('a person who never signed in can be marked', async () => {
    const { deps, isMember, alice } = await setup();
    const marked = await markAway(deps, isMember, alice, {
      installationId: INST,
      login: 'frank',
      ...period,
    });
    expect(marked).toMatchObject({ login: 'frank', markedBy: 'alice', mine: false });
    expect(await listAway(deps, isMember, alice, { installationId: INST, login: 'Frank' })).toEqual(
      [marked],
    );
  });

  test('from before today is invalid_away_period', async () => {
    const parsed = parseConfig(`
teams:
  - name: Kiwi
    timezone: Pacific/Auckland
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [alice]
    members: [alice, bob]
    chat: { provider: slack, channel: "#kiwi" }
`);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
    const { deps, isMember, alice, setNow } = await setup(parsed.config);
    setNow(new Date('2026-10-28T11:05:00Z'));
    const input = { installationId: INST, login: 'bob', until: '2026-10-30' };
    await expect(
      markAway(deps, isMember, alice, { ...input, from: '2026-10-28' }),
    ).rejects.toMatchObject({ code: 'invalid_away_period' });
    const marked = await markAway(deps, isMember, alice, { ...input, from: '2026-10-29' });
    expect(marked.from).toBe('2026-10-29');
    const defaulted = await markAway(deps, isMember, alice, {
      installationId: INST,
      until: '2026-10-29',
    });
    expect(defaulted.from).toBe('2026-10-29');
  });

  test('a period too long or ending before it starts is invalid_away_period', async () => {
    const { deps, isMember, alice } = await setup();
    for (const dates of [
      { from: '2026-11-02', until: '2026-11-01' },
      { from: '2026-11-02', until: '2027-02-01' },
      { from: 'soon', until: '2026-11-01' },
    ]) {
      await expect(
        markAway(deps, isMember, alice, { installationId: INST, ...dates }),
      ).rejects.toMatchObject({ code: 'invalid_away_period' });
    }
  });

  test('overlap is away_overlap', async () => {
    const { deps, isMember, alice, notices } = await setup();
    await markAway(deps, isMember, alice, { installationId: INST, login: 'bob', ...period });
    await expect(
      markAway(deps, isMember, alice, {
        installationId: INST,
        login: 'bob',
        from: '2026-11-06',
        until: '2026-11-10',
      }),
    ).rejects.toMatchObject({ code: 'away_overlap' });
    expect(notices()).toHaveLength(1);
  });
});

describe('cancelAway', () => {
  test('the person cancels a period a manager marked', async () => {
    const { deps, isMember, alice, bob, notices } = await setup();
    const marked = await markAway(deps, isMember, alice, {
      installationId: INST,
      login: 'bob',
      ...period,
    });
    await cancelAway(deps, isMember, bob, { installationId: INST, periodId: marked.id });
    expect(await listAway(deps, isMember, bob, { installationId: INST })).toEqual([]);
    expect(notices().map((n) => (n.data as { action: string }).action)).toEqual(['marked']);
  });

  test('a member cannot cancel someone else and unknown ids are not_found', async () => {
    const { deps, isMember, alice, carol } = await setup();
    const marked = await markAway(deps, isMember, alice, {
      installationId: INST,
      login: 'bob',
      ...period,
    });
    await expect(
      cancelAway(deps, isMember, carol, { installationId: INST, periodId: marked.id }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    for (const periodId of ['not-a-uuid', '00000000-0000-4000-8000-000000000000']) {
      await expect(
        cancelAway(deps, isMember, alice, { installationId: INST, periodId }),
      ).rejects.toMatchObject({ code: 'not_found' });
    }
  });

  test('two concurrent cancels: one succeeds, one not_found, one notice', async () => {
    const { deps, isMember, alice, notices } = await setup();
    const marked = await markAway(deps, isMember, alice, {
      installationId: INST,
      login: 'bob',
      ...period,
    });
    const input = { installationId: INST, periodId: marked.id };
    const results = await Promise.allSettled([
      cancelAway(deps, isMember, alice, input),
      cancelAway(deps, isMember, alice, input),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'not_found' });
    expect(notices().filter((n) => (n.data as { action: string }).action === 'cancelled')).toEqual([
      {
        name: 'send-away-notice',
        data: { installationId: INST, periodId: marked.id, action: 'cancelled', byLogin: 'alice' },
        opts: { singletonKey: `away-notice:${INST}:${marked.id}:cancelled` },
      },
    ]);
  });

  test('a new period over the same days is accepted after cancel', async () => {
    const { deps, isMember, bob } = await setup();
    const first = await markAway(deps, isMember, bob, { installationId: INST, ...period });
    await cancelAway(deps, isMember, bob, { installationId: INST, periodId: first.id });
    const second = await markAway(deps, isMember, bob, { installationId: INST, ...period });
    expect(second.id).not.toBe(first.id);
  });
});
