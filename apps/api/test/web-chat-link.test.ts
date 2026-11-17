import { describe, expect, test } from 'bun:test';
import { parseConfig, t } from '@standcast/core';
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

const TOKEN = 'token-one';
const PATH = '/link/google-chat';

function googleConfig(language: string) {
  const parsed = parseConfig(`
teams:
  - name: Alpha
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    language: ${language}
    managers: [ana]
    members: [ana, bob]
    chat: { provider: google-chat, channel: "spaces/AAAA" }
`);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.config;
}

async function setup(language = 'en') {
  const { app, deps } = createTestApp();
  await seedOrg(googleConfig(language));
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
  const post = (fields: Record<string, string>) =>
    app.request(PATH, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields),
    });
  const get = (token = TOKEN) => app.request(`${PATH}?token=${token}`, { headers: { cookie } });
  const found = async () =>
    (await findGoogleChatSignInToken(db, hashLinkCode(TOKEN), deps.now())) !== null;
  return { app, get, post, csrf, found };
}

describe('GET and POST /link/google-chat', () => {
  test('without a session the link redirects through GitHub sign-in and back', async () => {
    const { app } = createTestApp();
    const res = await app.request(`${PATH}?token=abc`);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(
      '/auth/github/login?next=%2Flink%2Fgoogle-chat%3Ftoken%3Dabc',
    );
  });

  test('with a session the page asks to confirm and keeps the token', async () => {
    const { get, found } = await setup();
    const res = await get();
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toContain('ana@acme.com');
    expect(body).toContain('@ana');
    expect(body).toContain('acme');
    expect(body).toContain(`name="token" value="${TOKEN}"`);
    expect(body).toContain('name="csrf"');
    expect(await found()).toBe(true);
  });

  test('posting with the csrf field links and shows the linked text', async () => {
    const { post, csrf, found } = await setup();
    const res = await post({ token: TOKEN, csrf });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('linked in acme, @ana. You can close this page.');
    expect(await getIdentityByLogin(db, INST, 'google-chat', 'ana')).toBe('users/1');
    expect(await found()).toBe(false);
  });

  test('posting without a valid csrf field is forbidden and links nothing', async () => {
    const { post, found } = await setup();
    const res = await post({ token: TOKEN, csrf: 'nope' });
    expect(res.status).toBe(403);
    expect(await getIdentityByLogin(db, INST, 'google-chat', 'ana')).toBeNull();
    expect(await found()).toBe(true);
  });

  test('an expired token shows the expired text', async () => {
    const { get, post, csrf } = await setup();
    const text = t('en', 'web.chatLink.expired');
    const viewed = await get('unknown');
    expect(viewed.status).toBe(200);
    expect(await viewed.text()).toContain(text);
    const posted = await post({ token: 'unknown', csrf });
    expect(posted.status).toBe(200);
    expect(await posted.text()).toContain(text);
  });

  test("the page answers in the space's language", async () => {
    const { get } = await setup('pt-BR');
    expect(await (await get()).text()).toContain('Vincular a conta do Google Chat');
  });

  test('the page sends the security headers', async () => {
    const { get } = await setup();
    const res = await get();
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('content-security-policy')).toBeTruthy();
  });
});
