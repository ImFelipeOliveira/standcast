import { describe, expect, test } from 'bun:test';
import { parseConfig } from '@standcast/core';
import {
  createApiKey,
  createSession,
  insertWebhookEndpoint,
  listApiKeys,
  listInstallationWebhookEndpoints,
  type MemberRow,
  setInstallationConfig,
  setMemberInstallations,
  upsertInstallation,
  upsertMember,
} from '@standcast/db';
import { createMembershipCheck, csrfToken, getSetupStatus } from '@standcast/orchestrator';
import { db, useCleanDb } from '../../../packages/db/test/setup';
import { createTestApp, type FakeRequest } from './support';

useCleanDb();

const APP = 'https://app.test';
const INST = 11;
const FOREIGN = 12;
const HOOK_URL = 'https://hooks.example.com/standcast';

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
    members: [dave]
    chat: { provider: slack, channel: "#beta" }
`);
  if (!parsed.ok) throw new Error('config');
  return parsed.config;
}

type User = { cookie: string; csrf: string; member: MemberRow };

async function harness() {
  const admins = new Set(['alice']);
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
    if (route === 'GET /orgs/{org}/members/{username}') {
      if (params.org === 'acme') return { status: 204 };
      throw Object.assign(new Error('not found'), { status: 404 });
    }
    if (route === 'GET /orgs/{org}/memberships/{username}' && params.org === 'acme') {
      return {
        status: 200,
        data: { role: admins.has(username) ? 'admin' : 'member', state: 'active' },
      };
    }
    if (route === 'GET /repos/{owner}/{repo}') {
      return { status: 200, data: { default_branch: 'main' } };
    }
    throw Object.assign(new Error('not found'), { status: 404 });
  };
  const { app, deps, queue } = createTestApp({ request });
  await upsertInstallation(db, { id: INST, accountLogin: 'acme', accountType: 'Organization' });
  await upsertInstallation(db, {
    id: FOREIGN,
    accountLogin: 'other',
    accountType: 'Organization',
  });
  await setInstallationConfig(db, INST, { status: 'configured', config: config() });
  const session = async (githubUserId: number): Promise<User> => {
    const login = users.get(githubUserId) ?? '';
    const member = await upsertMember(db, { githubUserId, login, email: null });
    await setMemberInstallations(db, member.id, [INST]);
    const token = await createSession(db, member.id, 'web');
    return { cookie: `sc_web=${token}`, csrf: csrfToken('sess', token), member };
  };
  return {
    app,
    deps,
    queue,
    admins,
    alice: await session(1),
    bob: await session(2),
    carol: await session(3),
  };
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

describe('/v1/app/orgs', () => {
  test('setup returns the same status as the page', async () => {
    const { app, deps, alice } = await harness();
    const res = await get(app, alice, `${INST}/setup`);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(APP);
    const direct = await getSetupStatus(deps, createMembershipCheck(deps), alice.member, INST);
    expect(await res.json()).toEqual(JSON.parse(JSON.stringify(direct)));
  });

  test('other installation is forbidden', async () => {
    const { app, alice } = await harness();
    for (const path of [`${FOREIGN}/setup`, `${FOREIGN}/context`, 'abc/setup', '1e3/context']) {
      const res = await get(app, alice, path);
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe('forbidden');
    }
    const write = await post(app, alice, `${FOREIGN}/api-keys`, {
      name: 'CI',
      scopes: ['teams:read'],
    });
    expect(write.status).toBe(403);
  });

  test('non-admin cannot create keys', async () => {
    const { app, bob } = await harness();
    const res = await post(app, bob, `${INST}/api-keys`, { name: 'CI', scopes: ['teams:read'] });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toEqual({
      code: 'forbidden',
      message: 'only an organization admin can manage this installation',
    });
    const webhook = await post(app, bob, `${INST}/webhooks`, {
      url: HOOK_URL,
      events: ['daily.submitted'],
    });
    expect(webhook.status).toBe(403);
  });

  test('a non-admin cannot disable or test a webhook', async () => {
    const { app, queue, alice, bob } = await harness();
    const created = await post(app, alice, `${INST}/webhooks`, {
      url: HOOK_URL,
      events: ['daily.submitted'],
    });
    const id = (await created.json()).endpoint.id;
    for (const action of ['disable', 'test']) {
      const res = await post(app, bob, `${INST}/webhooks/${id}/${action}`);
      expect(res.status).toBe(403);
    }
    const [endpoint] = await listInstallationWebhookEndpoints(db, INST);
    expect(endpoint?.active).toBe(true);
    expect(queue.enqueued.filter((job) => job.name === 'deliver-webhook')).toHaveLength(0);
  });

  test('create key returns the secret once', async () => {
    const { app, alice } = await harness();
    const res = await post(app, alice, `${INST}/api-keys`, {
      name: '  CI  ',
      scopes: ['teams:read', 'dailies:read'],
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.secret).toStartWith('sck_');
    expect(body.key).toEqual({
      id: expect.any(String),
      name: 'CI',
      prefix: body.secret.slice(4, 12),
      scopes: ['teams:read', 'dailies:read'],
      createdAt: expect.any(String),
      lastUsedAt: null,
      revokedAt: null,
    });
    const setup = await (await get(app, alice, `${INST}/setup`)).json();
    expect(setup.apiKeys).toEqual({ manage: true, keys: [body.key] });
    expect(JSON.stringify(setup)).not.toContain(body.secret);
  });

  test('invalid bodies are rejected with the issues', async () => {
    const { app, alice } = await harness();
    const cases: [string, unknown][] = [
      [`${INST}/api-keys`, { name: 'CI', scopes: ['nope'] }],
      [`${INST}/api-keys`, { name: 'CI' }],
      [`${INST}/api-keys`, undefined],
      [`${INST}/webhooks`, { url: HOOK_URL, events: 'daily.submitted' }],
      [`${INST}/webhooks`, { events: ['daily.submitted'] }],
    ];
    for (const [path, body] of cases) {
      const res = await post(app, alice, path, body);
      expect(res.status).toBe(422);
      const { error } = await res.json();
      expect(error.code).toBe('invalid_request');
      expect(Array.isArray(error.issues)).toBe(true);
    }
    const empty = await post(app, alice, `${INST}/api-keys`, { name: ' ', scopes: ['teams:read'] });
    expect(empty.status).toBe(422);
  });

  test('revoke, disable and test', async () => {
    const { app, queue, alice } = await harness();
    const key = await (
      await post(app, alice, `${INST}/api-keys`, { name: 'CI', scopes: ['teams:read'] })
    ).json();
    const revoked = await post(app, alice, `${INST}/api-keys/${key.key.id}/revoke`);
    expect(revoked.status).toBe(204);
    const again = await post(app, alice, `${INST}/api-keys/${key.key.id}/revoke`);
    expect(again.status).toBe(404);

    const created = await post(app, alice, `${INST}/webhooks`, {
      url: HOOK_URL,
      events: ['daily.submitted', 'daily.submitted'],
    });
    expect(created.status).toBe(201);
    const hook = await created.json();
    expect(hook.secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(hook.endpoint).toEqual({
      id: expect.any(String),
      url: HOOK_URL,
      events: ['daily.submitted'],
      active: true,
      disabledReason: null,
      consecutiveFailures: 0,
      createdAt: expect.any(String),
    });

    const tested = await post(app, alice, `${INST}/webhooks/${hook.endpoint.id}/test`);
    expect(tested.status).toBe(202);
    expect(queue.enqueued.filter((j) => j.name === 'deliver-webhook')).toHaveLength(1);

    const disabled = await post(app, alice, `${INST}/webhooks/${hook.endpoint.id}/disable`);
    expect(disabled.status).toBe(204);
    const [endpoint] = await listInstallationWebhookEndpoints(db, INST);
    expect(endpoint?.active).toBe(false);
    const testDisabled = await post(app, alice, `${INST}/webhooks/${hook.endpoint.id}/test`);
    expect(testDisabled.status).toBe(404);
  });

  test("admin of one installation cannot revoke, disable or test another installation's key or endpoint", async () => {
    const { app, deps, queue, alice } = await harness();
    const foreignKey = await createApiKey(db, {
      installationId: FOREIGN,
      name: 'Other CI',
      scopes: ['teams:read'],
      createdBy: alice.member.id,
    });
    const foreignHook = await insertWebhookEndpoint(
      db,
      { installationId: FOREIGN, url: HOOK_URL, events: ['daily.submitted'], secret: 'whsec_x' },
      deps.encryptionKey,
    );
    const attempts: [string, number, string][] = [
      [`${INST}/api-keys/${foreignKey.id}/revoke`, 404, 'not_found'],
      [`${INST}/webhooks/${foreignHook.id}/disable`, 404, 'not_found'],
      [`${INST}/webhooks/${foreignHook.id}/test`, 404, 'not_found'],
      [`${FOREIGN}/api-keys/${foreignKey.id}/revoke`, 403, 'forbidden'],
      [`${FOREIGN}/webhooks/${foreignHook.id}/disable`, 403, 'forbidden'],
      [`${FOREIGN}/webhooks/${foreignHook.id}/test`, 403, 'forbidden'],
    ];
    for (const [path, status, code] of attempts) {
      const res = await post(app, alice, path);
      expect({ path, status: res.status }).toEqual({ path, status });
      expect((await res.json()).error.code).toBe(code);
    }
    const [key] = await listApiKeys(db, FOREIGN);
    expect(key?.revokedAt).toBeNull();
    const [hook] = await listInstallationWebhookEndpoints(db, FOREIGN);
    expect(hook?.active).toBe(true);
    expect(queue.enqueued.filter((j) => j.name === 'deliver-webhook')).toHaveLength(0);
  });

  test('writes need the csrf header', async () => {
    const { app, alice } = await harness();
    const res = await app.request(`/v1/app/orgs/${INST}/api-keys`, {
      method: 'POST',
      headers: { cookie: alice.cookie, origin: APP, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'CI', scopes: ['teams:read'] }),
    });
    expect(res.status).toBe(403);
  });

  test('webhook disable and test reject a missing or foreign csrf token', async () => {
    const { app, queue, alice, bob } = await harness();
    const created = await post(app, alice, `${INST}/webhooks`, {
      url: HOOK_URL,
      events: ['daily.submitted'],
    });
    const id = (await created.json()).endpoint.id;
    const send = (action: string, csrf?: string) =>
      app.request(`/v1/app/orgs/${INST}/webhooks/${id}/${action}`, {
        method: 'POST',
        headers: {
          cookie: alice.cookie,
          origin: APP,
          'content-type': 'application/json',
          ...(csrf === undefined ? {} : { 'x-standcast-csrf': csrf }),
        },
      });
    for (const action of ['disable', 'test']) {
      expect((await send(action)).status).toBe(403);
      expect((await send(action, bob.csrf)).status).toBe(403);
    }
    const [endpoint] = await listInstallationWebhookEndpoints(db, INST);
    expect(endpoint?.active).toBe(true);
    expect(queue.enqueued.filter((job) => job.name === 'deliver-webhook')).toHaveLength(0);
  });

  test('context for an admin, a manager-only person and a plain member', async () => {
    const { app, alice, bob, carol } = await harness();
    const contextOf = async (user: User) => {
      const res = await get(app, user, `${INST}/context`);
      expect(res.status).toBe(200);
      return res.json();
    };
    expect(await contextOf(alice)).toEqual({
      admin: true,
      managerOf: ['Alpha'],
      memberOf: ['Alpha'],
    });
    expect(await contextOf(carol)).toEqual({ admin: false, managerOf: ['Beta'], memberOf: [] });
    expect(await contextOf(bob)).toEqual({ admin: false, managerOf: [], memberOf: ['Alpha'] });
  });
});
