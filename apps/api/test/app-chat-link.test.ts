import { describe, expect, spyOn, test } from 'bun:test';
import { parseConfig } from '@standcast/core';
import {
  createSession,
  findGoogleChatSignInToken,
  getIdentityByLogin,
  issueGoogleChatSignInToken,
  setMemberInstallations,
  upsertMember,
} from '@standcast/db';
import { csrfToken, hashLinkCode } from '@standcast/orchestrator';
import { db, useCleanDb } from '../../../packages/db/test/setup';
import { INST, linkSpace, seedOrg } from '../../../packages/orchestrator/test/use-cases/fakes';
import { createTestApp } from './support';

useCleanDb();

const APP = 'https://app.test';
const TOKEN = 'token-one';
const PATH = '/v1/app/google-chat/link';

function googleConfig() {
  const parsed = parseConfig(`
teams:
  - name: Alpha
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [ana]
    members: [ana, bob]
    chat: { provider: google-chat, channel: "spaces/AAAA" }
`);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.config;
}

async function setup() {
  const { app, deps } = createTestApp();
  await seedOrg(googleConfig());
  await linkSpace('spaces/AAAA', INST);
  const ana = await upsertMember(db, { githubUserId: 5, login: 'ana', email: null });
  await setMemberInstallations(db, ana.id, [INST]);
  await issueGoogleChatSignInToken(db, {
    tokenHash: hashLinkCode(TOKEN),
    chatUserId: 'users/1',
    chatEmail: 'ana@acme.com',
    installationId: INST,
    spaceName: 'spaces/AAAA',
    expiresAt: new Date(deps.now().getTime() + 15 * 60 * 1000),
  });
  const session = await createSession(db, ana.id, 'web');
  const cookie = `sc_web=${session}`;
  const csrf = csrfToken('sess', session);
  const get = (token = TOKEN) =>
    app.request(`${PATH}?token=${token}`, { headers: { cookie, origin: APP } });
  const post = (body: unknown, headers: Record<string, string> = { 'x-standcast-csrf': csrf }) =>
    app.request(PATH, {
      method: 'POST',
      headers: { cookie, origin: APP, 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  const found = async (token = TOKEN) =>
    (await findGoogleChatSignInToken(db, hashLinkCode(token), deps.now())) !== null;
  const linked = () => getIdentityByLogin(db, INST, 'google-chat', 'ana');
  return { app, deps, get, post, found, linked };
}

describe('GET and POST /v1/app/google-chat/link', () => {
  test('without a session both routes answer 401', async () => {
    const { app } = createTestApp();
    const viewed = await app.request(`${PATH}?token=abc`, { headers: { origin: APP } });
    expect(viewed.status).toBe(401);
    const posted = await app.request(PATH, {
      method: 'POST',
      headers: { origin: APP, 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'abc' }),
    });
    expect(posted.status).toBe(401);
  });

  test('GET returns the confirm view without the language and keeps the token', async () => {
    const { get, found } = await setup();
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({
      status: 'confirm',
      login: 'ana',
      org: 'acme',
      account: 'ana@acme.com',
      replaces: false,
    });
    expect(await found()).toBe(true);
  });

  test('POST without the csrf header is forbidden and links nothing', async () => {
    const { post, found, linked } = await setup();
    const res = await post({ token: TOKEN }, {});
    expect(res.status).toBe(403);
    expect(await linked()).toBeNull();
    expect(await found()).toBe(true);
  });

  test('POST with the csrf header links and returns linked', async () => {
    const { post, found, linked } = await setup();
    const spy = spyOn(console, 'error');
    try {
      const res = await post({ token: TOKEN });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'linked', login: 'ana', org: 'acme' });
      expect(JSON.stringify(spy.mock.calls)).not.toContain('google chat link notice failed');
      expect(JSON.stringify(spy.mock.calls)).not.toContain(TOKEN);
    } finally {
      spy.mockRestore();
    }
    expect(await linked()).toBe('users/1');
    expect(await found()).toBe(false);
  });

  test('an unknown or expired token answers expired and links nothing', async () => {
    const { deps, get, post, linked } = await setup();
    await issueGoogleChatSignInToken(db, {
      tokenHash: hashLinkCode('token-old'),
      chatUserId: 'users/1',
      chatEmail: 'ana@acme.com',
      installationId: INST,
      spaceName: 'spaces/AAAA',
      expiresAt: new Date(deps.now().getTime() - 1000),
    });
    for (const token of ['unknown', 'token-old']) {
      const viewed = await get(token);
      expect(viewed.status).toBe(200);
      expect(await viewed.json()).toMatchObject({ status: 'expired' });
      const posted = await post({ token });
      expect(posted.status).toBe(200);
      expect(await posted.json()).toMatchObject({ status: 'expired' });
    }
    expect(await linked()).toBeNull();
  });

  test('POST rejects a body that is not a short token string', async () => {
    const { post, found } = await setup();
    for (const body of [{}, { token: 1 }, { token: 'x'.repeat(201) }, { token: TOKEN, extra: 1 }]) {
      expect((await post(body)).status).toBe(422);
    }
    expect(await found()).toBe(true);
  });
});
