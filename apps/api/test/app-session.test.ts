import { describe, expect, test } from 'bun:test';
import {
  createSession,
  resolveSession,
  setMemberInstallations,
  upsertInstallation,
  upsertMember,
} from '@standcast/db';
import { csrfToken } from '@standcast/orchestrator';
import { db, useCleanDb } from '../../../packages/db/test/setup';
import { createTestApp } from './support';

const APP = 'https://app.test';

async function seed() {
  await upsertInstallation(db, { id: 21, accountLogin: 'zeta', accountType: 'Organization' });
  await upsertInstallation(db, { id: 22, accountLogin: 'Acme', accountType: 'Organization' });
  await upsertInstallation(db, { id: 23, accountLogin: 'beta', accountType: 'Organization' });
  const member = await upsertMember(db, { githubUserId: 1, login: 'alice', email: 'a@acme.com' });
  await setMemberInstallations(db, member.id, [21, 22, 23]);
  const token = await createSession(db, member.id, 'web');
  return { member, token, cookie: `sc_web=${token}`, csrf: csrfToken('sess', token) };
}

describe('/v1/app session', () => {
  useCleanDb();

  test('session returns person, csrf and sorted installations', async () => {
    const { app } = createTestApp();
    const { cookie, csrf } = await seed();
    const res = await app.request('/v1/app/session', { headers: { cookie, origin: APP } });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(APP);
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({
      login: 'alice',
      avatarUrl: 'https://github.com/alice.png?size=80',
      csrf,
      installations: [
        { id: 22, owner: 'Acme' },
        { id: 23, owner: 'beta' },
        { id: 21, owner: 'zeta' },
      ],
    });
  });

  test('missing cookie is 401', async () => {
    const { app } = createTestApp();
    const res = await app.request('/v1/app/session', { headers: { origin: APP } });
    expect(res.status).toBe(401);
    expect(res.headers.get('access-control-allow-origin')).toBe(APP);
    expect(await res.json()).toEqual({
      error: { code: 'unauthorized', message: 'missing or invalid session' },
    });
    const invalid = await app.request('/v1/app/session', { headers: { cookie: 'sc_web=nope' } });
    expect(invalid.status).toBe(401);
  });

  test('preflight from APP_URL is allowed', async () => {
    const { app } = createTestApp();
    const res = await app.request('/v1/app/logout', {
      method: 'OPTIONS',
      headers: {
        origin: APP,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type, x-standcast-csrf',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(APP);
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
    expect(res.headers.get('access-control-allow-headers')).toBe('Content-Type, X-Standcast-CSRF');
    expect(res.headers.get('access-control-allow-methods')).toBe('GET, POST, DELETE, OPTIONS');
    expect(res.headers.get('vary')).toContain('Origin');
  });

  test('preflight from another origin gets no CORS headers', async () => {
    const { app } = createTestApp();
    const res = await app.request('/v1/app/logout', {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.test', 'access-control-request-method': 'POST' },
    });
    for (const name of [
      'access-control-allow-origin',
      'access-control-allow-credentials',
      'access-control-allow-headers',
      'access-control-allow-methods',
    ]) {
      expect(res.headers.get(name)).toBeNull();
    }
    const { cookie } = await seed();
    const get = await app.request('/v1/app/session', {
      headers: { cookie, origin: 'https://evil.test' },
    });
    expect(get.headers.get('access-control-allow-origin')).toBeNull();
    const elsewhere = await app.request('/v1/meta', { headers: { origin: APP } });
    expect(elsewhere.headers.get('access-control-allow-origin')).toBeNull();
  });

  test('rejects cross-origin writes', async () => {
    const { app } = createTestApp();
    const { cookie, csrf } = await seed();
    const post = (headers: Record<string, string>) =>
      app.request('/v1/app/logout', { method: 'POST', headers: { cookie, ...headers } });
    const wrongOrigin = await post({ origin: 'https://evil.test', 'x-standcast-csrf': csrf });
    expect(wrongOrigin.status).toBe(403);
    expect((await wrongOrigin.json()).error.code).toBe('forbidden');
    const noOrigin = await post({ 'x-standcast-csrf': csrf });
    expect(noOrigin.status).toBe(403);
    const missingHeader = await post({ origin: APP });
    expect(missingHeader.status).toBe(403);
    const badHeader = await post({ origin: APP, 'x-standcast-csrf': 'nope' });
    expect(badHeader.status).toBe(403);
    const stillValid = await app.request('/v1/app/session', { headers: { cookie } });
    expect(stillValid.status).toBe(200);
    const valid = await post({ origin: APP, 'x-standcast-csrf': csrf });
    expect(valid.status).toBe(204);
  });

  test('logout clears the session', async () => {
    const { app } = createTestApp();
    const { cookie, csrf } = await seed();
    const res = await app.request('/v1/app/logout', {
      method: 'POST',
      headers: { cookie, origin: APP, 'x-standcast-csrf': csrf },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(APP);
    const cleared = res.headers.get('set-cookie') ?? '';
    expect(cleared).toContain('sc_web=;');
    expect(cleared).toContain('Max-Age=0');
    expect(cleared).toContain('Path=/');
    const after = await app.request('/v1/app/session', { headers: { cookie } });
    expect(after.status).toBe(401);
  });
  test('revoke-all ends every panel session and keeps the CLI and other people', async () => {
    const { app } = createTestApp();
    const { member, token, cookie, csrf } = await seed();
    const otherBrowser = await createSession(db, member.id, 'web');
    const cli = await createSession(db, member.id, 'cli');
    const bruno = await upsertMember(db, { githubUserId: 2, login: 'bruno', email: null });
    const brunoWeb = await createSession(db, bruno.id, 'web');
    const res = await app.request('/v1/app/sessions/revoke-all', {
      method: 'POST',
      headers: { cookie, origin: APP, 'x-standcast-csrf': csrf },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(APP);
    const cleared = res.headers.get('set-cookie') ?? '';
    expect(cleared).toContain('sc_web=;');
    expect(cleared).toContain('Max-Age=0');
    expect(await resolveSession(db, token, 'web')).toBeNull();
    expect(await resolveSession(db, otherBrowser, 'web')).toBeNull();
    expect((await resolveSession(db, cli, 'cli'))?.id).toBe(member.id);
    expect((await resolveSession(db, brunoWeb, 'web'))?.id).toBe(bruno.id);
    const after = await app.request('/v1/app/session', { headers: { cookie } });
    expect(after.status).toBe(401);
  });

  test('revoke-all rejects cross-origin writes and missing csrf', async () => {
    const { app } = createTestApp();
    const { token, cookie, csrf } = await seed();
    const post = (headers: Record<string, string>) =>
      app.request('/v1/app/sessions/revoke-all', {
        method: 'POST',
        headers: { cookie, ...headers },
      });
    expect((await post({ origin: 'https://evil.test', 'x-standcast-csrf': csrf })).status).toBe(
      403,
    );
    expect((await post({ origin: APP })).status).toBe(403);
    expect((await post({ origin: APP, 'x-standcast-csrf': 'nope' })).status).toBe(403);
    expect(await resolveSession(db, token, 'web')).not.toBeNull();
    const anonymous = await app.request('/v1/app/sessions/revoke-all', {
      method: 'POST',
      headers: { origin: APP, 'x-standcast-csrf': csrf },
    });
    expect(anonymous.status).toBe(401);
  });
});
