import { describe, expect, test } from 'bun:test';
import { type Item, parseConfig, type StandcastConfig, type StoredDaily } from '@standcast/core';
import {
  getBlockerState,
  getDelivery,
  type MemberRow,
  setBlockerStateResolved,
  setIdentity,
  setMemberInstallations,
  upsertDaily,
  upsertMember,
} from '@standcast/db';
import { ChatDeliveryError } from '@standcast/slack';
import { blockerStates, deliveries } from '../../../db/src/schema';
import { db, useCleanDb } from '../../../db/test/setup';
import {
  ALERT_POST_DEADLINE_MS,
  blockerRouteId,
  MAX_BLOCKER_ALERTS_PER_SCAN,
  recordBlockers,
  sendBlockerAlerts,
} from '../../src';
import {
  daily,
  type FakeOptions,
  fakeChat,
  fakeDeps,
  flakyDb,
  INST,
  linkSpace,
  seedOrg,
} from './fakes';

useCleanDb();

const DATE = '2026-10-28';
const job = { installationId: INST, teamName: 'Alpha', date: DATE };
const scanKey = (date = DATE) => ({
  installationId: INST,
  teamName: 'Alpha',
  date,
  kind: 'blocker_alert' as const,
});

function teamConfig(
  opts: { signals?: string; managers?: string; chat?: string } = {},
): StandcastConfig {
  const parsed = parseConfig(`
teams:
  - name: Alpha
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: ${opts.managers ?? '[carol]'}
    members: [alice, bob]
    chat: ${opts.chat ?? '{ provider: slack, channel: "#alpha" }'}
${opts.signals ?? '    signals: { blocker_alert_days: 5 }'}
`);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.config;
}

async function setup(cfg: StandcastConfig = teamConfig(), opts: FakeOptions = {}) {
  await seedOrg(cfg);
  const alice = await upsertMember(db, { githubUserId: 1, login: 'Alice', email: null });
  const bob = await upsertMember(db, { githubUserId: 2, login: 'bob', email: null });
  const carol = await upsertMember(db, { githubUserId: 3, login: 'carol', email: null });
  for (const m of [alice, bob, carol]) await setMemberInstallations(db, m.id, [INST]);
  await setIdentity(db, INST, carol.id, 'slack', 'UCAROL');
  const fake = fakeDeps(opts);
  const chat = fakeChat();
  fake.deps.chatFor = async () => chat.chat;
  fake.setNow(new Date(`${DATE}T13:05:00Z`));
  return { ...fake, ...chat, alice, bob, carol };
}

async function store(member: MemberRow, date: string, blockers: Item[]) {
  const { id } = await upsertDaily(db, {
    installationId: INST,
    memberId: member.id,
    date,
    payload: { ...daily, blockers } as StoredDaily,
    submittedAt: new Date(`${date}T12:00:00Z`),
  });
  await recordBlockers({ db } as never, {
    installationId: INST,
    memberId: member.id,
    date,
    blockers,
  });
  return id;
}

async function stateOf(member: MemberRow, blocker: Item) {
  const rows = await db.select().from(blockerStates);
  const row = rows.find(
    (r) => r.blockerId === blockerRouteId(blocker) && r.authorMemberId === member.id,
  );
  if (!row) throw new Error('no state');
  return row;
}

const staging: Item = {
  text: 'waiting on the staging database',
  ref: { kind: 'pull_request', url: 'https://github.com/acme/api/pull/7', title: 'Add cache' },
};
const logs: Item = { text: 'no access to prod logs' };

describe('sendBlockerAlerts', () => {
  test('alerts an open blocker once it reaches the limit, mentioning the managers', async () => {
    const { deps, posted, alice } = await setup();
    await store(alice, '2026-10-23', [staging]);
    await sendBlockerAlerts(deps, job);
    expect(posted).toHaveLength(1);
    expect(posted[0]?.channel).toBe('#alpha');
    const text = posted[0]?.msg.fallbackText ?? '';
    expect(text).toContain('Blocker open for 5 days · Alpha');
    expect(text).toContain('@UCAROL');
    expect(text).toContain('waiting on the staging database');
    expect(text).toContain('https://github.com/acme/api/pull/7');
    expect(text).toContain('reported by @Alice');
    const state = await stateOf(alice, staging);
    expect(state.alertedAt?.toISOString()).toBe(`${DATE}T13:05:00.000Z`);
    expect((await getDelivery(db, scanKey()))?.status).toBe('sent');
  });

  test('does not alert before the limit', async () => {
    const { deps, posted, alice } = await setup();
    await store(alice, '2026-10-24', [staging]);
    await sendBlockerAlerts(deps, job);
    expect(posted).toEqual([]);
    expect((await stateOf(alice, staging)).alertedAt).toBeNull();
    expect((await getDelivery(db, scanKey()))?.status).toBe('sent');
  });

  test('never alerts the same blocker twice, on the same day or later', async () => {
    const { deps, posted, alice, setNow } = await setup();
    await store(alice, '2026-10-23', [staging]);
    await Promise.all([sendBlockerAlerts(deps, job), sendBlockerAlerts(deps, job)]);
    await sendBlockerAlerts(deps, job);
    await store(alice, '2026-10-29', [staging]);
    setNow(new Date('2026-10-29T13:05:00Z'));
    await sendBlockerAlerts(deps, { ...job, date: '2026-10-29' });
    expect(posted).toHaveLength(1);
  });

  test('does not alert a resolved blocker', async () => {
    const { deps, posted, alice, carol } = await setup();
    await store(alice, '2026-10-23', [staging]);
    const state = await stateOf(alice, staging);
    await setBlockerStateResolved(db, INST, state.id, {
      at: new Date('2026-10-27T12:00:00Z'),
      by: carol.id,
      on: '2026-10-27',
    });
    await sendBlockerAlerts(deps, job);
    expect(posted).toEqual([]);
  });

  test('does not alert a blocker that left the latest daily', async () => {
    const { deps, posted, alice } = await setup();
    await store(alice, '2026-10-20', [staging]);
    await store(alice, '2026-10-27', []);
    await sendBlockerAlerts(deps, job);
    expect(posted).toEqual([]);
  });

  test('a reopened state is not alerted again, a new blocker is', async () => {
    const { deps, posted, alice, carol, setNow } = await setup();
    await store(alice, '2026-10-23', [staging]);
    await sendBlockerAlerts(deps, job);
    const state = await stateOf(alice, staging);
    await setBlockerStateResolved(db, INST, state.id, {
      at: new Date('2026-10-28T15:00:00Z'),
      by: carol.id,
      on: '2026-10-28',
    });
    await store(alice, '2026-10-29', [staging, logs]);
    setNow(new Date('2026-11-05T13:05:00Z'));
    await sendBlockerAlerts(deps, { ...job, date: '2026-11-05' });
    expect(posted).toHaveLength(2);
    expect(posted[1]?.msg.fallbackText).toContain('no access to prod logs');
    expect(posted[1]?.msg.fallbackText).toContain('Blocker open for 7 days');
    expect((await getBlockerState(db, INST, state.id))?.resolvedAt).toBeNull();
  });

  test('sends nothing when blocker_alert_days is absent', async () => {
    const { deps, posted, alice } = await setup(teamConfig({ signals: '' }));
    await store(alice, '2026-10-01', [staging]);
    await sendBlockerAlerts(deps, job);
    expect(posted).toEqual([]);
    expect(await getDelivery(db, scanKey())).toBeNull();
    expect((await stateOf(alice, staging)).alertedAt).toBeNull();
  });

  test('sends nothing when the team has no managers', async () => {
    const { deps, posted, alice } = await setup(teamConfig({ managers: '["@acme/leads"]' }), {
      teams: { '@acme/leads': [] },
    });
    await store(alice, '2026-10-20', [staging]);
    await sendBlockerAlerts(deps, job);
    expect(posted).toEqual([]);
    expect((await stateOf(alice, staging)).alertedAt).toBeNull();
    expect((await getDelivery(db, scanKey()))?.status).toBe('sent');
  });

  test('says who the blocker was routed to when known', async () => {
    const { deps, posted, alice } = await setup();
    const dailyId = await store(alice, '2026-10-23', [staging]);
    for (const login of ['+', 'bob']) {
      await db.insert(deliveries).values({
        installationId: INST,
        teamName: '',
        date: '2026-10-23',
        kind: 'blocker_route',
        subject: `${dailyId}:${blockerRouteId(staging)}:${login}`,
        status: 'sent',
        attempts: 1,
      });
    }
    await sendBlockerAlerts(deps, job);
    expect(posted[0]?.msg.fallbackText).toContain('Routed to @bob.');
  });

  test('posts in the Google Chat space with Google Chat mentions', async () => {
    const cfg = teamConfig({
      chat: '{ provider: google-chat, channel: spaces/AAAA }',
      signals: '    language: pt-BR\n    signals: { blocker_alert_days: 5 }',
    });
    const { deps, posted, alice, carol } = await setup(cfg);
    await setIdentity(db, INST, carol.id, 'google-chat', 'users/42');
    await linkSpace('spaces/AAAA');
    await store(alice, '2026-10-23', [staging]);
    await sendBlockerAlerts(deps, job);
    expect(posted).toHaveLength(1);
    expect(posted[0]?.channel).toBe('spaces/AAAA');
    const content = posted[0]?.msg.blocks.flatMap((b) => (b.type === 'paragraph' ? b.content : []));
    expect(content).toContainEqual({ mention: 'users/42' });
    expect(posted[0]?.msg.fallbackText).toContain('Impedimento aberto há 5 dias · Alpha');
  });

  test('sends at most the per scan limit, oldest first', async () => {
    const { deps, posted, alice } = await setup();
    const many = Array.from({ length: MAX_BLOCKER_ALERTS_PER_SCAN + 1 }, (_, i) => ({
      text: `blocker ${String(i).padStart(2, '0')}`,
    }));
    await store(alice, '2026-10-20', many);
    await sendBlockerAlerts(deps, job);
    expect(posted).toHaveLength(MAX_BLOCKER_ALERTS_PER_SCAN);
  });

  test('a failed post fails the scan and the retry skips blockers already alerted', async () => {
    const { deps, posted, alice, hooks, failWith } = await setup();
    await store(alice, '2026-10-20', [staging, logs]);
    hooks.afterSend = async () => {
      failWith(new ChatDeliveryError('rate_limited', 'slow down'));
    };
    await expect(sendBlockerAlerts(deps, job)).rejects.toBeInstanceOf(ChatDeliveryError);
    const failed = await getDelivery(db, scanKey());
    expect(failed?.status).toBe('failed');
    expect(failed?.error?.startsWith('rate_limited')).toBe(true);
    expect(posted).toHaveLength(1);
    hooks.afterSend = undefined;
    failWith(null);
    await sendBlockerAlerts(deps, job);
    expect(posted).toHaveLength(2);
    expect(posted.map((p) => p.msg.fallbackText.includes('prod logs'))).toEqual([true, false]);
    expect((await getDelivery(db, scanKey()))?.status).toBe('sent');
  });

  test('a retry keeps the daily limit when a post fails midway', async () => {
    const { deps, posted, alice, hooks, failWith } = await setup();
    const many = Array.from({ length: MAX_BLOCKER_ALERTS_PER_SCAN + 1 }, (_, i) => ({
      text: `blocker ${String(i).padStart(2, '0')}`,
    }));
    await store(alice, '2026-10-20', many);
    hooks.afterSend = async () => {
      if (posted.length === MAX_BLOCKER_ALERTS_PER_SCAN - 1) {
        failWith(new ChatDeliveryError('rate_limited', 'slow down'));
      }
    };
    await expect(sendBlockerAlerts(deps, job)).rejects.toBeInstanceOf(ChatDeliveryError);
    expect(posted).toHaveLength(MAX_BLOCKER_ALERTS_PER_SCAN - 1);
    hooks.afterSend = undefined;
    failWith(null);
    await sendBlockerAlerts(deps, job);
    expect(posted).toHaveLength(MAX_BLOCKER_ALERTS_PER_SCAN);
    expect((await getDelivery(db, scanKey()))?.status).toBe('sent');
  });

  test('a retry does not post again a blocker whose alert was posted but not recorded', async () => {
    const { deps, posted, alice, hooks } = await setup();
    const flaky = flakyDb();
    deps.db = flaky.db;
    await store(alice, '2026-10-20', [staging]);
    hooks.afterSend = async () => {
      flaky.failNextUpdate(blockerStates);
    };
    await expect(sendBlockerAlerts(deps, job)).rejects.toThrow('db down');
    expect((await getDelivery(db, scanKey()))?.status).toBe('failed');
    expect((await stateOf(alice, staging)).alertedAt).toBeNull();
    hooks.afterSend = undefined;
    await sendBlockerAlerts(deps, job);
    expect(posted).toHaveLength(1);
    expect((await stateOf(alice, staging)).alertedAt).not.toBeNull();
    expect((await getDelivery(db, scanKey()))?.status).toBe('sent');
  });

  test('a failure to complete the scan records it as failed', async () => {
    const { deps, alice } = await setup();
    const flaky = flakyDb();
    deps.db = flaky.db;
    await store(alice, '2026-10-24', [staging]);
    flaky.failNextUpdate(deliveries);
    await expect(sendBlockerAlerts(deps, job)).rejects.toThrow('db down');
    const row = await getDelivery(db, scanKey());
    expect(row?.status).toBe('failed');
    expect(row?.error?.startsWith('internal_error')).toBe(true);
  });

  test('a missing chat connection fails the scan without retry', async () => {
    const { deps, posted, alice } = await setup();
    deps.chatFor = async () => null;
    await store(alice, '2026-10-20', [staging]);
    await sendBlockerAlerts(deps, job);
    expect(posted).toEqual([]);
    const row = await getDelivery(db, scanKey());
    expect(row?.status).toBe('failed');
    expect(row?.error).toBe('no_chat_connection');
  });

  test('stops posting once the attempt runs past its deadline', async () => {
    const { deps, posted, alice, hooks, setNow } = await setup();
    await store(alice, '2026-10-20', [staging, logs]);
    const start = deps.now().getTime();
    hooks.afterSend = async () => {
      setNow(new Date(start + ALERT_POST_DEADLINE_MS + 1));
    };
    await expect(sendBlockerAlerts(deps, job)).rejects.toBeInstanceOf(ChatDeliveryError);
    expect(posted).toHaveLength(1);
    const row = await getDelivery(db, scanKey());
    expect(row?.status).toBe('failed');
    expect(row?.error?.startsWith('deadline_exceeded')).toBe(true);
    hooks.afterSend = undefined;
    await sendBlockerAlerts(deps, job);
    expect(posted).toHaveLength(2);
  });

  test('a blocker that left the daily and came back is the same blocker and is not alerted again', async () => {
    const { deps, posted, alice, setNow } = await setup();
    await store(alice, '2026-10-23', [staging]);
    await sendBlockerAlerts(deps, job);
    await store(alice, '2026-10-29', []);
    await store(alice, '2026-11-02', [staging]);
    setNow(new Date('2026-11-03T13:05:00Z'));
    await sendBlockerAlerts(deps, { ...job, date: '2026-11-03' });
    expect(posted).toHaveLength(1);
  });

  test('a member in two teams with the alert on is alerted once in each team', async () => {
    const parsed = parseConfig(`
teams:
  - name: Alpha
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [carol]
    members: [alice, bob]
    chat: { provider: slack, channel: "#alpha" }
    signals: { blocker_alert_days: 5 }
  - name: Beta
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [carol]
    members: [alice]
    chat: { provider: slack, channel: "#beta" }
    signals: { blocker_alert_days: 5 }
`);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
    const { deps, posted, alice } = await setup(parsed.config);
    await store(alice, '2026-10-23', [staging]);
    const beta = { ...job, teamName: 'Beta' };
    await sendBlockerAlerts(deps, job);
    await sendBlockerAlerts(deps, beta);
    await sendBlockerAlerts(deps, { ...job, date: '2026-10-29' });
    await sendBlockerAlerts(deps, { ...beta, date: '2026-10-29' });
    expect(posted.map((p) => p.channel).sort()).toEqual(['#alpha', '#beta']);
  });
});
