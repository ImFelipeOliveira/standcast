import { describe, expect, test } from 'bun:test';
import { parseConfig } from '@standcast/core';
import {
  createSession,
  getWebhookDelivery,
  insertWebhookDeliveries,
  insertWebhookEndpoint,
  type MemberRow,
  setIdentity,
  setInstallationConfig,
  setMemberInstallations,
  upsertInstallation,
  upsertMember,
} from '@standcast/db';
import { csrfToken } from '@standcast/orchestrator';
import { db, useCleanDb } from '../../../packages/db/test/setup';
import { createTestApp, type FakeRequest } from './support';

useCleanDb();

const APP = 'https://app.test';
const INST = 11;
const FOREIGN = 12;

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
    tracker: { provider: linear, team: BE }
  - name: Beta
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [carol]
    members: [bob, dave]
    chat: { provider: google-chat, channel: spaces/BETA }
members:
  alice:
    linear: alice@acme.dev
  dave:
    google_chat: users/42
`);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.config;
}

type User = { cookie: string; csrf: string; member: MemberRow };

async function harness() {
  const users = new Map([
    [1, 'alice'],
    [2, 'bob'],
    [3, 'carol'],
  ]);
  const request: FakeRequest = async (route, params) => {
    const username = String(params.username ?? '').toLowerCase();
    if (route === 'GET /user/{account_id}') {
      return { status: 200, data: { login: users.get(Number(params.account_id)) } };
    }
    if (route === 'GET /orgs/{org}/members/{username}' && params.org === 'acme') {
      return { status: 204 };
    }
    if (route === 'GET /orgs/{org}/memberships/{username}' && params.org === 'acme') {
      return {
        status: 200,
        data: { role: username === 'alice' ? 'admin' : 'member', state: 'active' },
      };
    }
    throw Object.assign(new Error('not found'), { status: 404 });
  };
  const { app } = createTestApp({ request });
  await upsertInstallation(db, { id: INST, accountLogin: 'acme', accountType: 'Organization' });
  await upsertInstallation(db, { id: FOREIGN, accountLogin: 'other', accountType: 'Organization' });
  await setInstallationConfig(db, INST, { status: 'configured', config: config() });
  const session = async (githubUserId: number): Promise<User> => {
    const login = users.get(githubUserId) ?? '';
    const member = await upsertMember(db, { githubUserId, login, email: null });
    await setMemberInstallations(db, member.id, [INST]);
    const token = await createSession(db, member.id, 'web');
    return { cookie: `sc_web=${token}`, csrf: csrfToken('sess', token), member };
  };
  const alice = await session(1);
  const bob = await session(2);
  const carol = await session(3);
  await setIdentity(db, INST, bob.member.id, 'slack', 'U0BOB');
  await createSession(db, bob.member.id, 'cli');
  return { app, alice, bob, carol };
}

type App = Awaited<ReturnType<typeof harness>>['app'];

const get = (app: App, user: User, path: string) =>
  app.request(`/v1/app/orgs/${path}`, { headers: { cookie: user.cookie, origin: APP } });

const post = (app: App, user: User, path: string) =>
  app.request(`/v1/app/orgs/${path}`, {
    method: 'POST',
    headers: { cookie: user.cookie, origin: APP, 'x-standcast-csrf': user.csrf },
  });

describe('/v1/app people and links', () => {
  test('admins see how each config member is found in the chat and tracker', async () => {
    const { app, alice } = await harness();
    const res = await get(app, alice, `${INST}/people`);
    expect(res.status).toBe(200);
    expect((await res.json()).people).toEqual([
      {
        login: 'alice',
        teams: ['Alpha'],
        managerOf: ['Alpha'],
        chat: [{ provider: 'slack', status: 'missing', source: null }],
        tracker: [{ provider: 'linear', status: 'linked', source: 'config' }],
        cli: false,
      },
      {
        login: 'bob',
        teams: ['Alpha', 'Beta'],
        managerOf: [],
        chat: [
          { provider: 'google-chat', status: 'missing', source: null },
          { provider: 'slack', status: 'linked', source: 'identity' },
        ],
        tracker: [{ provider: 'linear', status: 'missing', source: null }],
        cli: true,
      },
      {
        login: 'carol',
        teams: [],
        managerOf: ['Beta'],
        chat: [{ provider: 'google-chat', status: 'missing', source: null }],
        tracker: [],
        cli: false,
      },
      {
        login: 'dave',
        teams: ['Beta'],
        managerOf: [],
        chat: [{ provider: 'google-chat', status: 'linked', source: 'config' }],
        tracker: [],
        cli: false,
      },
    ]);
  });

  test('only members of this installation with an active CLI session count', async () => {
    const { app, alice, carol } = await harness();
    const dave = await upsertMember(db, { githubUserId: 4, login: 'dave', email: null });
    await setMemberInstallations(db, dave.id, [FOREIGN]);
    await createSession(db, dave.id, 'cli');
    await createSession(db, carol.member.id, 'cli');
    await db.execute(
      `update sessions set last_used_at = now() - interval '200 days' where member_id = '${carol.member.id}' and kind = 'cli'`,
    );
    const people = (await (await get(app, alice, `${INST}/people`)).json()).people as {
      login: string;
      cli: boolean;
    }[];
    expect(people.find((p) => p.login === 'dave')?.cli).toBe(false);
    expect(people.find((p) => p.login === 'carol')?.cli).toBe(false);
  });

  test('people and links is admin only', async () => {
    const { app, bob } = await harness();
    expect((await get(app, bob, `${INST}/people`)).status).toBe(403);
    expect((await get(app, bob, `${FOREIGN}/people`)).status).toBe(403);
  });
});

describe('/v1/app webhook redelivery', () => {
  async function delivery(status: 'failed' | 'delivered', installationId = INST) {
    const endpoint = await insertWebhookEndpoint(
      db,
      {
        installationId,
        url: `https://hooks.example.com/${status}-${installationId}-${crypto.randomUUID()}`,
        events: ['daily.submitted'],
        secret: 'whsec',
      },
      new Uint8Array(32).fill(1),
    );
    const [id] = await insertWebhookDeliveries(db, [
      {
        endpointId: endpoint.id,
        event: 'daily.submitted',
        eventId: crypto.randomUUID(),
        payload: {},
        nextAttemptAt: new Date('2026-10-28T10:00:00Z'),
      },
    ]);
    if (!id) throw new Error('delivery');
    const row = { id };
    if (status !== 'failed') {
      await db.execute(
        `update webhook_deliveries set status = '${status}', attempts = 1 where id = '${row.id}'`,
      );
    } else {
      await db.execute(
        `update webhook_deliveries set status = 'failed', attempts = 5, last_error = 'timeout', last_status_code = 500 where id = '${row.id}'`,
      );
    }
    return row.id;
  }

  test('an admin puts a failed delivery back in the queue', async () => {
    const { app, alice } = await harness();
    const id = await delivery('failed');
    const res = await post(app, alice, `${INST}/webhooks/deliveries/${id}/redeliver`);
    expect(res.status).toBe(204);
    const row = await getWebhookDelivery(db, id);
    expect(row).toMatchObject({
      status: 'pending',
      attempts: 0,
      lastError: null,
      lastStatusCode: null,
    });
  });

  test('delivered, foreign and non-admin redeliveries are refused', async () => {
    const { app, alice, bob } = await harness();
    const delivered = await delivery('delivered');
    expect(
      (await post(app, alice, `${INST}/webhooks/deliveries/${delivered}/redeliver`)).status,
    ).toBe(404);
    const foreign = await delivery('failed', FOREIGN);
    expect(
      (await post(app, alice, `${INST}/webhooks/deliveries/${foreign}/redeliver`)).status,
    ).toBe(404);
    const failed = await delivery('failed');
    expect((await post(app, bob, `${INST}/webhooks/deliveries/${failed}/redeliver`)).status).toBe(
      403,
    );
  });
});
