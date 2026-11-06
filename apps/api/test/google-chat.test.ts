import { describe, expect, test } from 'bun:test';
import { parseConfig } from '@standcast/core';
import {
  createSession,
  listGoogleChatSpaces,
  type MemberRow,
  setInstallationConfig,
  setMemberInstallations,
  upsertInstallation,
  upsertMember,
} from '@standcast/db';
import { csrfToken } from '@standcast/orchestrator';
import { eq } from 'drizzle-orm';
import {
  generateKeys,
  signJwt,
  type TestKeys,
} from '../../../packages/adapters/google-chat/test/keys';
import { googleChatSpaces, rateLimits } from '../../../packages/db/src/schema';
import { db, useCleanDb } from '../../../packages/db/test/setup';
import { FAILED_AUTH_LIMIT, LINK_CODE_LIMIT } from '../src/middleware/rate-limit';
import { createTestApp, type FakeRequest, TEST_IP } from './support';

useCleanDb();

const APP = 'https://app.test';
const INST = 11;
const AUDIENCE = 'https://sw.test/webhooks/google-chat';
const CODE = /\b([ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8})\b/;

type User = { cookie: string; csrf: string; member: MemberRow };

function config() {
  const parsed = parseConfig(`
teams:
  - name: Alpha
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [alice]
    members: [alice, bob]
    chat: { provider: google-chat, channel: "spaces/AAAA" }
`);
  if (!parsed.ok) throw new Error('config');
  return parsed.config;
}

async function harness(options: { enabled?: boolean } = {}) {
  const keys = await generateKeys('k1');
  const users = new Map([
    [1, 'alice'],
    [2, 'bob'],
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
        data: { role: username === 'alice' ? 'admin' : 'member', state: 'active' },
      };
    }
    throw Object.assign(new Error('not found'), { status: 404 });
  };
  const enabled = options.enabled ?? true;
  const refreshes: boolean[] = [];
  const jwks = async (opts?: { refresh?: boolean }) => {
    if (opts?.refresh) refreshes.push(true);
    return [keys.jwk];
  };
  const { app, deps } = createTestApp({
    request,
    googleChatAvailable: enabled,
    ...(enabled ? { googleChat: { audience: AUDIENCE, jwks } } : {}),
  });
  await upsertInstallation(db, { id: INST, accountLogin: 'acme', accountType: 'Organization' });
  await setInstallationConfig(db, INST, { status: 'configured', config: config() });
  const session = async (githubUserId: number): Promise<User> => {
    const login = users.get(githubUserId) ?? '';
    const member = await upsertMember(db, { githubUserId, login, email: null });
    await setMemberInstallations(db, member.id, [INST]);
    const token = await createSession(db, member.id, 'web');
    return { cookie: `sc_web=${token}`, csrf: csrfToken('sess', token), member };
  };
  return { app, deps, keys, refreshes, alice: await session(1), bob: await session(2) };
}

type Harness = Awaited<ReturnType<typeof harness>>;

async function token(
  h: Pick<Harness, 'deps'>,
  keys: TestKeys,
  overrides: Record<string, unknown> = {},
  header: Record<string, unknown> = {},
): Promise<string> {
  const now = Math.floor(h.deps.now().getTime() / 1000);
  return signJwt(
    keys.privateKey,
    { alg: 'RS256', typ: 'JWT', kid: keys.jwk.kid, ...header },
    {
      iss: 'https://accounts.google.com',
      aud: AUDIENCE,
      email: 'chat@system.gserviceaccount.com',
      email_verified: true,
      iat: now - 10,
      exp: now + 3600,
      ...overrides,
    },
  );
}

const added = {
  type: 'ADDED_TO_SPACE',
  space: { name: 'spaces/AAAA', type: 'ROOM', displayName: 'Alpha room' },
};

const event = (h: Harness, body: unknown, authorization?: string) =>
  h.app.request('/webhooks/google-chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(authorization ? { authorization } : {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

async function issueCode(h: Harness): Promise<string> {
  const res = await event(h, added, `Bearer ${await token(h, h.keys)}`);
  expect(res.status).toBe(200);
  const { text } = (await res.json()) as { text: string };
  const code = CODE.exec(text)?.[1];
  if (!code) throw new Error('no code in reply');
  return code;
}

const linkSpace = (h: Harness, user: User, code: string) =>
  h.app.request(`/v1/app/orgs/${INST}/google-chat/spaces`, {
    method: 'POST',
    headers: {
      cookie: user.cookie,
      origin: APP,
      'x-standcast-csrf': user.csrf,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ code }),
  });

const unlinkSpace = (h: Harness, user: User, space: string) =>
  h.app.request(`/v1/app/orgs/${INST}/google-chat/spaces/${encodeURIComponent(space)}`, {
    method: 'DELETE',
    headers: { cookie: user.cookie, origin: APP, 'x-standcast-csrf': user.csrf },
  });

const errorCode = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code;

describe('POST /webhooks/google-chat', () => {
  test('rejects forged or misdirected events', async () => {
    const h = await harness();
    const forger = await generateKeys('k1');
    const stranger = await generateKeys('k2');
    const now = Math.floor(h.deps.now().getTime() / 1000);
    const rejected = [
      undefined,
      'Bearer not.a.token',
      `Bearer ${await token(h, forger)}`,
      `Bearer ${await token(h, h.keys, { aud: 'https://evil.test/webhooks/google-chat' })}`,
      `Bearer ${await token(h, h.keys, { exp: now - 1 })}`,
      `Bearer ${await token(h, h.keys, { email: 'someone@gmail.com' })}`,
      `Bearer ${await token(h, h.keys, { iss: 'https://evil.test' })}`,
      `Bearer ${await token(h, stranger)}`,
      `Bearer ${await token(h, h.keys, {}, { alg: 'HS256' })}`,
      `Bearer ${await token(h, h.keys, {}, { alg: 'none' })}`,
    ];
    for (const authorization of rejected) {
      const res = await event(h, added, authorization);
      expect(res.status, String(authorization)).toBe(401);
      expect(await res.text()).toBe('');
    }
    expect(await db.select().from(googleChatSpaces)).toEqual([]);
    expect(h.refreshes).toEqual([true]);
  });

  test('verification runs before any rate limit write and failures pay the auth limit', async () => {
    const h = await harness();
    expect((await event(h, added, `Bearer ${await token(h, h.keys)}`)).status).toBe(200);
    expect((await db.select().from(rateLimits)).filter((row) => row.key.includes(TEST_IP))).toEqual(
      [],
    );
    for (let i = 0; i < FAILED_AUTH_LIMIT; i++) {
      expect((await event(h, added, 'Bearer forged')).status).toBe(401);
    }
    const limited = await event(h, added, 'Bearer forged');
    expect(limited.status).toBe(429);
    const [row] = await db
      .select()
      .from(rateLimits)
      .where(eq(rateLimits.key, `authfail:ip:${TEST_IP}`));
    expect(row?.count).toBe(FAILED_AUTH_LIMIT + 1);
    expect((await event(h, added, `Bearer ${await token(h, h.keys)}`)).status).toBe(200);
  });

  test('bad json is 400 and only after verification', async () => {
    const h = await harness();
    expect((await event(h, '{not json')).status).toBe(401);
    const res = await event(h, '{not json', `Bearer ${await token(h, h.keys)}`);
    expect(res.status).toBe(400);
    const shape = await event(
      h,
      { type: 'MESSAGE', space: { name: 7 } },
      `Bearer ${await token(h, h.keys)}`,
    );
    expect(shape.status).toBe(400);
  });

  test('a space name longer than 200 characters is 400', async () => {
    const h = await harness();
    const long = await event(
      h,
      { type: 'ADDED_TO_SPACE', space: { name: `spaces/${'A'.repeat(194)}`, type: 'ROOM' } },
      `Bearer ${await token(h, h.keys)}`,
    );
    expect(long.status).toBe(400);
    expect(await db.select().from(googleChatSpaces)).toEqual([]);
    const fits = await event(
      h,
      { type: 'MESSAGE', space: { name: `spaces/${'A'.repeat(193)}`, type: 'ROOM' } },
      `Bearer ${await token(h, h.keys)}`,
    );
    expect(fits.status).toBe(200);
  });

  test('the webhook is off without a service account', async () => {
    const h = await harness({ enabled: false });
    const res = await event(h, added, `Bearer ${await token(h, h.keys)}`);
    expect(res.status).toBe(404);
    expect(await db.select().from(googleChatSpaces)).toEqual([]);
  });

  test('added to space answers with a code', async () => {
    const h = await harness();
    const code = await issueCode(h);
    expect(code).toMatch(CODE);
    const [row] = await db.select().from(googleChatSpaces);
    expect(row?.spaceName).toBe('spaces/AAAA');
    expect(row?.linkCodeHash).not.toBeNull();
    expect(row?.linkCodeHash).not.toContain(code);
    const other = await event(
      h,
      { type: 'MESSAGE', space: { name: 'spaces/AAAA', type: 'ROOM' } },
      `Bearer ${await token(h, h.keys)}`,
    );
    expect(other.status).toBe(200);
    expect(await other.json()).toEqual({});
    const noSpace = await event(h, { type: 'CARD_CLICKED' }, `Bearer ${await token(h, h.keys)}`);
    expect(await noSpace.json()).toEqual({});
  });

  test('a direct message from an unknown email answers the login hint', async () => {
    const h = await harness();
    const res = await event(
      h,
      {
        type: 'MESSAGE',
        space: { name: 'spaces/DM1', type: 'DM', singleUserBotDm: true },
        user: { name: 'users/123', email: 'nobody@example.com' },
      },
      `Bearer ${await token(h, h.keys)}`,
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { text: string }).text).toContain('standcast login');
  });
});

describe('google chat link routes', () => {
  test('link route is admin only', async () => {
    const h = await harness();
    const code = await issueCode(h);
    for (const attempt of [code, 'ZZZZZZZZ', 'garbage']) {
      const res = await linkSpace(h, h.bob, attempt);
      expect(res.status).toBe(403);
      expect(await errorCode(res)).toBe('forbidden');
    }
    const linked = await linkSpace(h, h.alice, code.toLowerCase());
    expect(linked.status).toBe(201);
    expect(await linked.json()).toEqual({ space: 'spaces/AAAA', displayName: 'Alpha room' });
    expect(await listGoogleChatSpaces(db, INST)).toEqual([
      { name: 'spaces/AAAA', displayName: 'Alpha room' },
    ]);
    const reused = await linkSpace(h, h.alice, code);
    expect(reused.status).toBe(422);
    expect(await errorCode(reused)).toBe('invalid_code');

    const denied = await unlinkSpace(h, h.bob, 'spaces/AAAA');
    expect(denied.status).toBe(403);
    const unlinked = await unlinkSpace(h, h.alice, 'spaces/AAAA');
    expect(unlinked.status).toBe(204);
    expect(await listGoogleChatSpaces(db, INST)).toEqual([]);
    expect((await unlinkSpace(h, h.alice, 'spaces/AAAA')).status).toBe(404);
    for (const space of ['spaces/../x', 'foo']) {
      const res = await unlinkSpace(h, h.alice, space);
      expect(res.status, space).toBe(404);
      expect(await errorCode(res)).toBe('not_found');
    }
    expect((await unlinkSpace(h, h.bob, 'foo')).status).toBe(403);
  });

  test('link attempts are rate limited', async () => {
    const h = await harness();
    for (let i = 0; i < LINK_CODE_LIMIT; i++) {
      expect((await linkSpace(h, h.alice, 'ZZZZZZZZ')).status).toBe(422);
    }
    const limited = await linkSpace(h, h.alice, 'ZZZZZZZZ');
    expect(limited.status).toBe(429);
    expect(await errorCode(limited)).toBe('rate_limited');
  });

  test('the app allows delete from the web app origin', async () => {
    const h = await harness();
    const res = await h.app.request(`/v1/app/orgs/${INST}/google-chat/spaces/x`, {
      method: 'OPTIONS',
      headers: { origin: APP },
    });
    expect(res.headers.get('access-control-allow-methods')).toContain('DELETE');
  });

  test('setup status reports google chat as available', async () => {
    const h = await harness();
    const res = await h.app.request(`/v1/app/orgs/${INST}/setup`, {
      headers: { cookie: h.alice.cookie, origin: APP },
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { googleChat: unknown }).googleChat).toEqual({
      available: true,
      spaces: [],
    });
  });
});

describe('POST /setup/google-chat', () => {
  const submit = (h: Harness, user: User, fields: Record<string, string>) =>
    h.app.request('/setup/google-chat', {
      method: 'POST',
      headers: { cookie: user.cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    });

  test('setup form links a space', async () => {
    const h = await harness();
    const code = await issueCode(h);
    const forged = await submit(h, h.alice, {
      csrf: 'forged',
      installation_id: String(INST),
      code,
    });
    expect(forged.status).toBe(403);
    const member = await submit(h, h.bob, {
      csrf: h.bob.csrf,
      installation_id: String(INST),
      code,
    });
    expect(member.status).toBe(403);
    const res = await submit(h, h.alice, {
      csrf: h.alice.csrf,
      installation_id: String(INST),
      code,
    });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`/setup?installation_id=${INST}`);
    expect(await listGoogleChatSpaces(db, INST)).toEqual([
      { name: 'spaces/AAAA', displayName: 'Alpha room' },
    ]);
    const again = await submit(h, h.alice, {
      csrf: h.alice.csrf,
      installation_id: String(INST),
      code,
    });
    expect(again.status).toBe(422);
    expect(await again.text()).toContain('Invalid code');
  });
});
