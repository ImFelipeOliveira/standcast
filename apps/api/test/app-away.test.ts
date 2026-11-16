import { describe, expect, test } from 'bun:test';
import { parseConfig } from '@standcast/core';
import {
  createSession,
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
`);
  if (!parsed.ok) throw new Error('config');
  return parsed.config;
}

type User = { cookie: string; csrf: string };

async function harness() {
  const users = new Map([
    [1, 'alice'],
    [2, 'bob'],
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
  const session = async (githubUserId: number): Promise<User> => {
    const login = users.get(githubUserId) ?? '';
    const member = await upsertMember(db, { githubUserId, login, email: null });
    await setMemberInstallations(db, member.id, [INST]);
    const token = await createSession(db, member.id, 'web');
    return { cookie: `sc_web=${token}`, csrf: csrfToken('sess', token) };
  };
  return { app, alice: await session(1), bob: await session(2) };
}

type App = Awaited<ReturnType<typeof harness>>['app'];

const get = (app: App, user: User, path: string) =>
  app.request(`/v1/app/orgs/${path}`, { headers: { cookie: user.cookie, origin: APP } });

const post = (app: App, user: User, path: string, body?: unknown) =>
  app.request(`/v1/app/orgs/${path}`, {
    method: 'POST',
    headers: {
      cookie: user.cookie,
      origin: APP,
      'x-standcast-csrf': user.csrf,
      'content-type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

describe('/v1/app away', () => {
  test('a member marks, lists and cancels their own period', async () => {
    const { app, bob } = await harness();
    const created = await post(app, bob, `${INST}/away`, { until: '2026-10-30' });
    expect(created.status).toBe(201);
    const period = await created.json();
    expect(period).toMatchObject({
      login: 'bob',
      from: '2026-10-28',
      until: '2026-10-30',
      markedBy: 'bob',
      mine: true,
    });
    const listed = await get(app, bob, `${INST}/away`);
    expect(listed.status).toBe(200);
    expect((await listed.json()).data.map((p: { id: string }) => p.id)).toEqual([period.id]);
    expect((await post(app, bob, `${INST}/away/${period.id}/cancel`)).status).toBe(204);
    expect((await (await get(app, bob, `${INST}/away`)).json()).data).toEqual([]);
    const again = await post(app, bob, `${INST}/away/${period.id}/cancel`);
    expect(again.status).toBe(404);
    expect((await again.json()).error.code).toBe('not_found');
  });

  test('a member gets 403 marking someone else, a manager can', async () => {
    const { app, alice, bob } = await harness();
    const denied = await post(app, bob, `${INST}/away`, { until: '2026-10-30', login: 'alice' });
    expect(denied.status).toBe(403);
    const ok = await post(app, alice, `${INST}/away`, {
      from: '2026-10-29',
      until: '2026-10-30',
      login: 'bob',
    });
    expect(ok.status).toBe(201);
    expect(await ok.json()).toMatchObject({ login: 'bob', markedBy: 'alice', mine: false });
    const listed = await get(app, alice, `${INST}/away?login=bob`);
    expect((await listed.json()).data).toHaveLength(1);
    expect((await get(app, bob, `${INST}/away?login=alice`)).status).toBe(403);
  });

  test('invalid bodies and periods are 422', async () => {
    const { app, bob } = await harness();
    const bad = await post(app, bob, `${INST}/away`, { until: 'soon' });
    expect(bad.status).toBe(422);
    expect((await bad.json()).error.code).toBe('invalid_request');
    const past = await post(app, bob, `${INST}/away`, { until: '2026-10-01' });
    expect(past.status).toBe(422);
    expect((await past.json()).error.code).toBe('invalid_away_period');
    await post(app, bob, `${INST}/away`, { until: '2026-10-30' });
    const overlap = await post(app, bob, `${INST}/away`, { until: '2026-10-29' });
    expect(overlap.status).toBe(422);
    expect((await overlap.json()).error.code).toBe('away_overlap');
  });

  test('writes need the csrf token and the org must be linked', async () => {
    const { app, bob } = await harness();
    const noCsrf = await app.request(`/v1/app/orgs/${INST}/away`, {
      method: 'POST',
      headers: { cookie: bob.cookie, origin: APP, 'content-type': 'application/json' },
      body: JSON.stringify({ until: '2026-10-30' }),
    });
    expect(noCsrf.status).toBe(403);
    expect((await get(app, bob, '12/away')).status).toBe(403);
  });
});
