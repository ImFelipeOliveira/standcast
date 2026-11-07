import { describe, expect, test } from 'bun:test';
import { Validator } from '@seriousme/openapi-schema-validator';
import { parseConfig } from '@standcast/core';
import {
  createSession,
  getWebhookEndpointSecret,
  listInstallationWebhookEndpoints,
  setInstallationConfig,
  setMemberInstallations,
  upsertInstallation,
  upsertMember,
} from '@standcast/db';
import { csrfToken } from '@standcast/orchestrator';
import rootPackage from '../../../package.json' with { type: 'json' };
import { db, useCleanDb } from '../../../packages/db/test/setup';
import { openFlash } from '../src/web/flash';
import { createTestApp, type FakeRequest } from './support';

useCleanDb();

const INST = 11;
const URL_OK = 'https://hooks.example.com/standcast';
const SECRET = /whsec_[A-Za-z0-9_-]{43}/;

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

async function harness() {
  const admins = new Set(['alice']);
  const users = new Map([
    [1, 'alice'],
    [2, 'bob'],
  ]);
  const request: FakeRequest = async (route, params) => {
    const username = String(params.username ?? '').toLowerCase();
    if (route === 'GET /user/{account_id}') {
      return { status: 200, data: { login: users.get(Number(params.account_id)) } };
    }
    if (route === 'GET /orgs/{org}/members/{username}') return { status: 204 };
    if (route === 'GET /orgs/{org}/memberships/{username}') {
      return {
        status: 200,
        data: { role: admins.has(username) ? 'admin' : 'member', state: 'active' },
      };
    }
    throw Object.assign(new Error('not found'), { status: 404 });
  };
  const { app, queue } = createTestApp({ request });
  await upsertInstallation(db, { id: INST, accountLogin: 'acme', accountType: 'Organization' });
  await setInstallationConfig(db, INST, { status: 'configured', config: config() });
  const alice = await upsertMember(db, { githubUserId: 1, login: 'alice', email: null });
  const bob = await upsertMember(db, { githubUserId: 2, login: 'bob', email: null });
  await setMemberInstallations(db, alice.id, [INST]);
  await setMemberInstallations(db, bob.id, [INST]);
  const aliceToken = await createSession(db, alice.id, 'web');
  const bobToken = await createSession(db, bob.id, 'web');
  return {
    app,
    queue,
    admins,
    alice: { token: aliceToken, cookie: `sc_web=${aliceToken}` },
    bob: { token: bobToken, cookie: `sc_web=${bobToken}` },
  };
}

type App = Awaited<ReturnType<typeof harness>>['app'];
type User = { token: string; cookie: string };

const KEY = new Uint8Array(32).fill(7);

const setupPage = (app: App, cookie: string, headers: Record<string, string> = {}) =>
  app.request(`/setup?installation_id=${INST}`, { headers: { cookie, ...headers } });

const flashValue = (cookie: string) => decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1));

const post = (app: App, path: string, cookie: string, fields: [string, string][]) =>
  app.request(path, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });

const createFields = (csrf: string, extra: [string, string][] = []): [string, string][] => [
  ['csrf', csrf],
  ['installation_id', String(INST)],
  ['url', URL_OK],
  ['events', 'daily.submitted'],
  ['events', 'digest.sent'],
  ...extra,
];

const flashOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .find((c) => c.startsWith('sc_flash=')) ?? '';

async function createAndShow(app: App, user: User, headers: Record<string, string> = {}) {
  const res = await post(
    app,
    '/setup/webhooks',
    user.cookie,
    createFields(csrfToken('sess', user.token)),
  );
  const flash = flashOf(res);
  const location = res.headers.get('location') ?? '';
  const page = await app.request(location, {
    headers: { cookie: `${user.cookie}; ${flash}`, ...headers },
  });
  const opened = openFlash(KEY, user.token, INST, flashValue(flash));
  return {
    res,
    page,
    flash,
    secret: opened?.kind === 'webhook' ? opened.secret : '',
  };
}

async function endpointId(): Promise<string> {
  const [endpoint] = await listInstallationWebhookEndpoints(db, INST);
  if (!endpoint) throw new Error('no endpoint');
  return endpoint.id;
}

describe('webhooks section', () => {
  test('setup redirects an admin and a member to the app', async () => {
    const { app, alice, bob } = await harness();
    for (const cookie of [alice.cookie, bob.cookie]) {
      const res = await setupPage(app, cookie);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe(`https://app.test/setup?installation_id=${INST}`);
    }
  });

  test('an admin creates an endpoint and sees the secret once', async () => {
    const { app, alice } = await harness();
    const { res, page, secret } = await createAndShow(app, alice);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`/setup?installation_id=${INST}`);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(page.status).toBe(302);
    expect(page.headers.get('location') ?? '').not.toContain(secret);
    expect(secret).not.toBe('');
    expect(
      await getWebhookEndpointSecret(db, INST, await endpointId(), new Uint8Array(32).fill(7)),
    ).toBe(secret);
    const again = await setupPage(app, alice.cookie);
    expect(await again.text()).not.toMatch(SECRET);
    expect(await listInstallationWebhookEndpoints(db, INST)).toHaveLength(1);
  });

  test('the redirect target does not change with language', async () => {
    const { app, alice } = await harness();
    const { page } = await createAndShow(app, alice, { 'accept-language': 'en' });
    expect(page.headers.get('location')).toBe(`https://app.test/setup?installation_id=${INST}`);
  });

  test('an api key flash stays an api key and is not a webhook secret', async () => {
    const { app, alice } = await harness();
    const res = await post(app, '/setup/api-keys', alice.cookie, [
      ['csrf', csrfToken('sess', alice.token)],
      ['installation_id', String(INST)],
      ['name', 'Reporting'],
      ['scopes', 'teams:read'],
    ]);
    const opened = openFlash(KEY, alice.token, INST, flashValue(flashOf(res)));
    expect(opened?.kind).toBe('apiKey');
    const page = await app.request(`/setup?installation_id=${INST}`, {
      headers: { cookie: `${alice.cookie}; ${flashOf(res)}` },
    });
    const body = await page.text();
    expect(body).not.toMatch(/sck_[A-Za-z0-9_-]{43}/);
    expect(body).not.toMatch(SECRET);
    expect(page.headers.get('location') ?? '').not.toMatch(SECRET);
  });

  test('invalid urls and events are 422', async () => {
    const { app, alice } = await harness();
    const csrf = csrfToken('sess', alice.token);
    const base = createFields(csrf).filter(([k]) => k !== 'url');
    for (const url of [
      'http://hooks.example.com/',
      'https://10.0.0.1/',
      'https://a.example:8443/',
    ]) {
      expect(
        (await post(app, '/setup/webhooks', alice.cookie, [...base, ['url', url]])).status,
      ).toBe(422);
    }
    const noEvents = createFields(csrf).filter(([k]) => k !== 'events');
    expect((await post(app, '/setup/webhooks', alice.cookie, noEvents)).status).toBe(422);
    const unknown = [...noEvents, ['events', 'ping'] as [string, string]];
    expect((await post(app, '/setup/webhooks', alice.cookie, unknown)).status).toBe(422);
    expect(await listInstallationWebhookEndpoints(db, INST)).toEqual([]);
  });

  test('send a test event and see it in the latest deliveries', async () => {
    const { app, alice, queue } = await harness();
    await createAndShow(app, alice);
    const id = await endpointId();
    const csrf = csrfToken('sess', alice.token);
    const res = await post(app, `/setup/webhooks/${id}/test`, alice.cookie, [
      ['csrf', csrf],
      ['installation_id', String(INST)],
    ]);
    expect(res.status).toBe(303);
    expect(queue.enqueued.filter((j) => j.name === 'deliver-webhook')).toHaveLength(1);
  });

  test('an admin disables an endpoint', async () => {
    const { app, alice } = await harness();
    await createAndShow(app, alice);
    const id = await endpointId();
    const res = await post(app, `/setup/webhooks/${id}/disable`, alice.cookie, [
      ['csrf', csrfToken('sess', alice.token)],
      ['installation_id', String(INST)],
    ]);
    expect(res.status).toBe(303);
    const [endpoint] = await listInstallationWebhookEndpoints(db, INST);
    expect(endpoint?.active).toBe(false);
  });
});

describe('admin only and csrf', () => {
  test('a plain member gets 403 on every webhook form', async () => {
    const { app, alice, bob } = await harness();
    await createAndShow(app, alice);
    const id = await endpointId();
    const csrf = csrfToken('sess', bob.token);
    const fields: [string, string][] = [
      ['csrf', csrf],
      ['installation_id', String(INST)],
    ];
    expect((await post(app, '/setup/webhooks', bob.cookie, createFields(csrf))).status).toBe(403);
    expect((await post(app, `/setup/webhooks/${id}/disable`, bob.cookie, fields)).status).toBe(403);
    expect((await post(app, `/setup/webhooks/${id}/test`, bob.cookie, fields)).status).toBe(403);
    expect(await listInstallationWebhookEndpoints(db, INST)).toHaveLength(1);
  });

  test('posts without a valid csrf token get 403', async () => {
    const { app, alice, bob, queue } = await harness();
    await createAndShow(app, alice);
    const id = await endpointId();
    const without = createFields('').filter(([k]) => k !== 'csrf');
    expect((await post(app, '/setup/webhooks', alice.cookie, without)).status).toBe(403);
    const foreign = createFields(csrfToken('sess', bob.token));
    expect((await post(app, '/setup/webhooks', alice.cookie, foreign)).status).toBe(403);
    const fields: [string, string][] = [['installation_id', String(INST)]];
    expect((await post(app, `/setup/webhooks/${id}/disable`, alice.cookie, fields)).status).toBe(
      403,
    );
    expect((await post(app, `/setup/webhooks/${id}/test`, alice.cookie, fields)).status).toBe(403);
    expect(await listInstallationWebhookEndpoints(db, INST)).toHaveLength(1);
    expect((await listInstallationWebhookEndpoints(db, INST))[0]?.active).toBe(true);
    expect(queue.enqueued).toEqual([]);
  });

  test('an unknown endpoint is 404', async () => {
    const { app, alice } = await harness();
    const res = await post(
      app,
      '/setup/webhooks/00000000-0000-4000-8000-000000000000/disable',
      alice.cookie,
      [
        ['csrf', csrfToken('sess', alice.token)],
        ['installation_id', String(INST)],
      ],
    );
    expect(res.status).toBe(404);
  });
});

describe('openapi webhooks', () => {
  test('the public document has the webhooks section with the 3 events', async () => {
    const { app } = createTestApp();
    const res = await app.request('/openapi.json');
    const doc = (await res.json()) as {
      info: { version: string; description: string };
      webhooks: Record<
        string,
        {
          post: {
            tags: string[];
            summary: string;
            requestBody: { content: { 'application/json': { schema: unknown; example: unknown } } };
          };
        }
      >;
    };
    expect(doc.info.version).toBe(rootPackage.version);
    for (const event of ['daily.submitted', 'blocker.opened', 'digest.sent']) {
      const op = doc.webhooks[event]?.post;
      expect(op?.tags).toEqual(['Webhooks']);
      expect(op?.summary).toBeTruthy();
      const json = op?.requestBody.content['application/json'];
      expect(json?.schema).toBeDefined();
      expect((json?.example as { type: string } | undefined)?.type).toBe(event);
    }
    expect(doc.info.description).toContain('Standcast-Signature');
    const result = await new Validator().validate(doc);
    expect(result.errors).toBeUndefined();
  });
});
