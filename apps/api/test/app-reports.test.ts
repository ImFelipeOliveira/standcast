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
  const { app, deps, queue } = createTestApp({ request });
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
  return { app, deps, queue, alice, bob, carol };
}

type App = Awaited<ReturnType<typeof harness>>['app'];

const call = (app: App, user: User, method: string, path: string, body?: unknown) =>
  app.request(`/v1/app/orgs/${path}`, {
    method,
    headers: {
      cookie: user.cookie,
      origin: APP,
      ...(method === 'GET' ? {} : { 'x-standcast-csrf': user.csrf }),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const llm = { provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-test-12345678' };
const report = {
  enabled: true,
  channel: '#alpha',
  weekday: 'fri',
  time: '16:00',
  productionBranch: 'main',
};

describe('/v1/app production report routes', () => {
  test('a session is required', async () => {
    const { app } = await harness();
    const res = await app.request(`/v1/app/orgs/${INST}/reports`, { headers: { origin: APP } });
    expect(res.status).toBe(401);
  });

  test('POST and DELETE need the csrf header', async () => {
    const { app, alice } = await harness();
    const noCsrf = { ...alice, csrf: 'wrong' };
    expect((await call(app, noCsrf, 'POST', `${INST}/reports/llm`, llm)).status).toBe(403);
    expect((await call(app, noCsrf, 'DELETE', `${INST}/reports/llm`)).status).toBe(403);
    expect((await call(app, noCsrf, 'DELETE', `${INST}/teams/Alpha/report`)).status).toBe(403);
  });

  test('an admin saves, reads and removes the llm settings', async () => {
    const { app, alice } = await harness();
    const saved = await call(app, alice, 'POST', `${INST}/reports/llm`, llm);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({
      manage: true,
      settings: { provider: 'deepseek', model: 'deepseek-chat', keyLast4: '5678' },
    });
    const read = await (await call(app, alice, 'GET', `${INST}/reports`)).json();
    expect(read.llm.settings.model).toBe('deepseek-chat');
    expect(read.teams.map((t: { team: string }) => t.team)).toEqual(['Alpha', 'Beta']);
    expect((await call(app, alice, 'DELETE', `${INST}/reports/llm`)).status).toBe(204);
    const after = await (await call(app, alice, 'GET', `${INST}/reports`)).json();
    expect(after.llm.settings).toBeNull();
  });

  test('a non-admin cannot touch the llm settings', async () => {
    const { app, bob } = await harness();
    expect((await call(app, bob, 'POST', `${INST}/reports/llm`, llm)).status).toBe(403);
    expect((await call(app, bob, 'DELETE', `${INST}/reports/llm`)).status).toBe(403);
    const read = await (await call(app, bob, 'GET', `${INST}/reports`)).json();
    expect(read.llm).toEqual({ manage: false });
  });

  test('wrong types or extra keys are a 422 before the use case runs', async () => {
    const { app, alice } = await harness();
    const llmBad = [
      { ...llm, provider: 'other' },
      { ...llm, model: 5 },
      { ...llm, apiKey: 5 },
      { ...llm, extra: 1 },
    ];
    for (const body of llmBad) {
      expect((await call(app, alice, 'POST', `${INST}/reports/llm`, body)).status).toBe(422);
    }
    const reportBad = [
      { ...report, enabled: 'yes' },
      { ...report, channel: 1 },
      { ...report, weekday: 'friday' },
      { ...report, time: 1600 },
      { ...report, productionBranch: null },
      { ...report, extra: 1 },
    ];
    for (const body of reportBad) {
      expect((await call(app, alice, 'POST', `${INST}/teams/Alpha/report`, body)).status).toBe(422);
    }
  });

  test('the use case still validates formats', async () => {
    const { app, alice } = await harness();
    const res = await call(app, alice, 'POST', `${INST}/teams/Alpha/report`, {
      ...report,
      time: '25:00',
    });
    expect(res.status).toBe(422);
  });

  test('a team manager saves and removes a team report, with the name url-decoded', async () => {
    const { app, alice } = await harness();
    const path = `${INST}/teams/${encodeURIComponent('Alpha')}/report`;
    const saved = await call(app, alice, 'POST', path, report);
    expect(saved.status).toBe(200);
    expect((await saved.json()).report).toMatchObject({ channel: '#alpha', weekday: 'fri' });
    const read = await (await call(app, alice, 'GET', `${INST}/reports`)).json();
    expect(read.teams[0].report.time).toBe('16:00');
    expect((await call(app, alice, 'DELETE', path)).status).toBe(204);
    expect((await call(app, alice, 'DELETE', path)).status).toBe(404);
  });

  test('a plain member cannot save a team report', async () => {
    const { app, bob } = await harness();
    const res = await call(app, bob, 'POST', `${INST}/teams/Alpha/report`, report);
    expect(res.status).toBe(403);
  });
});
