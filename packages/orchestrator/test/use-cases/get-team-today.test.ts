import { describe, expect, test } from 'bun:test';
import { type Item, parseConfig, type StoredDaily } from '@standcast/core';
import { type MemberRow, setMemberInstallations, upsertDaily, upsertMember } from '@standcast/db';
import { blockerStates, deliveries } from '../../../db/src/schema';
import { db, useCleanDb } from '../../../db/test/setup';
import {
  blockerRouteId,
  createMembershipCheck,
  getTeamToday,
  recordBlockers,
  submitDaily,
} from '../../src';
import { config, daily, type FakeOptions, fakeDeps, INST, seedMember, seedOrg } from './fakes';

useCleanDb();

const BEFORE_DIGEST = new Date('2026-10-28T12:00:00Z');

async function setup(opts: FakeOptions = {}, cfg = config('[alice, bob, carol]')) {
  await seedOrg(cfg);
  const alice = await seedMember();
  const bob = await upsertMember(db, { githubUserId: 2, login: 'bob', email: null });
  const carol = await upsertMember(db, { githubUserId: 3, login: 'carol', email: null });
  const dave = await upsertMember(db, { githubUserId: 4, login: 'dave', email: null });
  for (const m of [alice, bob, carol, dave]) await setMemberInstallations(db, m.id, [INST]);
  const fake = fakeDeps(opts);
  fake.users.set(2, 'bob');
  fake.users.set(3, 'carol');
  fake.users.set(4, 'dave');
  for (const login of ['bob', 'carol', 'dave']) fake.orgMembers.add(login);
  fake.setNow(BEFORE_DIGEST);
  return { ...fake, alice, bob, carol, dave, isMember: createMembershipCheck(fake.deps) };
}

async function store(member: MemberRow, date: string, payload: Partial<StoredDaily>, at?: Date) {
  const { id } = await upsertDaily(db, {
    installationId: INST,
    memberId: member.id,
    date,
    payload: { ...daily, ...payload } as StoredDaily,
    submittedAt: at ?? new Date(`${date}T12:00:00Z`),
  });
  if (payload.blockers) {
    await recordBlockers({ db } as never, {
      installationId: INST,
      memberId: member.id,
      date,
      blockers: payload.blockers,
    });
  }
  return id;
}

async function digestSent(date: string, at: Date) {
  await db.insert(deliveries).values({
    installationId: INST,
    teamName: 'Alpha',
    date,
    kind: 'digest',
    subject: '',
    status: 'sent',
    attempts: 1,
    updatedAt: at,
  });
}

async function routed(dailyId: string, blocker: Item, logins: string[], date = '2026-10-26') {
  for (const login of ['+', ...logins]) {
    await db.insert(deliveries).values({
      installationId: INST,
      teamName: '',
      date,
      kind: 'blocker_route',
      subject: `${dailyId}:${blockerRouteId(blocker)}:${login}`,
      status: 'sent',
      attempts: 1,
    });
  }
}

const team = { installationId: INST, team: 'Alpha' };

const pr = (n: number, text = `waiting review ${n}`): Item => ({
  text,
  ref: { kind: 'pull_request', url: `https://github.com/acme/api/pull/${n}` },
});
const access: Item = { text: 'need prod access' };

describe('getTeamToday', () => {
  test('today lists sent, late and missing for today only', async () => {
    const { deps, isMember, alice, bob, carol } = await setup();
    await store(alice, '2026-10-27', {});
    await submitDaily(deps, isMember, bob, daily);
    await digestSent('2026-10-28', new Date('2026-10-28T13:00:00Z'));
    deps.now = () => new Date('2026-10-28T13:30:00Z');
    await submitDaily(deps, isMember, carol, { ...daily, support: [{ text: 'pair on infra' }] });
    const today = await getTeamToday(deps, isMember, alice, team);
    expect(today.date).toBe('2026-10-28');
    expect(today.team).toEqual({
      name: 'Alpha',
      timezone: 'America/Sao_Paulo',
      remindAt: '09:00',
      digestAt: '10:00',
    });
    expect(today.digest).toEqual({ status: 'sent', sentAt: '2026-10-28T13:00:00.000Z' });
    expect(today.people).toEqual([
      { login: 'alice', status: 'missing', submittedAt: null, daily: null },
      {
        login: 'bob',
        status: 'sent',
        submittedAt: '2026-10-28T12:00:00.000Z',
        daily: { yesterday: daily.yesterday, today: daily.today, blockers: [], support: [] },
      },
      {
        login: 'carol',
        status: 'late',
        submittedAt: '2026-10-28T13:30:00.000Z',
        daily: {
          yesterday: daily.yesterday,
          today: daily.today,
          blockers: [],
          support: [{ text: 'pair on infra' }],
        },
      },
    ]);
    expect(JSON.stringify(today)).not.toContain('2026-10-27');
  });

  test('old payloads without support read as empty', async () => {
    const { deps, isMember, alice, bob } = await setup();
    const { support: _, ...old } = daily;
    await store(bob, '2026-10-28', old as Partial<StoredDaily>);
    const today = await getTeamToday(deps, isMember, alice, team);
    expect(today.people.find((p) => p.login === 'bob')?.daily?.support).toEqual([]);
  });

  test('today follows the team timezone', async () => {
    const parsed = parseConfig(`
teams:
  - name: Alpha
    timezone: Pacific/Auckland
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [alice]
    members: [alice, bob]
    chat: { provider: slack, channel: "#alpha" }
`);
    if (!parsed.ok) throw new Error('config');
    const { deps, isMember, alice, bob } = await setup({}, parsed.config);
    deps.now = () => new Date('2026-10-28T19:00:00Z');
    await store(bob, '2026-10-29', {}, new Date('2026-10-28T18:30:00Z'));
    await store(alice, '2026-10-28', {});
    const today = await getTeamToday(deps, isMember, alice, team);
    expect(today.date).toBe('2026-10-29');
    expect(today.people.map((p) => [p.login, p.status])).toEqual([
      ['alice', 'missing'],
      ['bob', 'sent'],
    ]);
    expect(today.canRemind).toBe(true);
  });

  test('blockers carry age, recurrence and routing', async () => {
    const { deps, isMember, alice, bob, carol } = await setup({
      merged: { 'acme/api#7': { merged: true, mergedAt: '2026-10-28T11:00:00Z' } },
    });
    const first = await store(bob, '2026-10-26', { blockers: [pr(7), access] });
    await routed(first, pr(7), ['dave']);
    await store(bob, '2026-10-28', { blockers: [pr(7, 'still waiting review')] });
    const carolDaily = await store(carol, '2026-10-28', { blockers: [access] });
    await routed(carolDaily, access, ['alice'], '2026-10-28');
    await store(alice, '2026-10-28', { blockers: [{ text: 'flaky ci' }] });
    const states = await db.query.blockerStates.findMany();
    const idOf = (author: MemberRow, text: string) =>
      states.find((s) => s.authorMemberId === author.id && s.text === text)?.id;
    const today = await getTeamToday(deps, isMember, alice, team);
    expect(today.blockers).toEqual([
      {
        id: idOf(bob, 'still waiting review') as string,
        author: 'bob',
        text: 'still waiting review',
        ref: pr(7).ref ?? null,
        openedOn: '2026-10-26',
        ageDays: 2,
        recurring: true,
        routedTo: { logins: ['dave'], reason: 'pull_request' },
        hint: { kind: 'pr_merged', at: '2026-10-28T11:00:00Z' },
      },
      {
        id: idOf(alice, 'flaky ci') as string,
        author: 'alice',
        text: 'flaky ci',
        ref: null,
        openedOn: '2026-10-28',
        ageDays: 0,
        recurring: false,
        routedTo: null,
        hint: null,
      },
      {
        id: idOf(carol, 'need prod access') as string,
        author: 'carol',
        text: 'need prod access',
        ref: null,
        openedOn: '2026-10-28',
        ageDays: 0,
        recurring: false,
        routedTo: { logins: ['alice'], reason: 'manager' },
        hint: null,
      },
    ]);
  });

  test('resolved blockers leave the page', async () => {
    const { deps, isMember, alice, bob } = await setup();
    await store(bob, '2026-10-28', { blockers: [access] });
    await db.update(blockerStates).set({
      resolvedAt: new Date('2026-10-28T12:30:00Z'),
    });
    expect((await getTeamToday(deps, isMember, alice, team)).blockers).toEqual([]);
  });

  test('support requests with since', async () => {
    const { deps, isMember, alice, bob } = await setup();
    await store(bob, '2026-10-10', { support: [{ text: 'review my infra pr' }] });
    await store(bob, '2026-10-20', { support: [{ text: 'Review my  infra PR ' }] });
    await store(bob, '2026-10-27', {});
    const ref = { kind: 'card' as const, url: 'https://linear.app/acme/issue/FEL-1' };
    await store(bob, '2026-10-28', {
      support: [{ text: 'review my infra pr' }, { text: 'help with the migration', ref }],
    });
    const today = await getTeamToday(deps, isMember, alice, team);
    expect(today.support).toEqual([
      { author: 'bob', text: 'review my infra pr', ref: null, since: '2026-10-20' },
      { author: 'bob', text: 'help with the migration', ref, since: '2026-10-28' },
    ]);
  });

  test('shipped comes from yesterday refs', async () => {
    const { deps, isMember, alice, bob } = await setup();
    const prRef = { kind: 'pull_request' as const, url: 'https://github.com/acme/api/pull/9' };
    const cardRef = { kind: 'card' as const, url: 'https://linear.app/acme/issue/FEL-2' };
    await store(bob, '2026-10-27', {
      yesterday: [{ text: 'old', ref: { ...prRef, url: 'https://github.com/acme/api/pull/1' } }],
    });
    await store(bob, '2026-10-28', {
      yesterday: [
        { text: 'merged login', ref: prRef },
        { text: 'plain work' },
        { text: 'moved card', ref: cardRef },
        { text: 'issue', ref: { kind: 'issue', url: 'https://github.com/acme/api/issues/3' } },
      ],
    });
    const today = await getTeamToday(deps, isMember, alice, team);
    expect(today.shipped).toEqual([
      { author: 'bob', text: 'merged login', ref: prRef },
      { author: 'bob', text: 'moved card', ref: cardRef },
    ]);
  });

  test('hint failure keeps the page', async () => {
    const { deps, isMember, alice, bob } = await setup({
      merged: { 'acme/api#7': new Error('github down') },
    });
    await store(bob, '2026-10-28', { blockers: [pr(7)] });
    const today = await getTeamToday(deps, isMember, alice, team);
    expect(today.blockers).toHaveLength(1);
    expect(today.blockers[0]?.hint).toBeNull();
  });

  test('hint calls stop at ten', async () => {
    const { deps, isMember, alice, bob, carol, calls } = await setup();
    await store(bob, '2026-10-28', { blockers: Array.from({ length: 8 }, (_, i) => pr(i + 1)) });
    await store(carol, '2026-10-28', {
      blockers: Array.from({ length: 4 }, (_, i) => pr(i + 20)),
    });
    const today = await getTeamToday(deps, isMember, alice, team);
    expect(today.blockers).toHaveLength(12);
    expect(calls.pullRequestMerged).toHaveLength(10);
  });

  test('a member reads the team without actions', async () => {
    const { deps, isMember, bob } = await setup();
    const today = await getTeamToday(deps, isMember, bob, team);
    expect(today.canRemind).toBe(false);
    expect(today.canResolve).toBe(false);
  });

  test('manager can remind only before the digest', async () => {
    const { deps, isMember, alice } = await setup();
    const before = await getTeamToday(deps, isMember, alice, team);
    expect(before.digest).toEqual({ status: 'scheduled', sentAt: null });
    expect(before).toMatchObject({ canRemind: true, canResolve: true });
    deps.now = () => new Date('2026-10-28T13:00:00Z');
    expect(await getTeamToday(deps, isMember, alice, team)).toMatchObject({
      canRemind: false,
      canResolve: true,
    });
  });

  test('a weekend now cannot remind', async () => {
    const { deps, isMember, alice } = await setup();
    deps.now = () => new Date('2026-10-31T12:00:00Z');
    expect(await getTeamToday(deps, isMember, alice, team)).toMatchObject({
      date: '2026-11-02',
      canRemind: false,
      canResolve: true,
    });
  });

  test('admin reads any team', async () => {
    const { deps, isMember, dave, roles } = await setup();
    roles.set('dave', { role: 'admin', state: 'active' });
    expect(await getTeamToday(deps, isMember, dave, team)).toMatchObject({
      canRemind: true,
      canResolve: true,
    });
  });

  test('outsider is forbidden and unknown team is not found', async () => {
    const { deps, isMember, dave, alice } = await setup();
    await expect(getTeamToday(deps, isMember, dave, team)).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(
      getTeamToday(deps, isMember, alice, { installationId: INST, team: 'Nope' }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      getTeamToday(deps, isMember, alice, { installationId: 99, team: 'Alpha' }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});
