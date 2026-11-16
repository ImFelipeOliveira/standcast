import { describe, expect, test } from 'bun:test';
import {
  claimDelivery,
  completeDelivery,
  getDelivery,
  setIdentity,
  setInstallationConfig,
  upsertDaily,
} from '@standcast/db';
import { ChatDeliveryError } from '@standcast/slack';
import { googleChatSpaces } from '../../../db/src/schema';
import { db, useCleanDb } from '../../../db/test/setup';
import { POST_DAILY_JOB, postDaily } from '../../src';
import {
  config,
  daily,
  fakeChat,
  fakeDeps,
  flakyDb,
  INST,
  linkSpace,
  seedMember,
  seedOrg,
} from './fakes';

useCleanDb();

const DATE = '2026-10-28';
const digestKey = { installationId: INST, teamName: 'Alpha', date: DATE, kind: 'digest' as const };
const DIGEST_REF = { channel: 'C1', id: '100.0' };
const GOOGLE_DIGEST_REF = { channel: 'spaces/AAAA', id: 'spaces/AAAA/threads/t1' };

async function setup(digestSent = true, digestRef = DIGEST_REF) {
  await seedOrg();
  const alice = await seedMember();
  await upsertDaily(db, {
    installationId: INST,
    memberId: alice.id,
    date: DATE,
    payload: { ...daily, today: [{ text: 'late work' }] },
    submittedAt: new Date('2026-10-28T14:00:00Z'),
  });
  if (digestSent) {
    const claim = await claimDelivery(db, digestKey);
    if (claim.status !== 'claimed') throw new Error('not claimed');
    await completeDelivery(db, digestKey, claim.token, digestRef);
  }
  const fake = fakeDeps();
  const chat = fakeChat();
  fake.deps.chatFor = async () => chat.chat;
  return { ...fake, ...chat, job: { installationId: INST, memberId: alice.id, date: DATE } };
}

describe('postDaily', () => {
  test('late daily replies in thread', async () => {
    const { deps, replies, posted, job } = await setup();
    await postDaily(deps, job);
    await postDaily(deps, job);
    expect(posted).toHaveLength(0);
    expect(replies).toHaveLength(1);
    expect(replies[0]?.ref).toEqual(DIGEST_REF);
    expect(replies[0]?.msg.fallbackText).toContain('late work');
    const row = await getDelivery(db, {
      ...digestKey,
      kind: 'late_daily',
      subject: job.memberId,
    });
    expect(row?.status).toBe('sent');
  });

  test('late daily uses the last valid config while standcast.yml is invalid', async () => {
    const { deps, replies, job } = await setup();
    await setInstallationConfig(db, INST, {
      status: 'invalid',
      errors: [{ path: 'teams', message: 'bad' }],
    });
    await postDaily(deps, job);
    expect(replies).toHaveLength(1);
  });

  test('no reply when the digest was not sent', async () => {
    const { deps, replies, job } = await setup(false);
    await postDaily(deps, job);
    expect(replies).toHaveLength(0);
  });

  test('late daily failure is recorded and rethrown', async () => {
    const { deps, replies, failWith, job } = await setup();
    failWith(new ChatDeliveryError('channel_not_found', 'gone'));
    await expect(postDaily(deps, job)).rejects.toBeInstanceOf(ChatDeliveryError);
    const row = await getDelivery(db, {
      ...digestKey,
      kind: 'late_daily',
      subject: job.memberId,
    });
    expect(row?.status).toBe('failed');
    expect(row?.error?.startsWith('channel_not_found')).toBe(true);
    failWith(null);
    await postDaily(deps, job);
    expect(replies).toHaveLength(1);
  });

  test('no chat connection is recorded as failed', async () => {
    const { deps, job } = await setup();
    deps.chatFor = async () => null;
    await postDaily(deps, job);
    const row = await getDelivery(db, {
      ...digestKey,
      kind: 'late_daily',
      subject: job.memberId,
    });
    expect(row?.status).toBe('failed');
    expect(row?.error).toBe('no_chat_connection');
  });

  test('a failed completion after replying leaves the delivery pending', async () => {
    const { deps, hooks, job } = await setup();
    const flaky = flakyDb();
    deps.db = flaky.db;
    hooks.afterSend = async () => flaky.failNextUpdate();
    await expect(postDaily(deps, job)).rejects.toThrow('db down');
    const row = await getDelivery(db, {
      ...digestKey,
      kind: 'late_daily',
      subject: job.memberId,
    });
    expect(row?.status).toBe('pending');
  });

  test('late daily for a google-chat team replies in thread when late_daily is thread', async () => {
    const { deps, replies, job } = await setup(true, GOOGLE_DIGEST_REF);
    const base = config();
    const team = base.teams[0];
    if (!team) throw new Error('no team');
    await setInstallationConfig(db, INST, {
      status: 'configured',
      config: {
        ...base,
        teams: [
          {
            ...team,
            chat: { provider: 'google-chat', channel: 'spaces/AAAA', postEachDaily: false },
          },
        ],
      },
    });
    await setIdentity(db, INST, job.memberId, 'slack', 'UALICE');
    await setIdentity(db, INST, job.memberId, 'google-chat', 'users/111');
    await linkSpace(GOOGLE_DIGEST_REF.channel);
    const google = fakeChat();
    deps.chatFor = async (_installationId, provider) =>
      provider === 'google-chat' ? google.chat : null;
    await postDaily(deps, job);
    expect(replies).toHaveLength(0);
    expect(google.replies).toHaveLength(1);
    expect(google.replies[0]?.ref).toEqual(GOOGLE_DIGEST_REF);
    const text = google.replies[0]?.msg.fallbackText ?? '';
    expect(text).toContain('late work');
    expect(text).toContain('@users/111');
    const row = await getDelivery(db, {
      ...digestKey,
      kind: 'late_daily',
      subject: job.memberId,
    });
    expect(row?.status).toBe('sent');
  });

  test('late daily to an unlinked space fails without replying', async () => {
    const { deps, replies, job } = await setup(true, GOOGLE_DIGEST_REF);
    const base = config();
    const team = base.teams[0];
    if (!team) throw new Error('no team');
    await setInstallationConfig(db, INST, {
      status: 'configured',
      config: {
        ...base,
        teams: [
          {
            ...team,
            chat: { provider: 'google-chat', channel: 'spaces/AAAA', postEachDaily: false },
          },
        ],
      },
    });
    const google = fakeChat();
    deps.chatFor = async () => google.chat;
    await postDaily(deps, job);
    expect(replies).toHaveLength(0);
    expect(google.replies).toHaveLength(0);
    const row = await getDelivery(db, {
      ...digestKey,
      kind: 'late_daily',
      subject: job.memberId,
    });
    expect(row?.status).toBe('failed');
    expect(row?.error).toBe('space_not_linked: the space is not linked to this organization');
  });

  test('a failed space lookup after the claim records the failure and rethrows', async () => {
    const { deps, replies, job } = await setup(true, GOOGLE_DIGEST_REF);
    const base = config();
    const team = base.teams[0];
    if (!team) throw new Error('no team');
    await setInstallationConfig(db, INST, {
      status: 'configured',
      config: {
        ...base,
        teams: [
          {
            ...team,
            chat: { provider: 'google-chat', channel: 'spaces/AAAA', postEachDaily: false },
          },
        ],
      },
    });
    await linkSpace(GOOGLE_DIGEST_REF.channel);
    const google = fakeChat();
    deps.chatFor = async () => google.chat;
    deps.db = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop !== 'select') return Reflect.get(target, prop, receiver);
        return (...args: Parameters<typeof db.select>) => {
          const query = target.select(...args);
          return new Proxy(query, {
            get(q, p, r) {
              if (p !== 'from') return Reflect.get(q, p, r);
              return (table: Parameters<typeof query.from>[0]) => {
                if (table === googleChatSpaces) throw new Error('db down');
                return q.from(table);
              };
            },
          });
        };
      },
    });
    await expect(postDaily(deps, job)).rejects.toThrow('db down');
    expect(replies).toHaveLength(0);
    expect(google.replies).toHaveLength(0);
    const key = { ...digestKey, kind: 'late_daily' as const, subject: job.memberId };
    const row = await getDelivery(db, key);
    expect(row?.status).toBe('failed');
    expect(row?.error).toBe('internal_error: unexpected error');
    expect((await claimDelivery(db, key)).status).toBe('claimed');
  });

  test('late daily mentions the config slack id first', async () => {
    const { deps, replies, job } = await setup();
    await setIdentity(db, INST, job.memberId, 'slack', 'UALICE');
    await setInstallationConfig(db, INST, {
      status: 'configured',
      config: config('[alice, bob]', 'members:\n  Alice: { slack: U0CONF }'),
    });
    await postDaily(deps, job);
    expect(replies[0]?.msg.fallbackText).toContain('@U0CONF');
  });
});

describe('postDaily on a team that posts each daily', () => {
  async function postingSetup(digestSent = false) {
    const ctx = await setup(digestSent, GOOGLE_DIGEST_REF);
    const base = config();
    const team = base.teams[0];
    if (!team) throw new Error('no team');
    await setInstallationConfig(db, INST, {
      status: 'configured',
      config: {
        ...base,
        teams: [{ ...team, chat: { provider: 'google-chat', channel: 'spaces/AAAA' } }],
      },
    });
    const google = fakeChat();
    ctx.deps.chatFor = async (_installationId, provider) =>
      provider === 'google-chat' ? google.chat : null;
    return { ...ctx, google };
  }

  const dailyKey = (memberId: string) => ({
    ...digestKey,
    kind: 'daily' as const,
    subject: memberId,
  });

  test('uses the existing queue name', () => {
    expect(POST_DAILY_JOB).toBe('send-late-daily');
  });

  test('posts to the team channel before the digest', async () => {
    const { deps, job, google } = await postingSetup();
    await linkSpace('spaces/AAAA');
    await postDaily(deps, job);
    expect(google.posted).toHaveLength(1);
    expect(google.posted[0]?.channel).toBe('spaces/AAAA');
    expect(google.replies).toHaveLength(0);
    expect(google.posted[0]?.msg.fallbackText).toContain('late work');
    expect(google.posted[0]?.msg.fallbackText).not.toContain('after the digest');
    expect((await getDelivery(db, dailyKey(job.memberId)))?.status).toBe('sent');
  });

  test('marks the post late after the digest', async () => {
    const { deps, job, google } = await postingSetup(true);
    await linkSpace('spaces/AAAA');
    await postDaily(deps, job);
    expect(google.posted).toHaveLength(1);
    expect(google.posted[0]?.msg.fallbackText).toContain('Daily sent after the digest');
    expect(google.replies).toHaveLength(0);
  });

  test('a second run for the same daily posts once', async () => {
    const { deps, job, google } = await postingSetup();
    await linkSpace('spaces/AAAA');
    await postDaily(deps, job);
    await postDaily(deps, job);
    expect(google.posted).toHaveLength(1);
  });

  test('an unlinked space fails the daily delivery without posting', async () => {
    const { deps, job, google } = await postingSetup();
    await postDaily(deps, job);
    expect(google.posted).toHaveLength(0);
    const row = await getDelivery(db, dailyKey(job.memberId));
    expect(row?.status).toBe('failed');
    expect(row?.error).toBe('space_not_linked: the space is not linked to this organization');
  });

  test('a person in two teams follows each team setting', async () => {
    const { deps, job, replies, posted } = await setup(true, DIGEST_REF);
    const base = config();
    const team = base.teams[0];
    if (!team) throw new Error('no team');
    await setInstallationConfig(db, INST, {
      status: 'configured',
      config: {
        ...base,
        teams: [
          { ...team, chat: { provider: 'slack', channel: '#alpha', postEachDaily: false } },
          {
            ...team,
            name: 'Beta',
            chat: { provider: 'google-chat', channel: 'spaces/BBBB' },
          },
        ],
      },
    });
    await linkSpace('spaces/BBBB');
    const slack = { posted, replies };
    const googleChat = fakeChat();
    const slackChat = deps.chatFor;
    deps.chatFor = async (installationId, provider) =>
      provider === 'google-chat' ? googleChat.chat : slackChat(installationId, provider);
    await postDaily(deps, job);
    expect(slack.replies).toHaveLength(1);
    expect(slack.posted).toHaveLength(0);
    expect(googleChat.posted).toHaveLength(1);
    expect(googleChat.posted[0]?.channel).toBe('spaces/BBBB');
  });

  test('with post_each_daily false nothing is posted before the digest', async () => {
    const { deps, job, posted, replies } = await setup(false);
    await postDaily(deps, job);
    expect(posted).toHaveLength(0);
    expect(replies).toHaveLength(0);
  });
});
