import { describe, expect, test } from 'bun:test';
import { parseConfig } from '@standcast/core';
import {
  claimDelivery,
  completeDelivery,
  createSession,
  failDelivery,
  type MemberRow,
  saveConnection,
  setInstallationConfig,
  setMemberInstallations,
  upsertDaily,
  upsertInstallation,
  upsertMember,
} from '@standcast/db';
import { db, useCleanDb } from '../../../packages/db/test/setup';
import { createTestApp, type FakeRequest } from './support';

useCleanDb();

const APP = 'https://app.test';
const INST = 11;

function config() {
  const parsed = parseConfig(`
teams:
  - name: Alpha
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [alice]
    members: [alice, bob]
    chat: { provider: slack, channel: "#alpha" }
  - name: Beta
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [carol]
    members: [carol]
    chat: { provider: google-chat, channel: spaces/BETA }
`);
  if (!parsed.ok) throw new Error('config');
  return parsed.config;
}

type User = { cookie: string; member: MemberRow };

const pr = (n: number) => ({
  kind: 'pull_request' as const,
  url: `https://github.com/acme/api/pull/${n}`,
  title: `PR ${n}`,
});

async function harness() {
  const users = new Map([
    [1, 'alice'],
    [2, 'bob'],
    [3, 'carol'],
  ]);
  const request: FakeRequest = async (route, params) => {
    if (route === 'GET /user/{account_id}') {
      return { status: 200, data: { login: users.get(Number(params.account_id)) } };
    }
    if (route === 'GET /orgs/{org}/members/{username}' && params.org === 'acme') {
      return { status: 204 };
    }
    if (route === 'GET /orgs/{org}/memberships/{username}' && params.org === 'acme') {
      return { status: 200, data: { role: 'member', state: 'active' } };
    }
    throw Object.assign(new Error('not found'), { status: 404 });
  };
  const { app, setNow } = createTestApp({ request });
  setNow(new Date('2026-10-28T12:00:00Z'));
  await upsertInstallation(db, { id: INST, accountLogin: 'acme', accountType: 'Organization' });
  await setInstallationConfig(db, INST, { status: 'configured', config: config() });
  await saveConnection(db, INST, 'slack', 'T999', 'xoxb', new Uint8Array(32).fill(1));
  const session = async (githubUserId: number): Promise<User> => {
    const login = users.get(githubUserId) ?? '';
    const member = await upsertMember(db, { githubUserId, login, email: null });
    await setMemberInstallations(db, member.id, [INST]);
    const token = await createSession(db, member.id, 'web');
    return { cookie: `sc_web=${token}`, member };
  };
  const alice = await session(1);
  const bob = await session(2);
  const carol = await session(3);
  const daily = (member: MemberRow, date: string, payload: Record<string, unknown>) =>
    upsertDaily(db, {
      installationId: INST,
      memberId: member.id,
      date,
      payload: { org: 'acme', yesterday: [], today: [], blockers: [], support: [], ...payload },
      submittedAt: new Date(`${date}T12:00:00Z`),
    });
  await daily(bob.member, '2026-10-26', {
    yesterday: [
      { text: 'Webhook queue with retries', ref: pr(8371) },
      { text: 'Talked to design' },
    ],
    today: [{ text: 'Load tests' }],
  });
  await daily(alice.member, '2026-10-27', {
    yesterday: [{ text: 'Cache for opening hours', ref: pr(8366) }],
    today: [{ text: 'Review the webhook contract' }],
    blockers: [{ text: 'Waiting on the Partner webhook contract' }],
  });
  await daily(bob.member, '2026-10-27', { today: [{ text: 'Batch invoices' }] });
  const sent = {
    installationId: INST,
    teamName: 'Alpha',
    date: '2026-10-27',
    kind: 'digest' as const,
  };
  const claim = await claimDelivery(db, sent);
  if (claim.status !== 'claimed') throw new Error('claim');
  await completeDelivery(db, sent, claim.token, { channel: 'C123', id: '1.2' });
  const failed = {
    installationId: INST,
    teamName: 'Alpha',
    date: '2026-10-26',
    kind: 'digest' as const,
  };
  const second = await claimDelivery(db, failed);
  if (second.status !== 'claimed') throw new Error('claim');
  await failDelivery(db, failed, second.token, 'channel_not_found');
  return { app, alice, bob, carol };
}

type App = Awaited<ReturnType<typeof harness>>['app'];

const get = (app: App, user: User, path: string) =>
  app.request(`/v1/app/orgs/${INST}/teams/${path}`, {
    headers: { cookie: user.cookie, origin: APP },
  });

describe('/v1/app team history', () => {
  test('lists days with team counts, digest status and chat link, never who did not send', async () => {
    const { app, bob } = await harness();
    const res = await get(app, bob, 'Alpha/history/digests?from=2026-10-25&to=2026-10-28');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider).toBe('slack');
    expect(body.days).toEqual([
      {
        date: '2026-10-27',
        status: 'sent',
        sentAt: expect.any(String),
        dailies: 2,
        blockers: 1,
        chatUrl: 'https://slack.com/app_redirect?team=T999&channel=C123',
      },
      {
        date: '2026-10-26',
        status: 'failed',
        sentAt: null,
        dailies: 1,
        blockers: 0,
        chatUrl: null,
      },
    ]);
    expect(JSON.stringify(body)).not.toContain('missing');
  });

  test('a day shows the full digest: blockers, shipped and what the team will do', async () => {
    const { app, alice } = await harness();
    const body = await (await get(app, alice, 'Alpha/history/digests/2026-10-27')).json();
    expect(body).toMatchObject({
      date: '2026-10-27',
      status: 'sent',
      chatUrl: 'https://slack.com/app_redirect?team=T999&channel=C123',
      blockers: [{ author: 'alice', text: 'Waiting on the Partner webhook contract', ref: null }],
      shipped: [{ author: 'alice', text: 'Cache for opening hours', ref: { url: pr(8366).url } }],
      today: [
        { author: 'alice', items: [{ text: 'Review the webhook contract', ref: null }] },
        { author: 'bob', items: [{ text: 'Batch invoices', ref: null }] },
      ],
    });
  });

  test('search matches text and refs in confirmed dailies within the range', async () => {
    const { app, bob } = await harness();
    const body = await (
      await get(app, bob, 'Alpha/history/search?q=WEBHOOK&from=2026-10-20&to=2026-10-28')
    ).json();
    expect(
      body.results.map((r: { date: string; author: string; section: string }) => [
        r.date,
        r.author,
        r.section,
      ]),
    ).toEqual([
      ['2026-10-27', 'alice', 'today'],
      ['2026-10-27', 'alice', 'blockers'],
      ['2026-10-26', 'bob', 'yesterday'],
    ]);
    const byRef = await (await get(app, bob, 'Alpha/history/search?q=pull%2F8366')).json();
    expect(byRef.results).toHaveLength(1);
  });

  test('search rejects short queries and wide ranges', async () => {
    const { app, bob } = await harness();
    expect((await get(app, bob, 'Alpha/history/search?q=a')).status).toBe(422);
    expect(
      (await get(app, bob, 'Alpha/history/search?q=web&from=2026-01-01&to=2026-10-28')).status,
    ).toBe(422);
  });

  test('shipped groups pull requests and cards by day', async () => {
    const { app, bob } = await harness();
    const body = await (
      await get(app, bob, 'Alpha/history/shipped?from=2026-10-22&to=2026-10-28')
    ).json();
    expect(body).toMatchObject({
      from: '2026-10-22',
      to: '2026-10-28',
      days: [
        { date: '2026-10-27', items: [{ author: 'alice', text: 'Cache for opening hours' }] },
        { date: '2026-10-26', items: [{ author: 'bob', text: 'Webhook queue with retries' }] },
      ],
    });
  });

  test('other teams are forbidden and unknown teams are not found', async () => {
    const { app, carol, bob } = await harness();
    for (const path of [
      'Alpha/history/digests',
      'Alpha/history/digests/2026-10-27',
      'Alpha/history/search?q=web',
      'Alpha/history/shipped',
    ]) {
      expect((await get(app, carol, path)).status, path).toBe(403);
    }
    expect((await get(app, bob, 'Nope/history/digests')).status).toBe(404);
    expect((await get(app, bob, 'Alpha/history/digests/oops')).status).toBe(422);
  });
});
