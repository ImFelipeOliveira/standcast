import { describe, expect, test } from 'bun:test';
import { parseConfig } from '@standcast/core';
import {
  createSession,
  type MemberRow,
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
  return { app, alice, bob, carol };
}

type App = Awaited<ReturnType<typeof harness>>['app'];

const get = (app: App, user: User, path: string) =>
  app.request(`/v1/app/orgs/${path}`, { headers: { cookie: user.cookie, origin: APP } });

const postJson = (app: App, user: User, path: string, body: unknown) =>
  app.request(`/v1/app/orgs/${path}`, {
    method: 'POST',
    headers: {
      cookie: user.cookie,
      origin: APP,
      'x-standcast-csrf': user.csrf,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

const VALID = `teams:
  - name: Gamma
    timezone: America/Sao_Paulo
    remind_at: "09:30"
    digest_at: "10:30"
    managers: [alice]
    members: [bob]
    chat:
      provider: google-chat
      channel: spaces/GAMMA
    signals:
      blocker_alert_days: 3
members:
  bob:
    google_chat: users/77
`;

describe('/v1/app config editor', () => {
  test('admins read the current config to start from', async () => {
    const { app, alice } = await harness();
    const res = await get(app, alice, `${INST}/config`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.config.teams.map((t: { name: string }) => t.name)).toEqual(['Alpha', 'Beta']);
    expect(body.config.members.dave).toEqual({ googleChat: 'users/42' });
  });

  test('validation uses the server parser and returns its errors', async () => {
    const { app, alice } = await harness();
    expect(
      await (await postJson(app, alice, `${INST}/config/validate`, { source: VALID })).json(),
    ).toEqual({
      ok: true,
    });
    const invalid = await (
      await postJson(app, alice, `${INST}/config/validate`, {
        source: VALID.replace('blocker_alert_days: 3', 'blocker_alert_days: 0'),
      })
    ).json();
    expect(invalid.ok).toBe(false);
    expect(invalid.errors[0].path).toContain('blocker_alert_days');
  });

  test('config reading and validation are admin only and bounded', async () => {
    const { app, bob, alice } = await harness();
    expect((await get(app, bob, `${INST}/config`)).status).toBe(403);
    expect((await postJson(app, bob, `${INST}/config/validate`, { source: VALID })).status).toBe(
      403,
    );
    expect(
      (await postJson(app, alice, `${INST}/config/validate`, { source: 'x'.repeat(70_000) }))
        .status,
    ).toBe(422);
  });
});
