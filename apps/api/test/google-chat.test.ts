import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { parseConfig } from '@standcast/core';
import {
  createSession,
  issueGoogleChatLinkCode,
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
const PROJECT_NUMBER = '123456789012';
const ENDPOINT = 'https://sw.test/webhooks/google-chat';
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
  const oidcKeys = await generateKeys('g1');
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
    ...(enabled
      ? {
          googleChat: {
            projectNumber: PROJECT_NUMBER,
            jwks,
            endpointUrl: ENDPOINT,
            oidcJwks: async () => [oidcKeys.jwk],
          },
        }
      : {}),
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
  return { app, deps, keys, oidcKeys, refreshes, alice: await session(1), bob: await session(2) };
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
      iss: 'chat@system.gserviceaccount.com',
      aud: PROJECT_NUMBER,
      iat: now - 10,
      exp: now + 3600,
      ...overrides,
    },
  );
}

async function addOnToken(
  h: Pick<Harness, 'deps'>,
  keys: TestKeys,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  return token(h, keys, {
    iss: 'https://accounts.google.com',
    aud: ENDPOINT,
    email: `service-${PROJECT_NUMBER}@gcp-sa-gsuiteaddons.iam.gserviceaccount.com`,
    email_verified: true,
    ...overrides,
  });
}

const addOn = (chat: Record<string, unknown>) => ({
  commonEventObject: { hostApp: 'CHAT', platform: 'WEB' },
  authorizationEventObject: { systemIdToken: 'x' },
  chat: { eventTime: '2026-11-11T12:00:00Z', ...chat },
});

const room = { name: 'spaces/AAAA', type: 'ROOM', spaceType: 'SPACE', displayName: 'Alpha room' };

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
      `Bearer ${await token(h, h.keys, { aud: '999999999999' })}`,
      `Bearer ${await token(h, h.keys, { aud: 'https://sw.test/webhooks/google-chat' })}`,
      `Bearer ${await token(h, h.keys, { exp: now - 1 })}`,
      `Bearer ${await token(h, h.keys, { iss: 'https://accounts.google.com' })}`,
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
    const text = ((await res.json()) as { text: string }).text;
    expect(text).toContain('standcast login');
    expect(text).toContain('google_chat: users/123');
    expect(text).toContain('O seu id no Google Chat é users/123');
  });

  test('a direct message without a valid user answers the login hint without an id', async () => {
    const h = await harness();
    const res = await event(
      h,
      {
        type: 'MESSAGE',
        space: { name: 'spaces/DM1', type: 'DM', singleUserBotDm: true },
        user: { name: 'not-a-user', email: 'nobody@example.com' },
      },
      `Bearer ${await token(h, h.keys)}`,
    );
    const text = ((await res.json()) as { text: string }).text;
    expect(text).toContain('standcast login');
    expect(text).not.toContain('google_chat:');
  });

  test('add-on events are verified against the endpoint url and the add-on service account', async () => {
    const h = await harness();
    const now = Math.floor(h.deps.now().getTime() / 1000);
    const body = addOn({ user: { name: 'users/1' }, addedToSpacePayload: { space: room } });
    const rejected = [
      await addOnToken(h, h.keys),
      await addOnToken(h, h.oidcKeys, { aud: PROJECT_NUMBER }),
      await addOnToken(h, h.oidcKeys, { aud: 'https://evil.test/webhooks/google-chat' }),
      await addOnToken(h, h.oidcKeys, { email: 'attacker@example.com' }),
      await addOnToken(h, h.oidcKeys, { email_verified: false }),
      await addOnToken(h, h.oidcKeys, { email_verified: undefined }),
      await addOnToken(h, h.oidcKeys, { iss: 'https://evil.test' }),
      await addOnToken(h, h.oidcKeys, { exp: now - 1 }),
      await token(h, h.oidcKeys),
    ];
    for (const jwt of rejected) {
      const res = await event(h, body, `Bearer ${jwt}`);
      expect(res.status).toBe(401);
      expect(await res.text()).toBe('');
    }
    expect(await db.select().from(googleChatSpaces)).toEqual([]);
  });

  test('an add-on added to space event answers with a code as a create message action', async () => {
    const h = await harness();
    const res = await event(
      h,
      addOn({
        user: { name: 'users/1', email: 'alice@example.com' },
        addedToSpacePayload: { space: room, interactionAdd: false },
      }),
      `Bearer ${await addOnToken(h, h.oidcKeys)}`,
    );
    expect(res.status).toBe(200);
    const reply = (await res.json()) as {
      hostAppDataAction: { chatDataAction: { createMessageAction: { message: { text: string } } } };
    };
    const text = reply.hostAppDataAction.chatDataAction.createMessageAction.message.text;
    const code = CODE.exec(text)?.[1];
    expect(code).toMatch(CODE);
    const [row] = await db.select().from(googleChatSpaces);
    expect(row?.spaceName).toBe('spaces/AAAA');
    expect(row?.linkCodeHash).not.toBeNull();
    expect((await linkSpace(h, h.alice, code ?? '')).status).toBe(201);
  });

  test('an add-on direct message answers the login hint as a create message action', async () => {
    const h = await harness();
    const res = await event(
      h,
      addOn({
        user: { name: 'users/123', email: 'nobody@example.com', displayName: 'Nobody' },
        space: { name: 'spaces/DM1', type: 'DM', singleUserBotDm: true },
        messagePayload: {
          space: {
            name: 'spaces/DM1',
            type: 'DM',
            spaceType: 'DIRECT_MESSAGE',
            singleUserBotDm: true,
          },
          message: { name: 'spaces/DM1/messages/1', text: 'hi' },
        },
      }),
      `Bearer ${await addOnToken(h, h.oidcKeys, { iss: 'accounts.google.com' })}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      hostAppDataAction: { chatDataAction: { createMessageAction: { message: { text: string } } } };
    };
    expect(Object.keys(body)).toEqual(['hostAppDataAction']);
    const text = body.hostAppDataAction.chatDataAction.createMessageAction.message.text;
    expect(text).toContain('standcast login');
    expect(text).toContain('google_chat: users/123');
  });

  test('an add-on removed from space event removes the space and answers nothing', async () => {
    const h = await harness();
    const code = await issueCode(h);
    expect((await linkSpace(h, h.alice, code)).status).toBe(201);
    expect(await listGoogleChatSpaces(db, INST)).toHaveLength(1);
    const res = await event(
      h,
      addOn({ user: { name: 'users/1' }, removedFromSpacePayload: { space: room } }),
      `Bearer ${await addOnToken(h, h.oidcKeys)}`,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    expect(await listGoogleChatSpaces(db, INST)).toEqual([]);
    expect(await db.select().from(googleChatSpaces)).toEqual([]);
  });

  test('add-on events without a known payload or a space answer nothing', async () => {
    const h = await harness();
    const authorization = `Bearer ${await addOnToken(h, h.oidcKeys)}`;
    for (const chat of [
      { user: { name: 'users/1' }, space: room, buttonClickedPayload: { space: room } },
      { user: { name: 'users/1' }, appCommandPayload: { space: room } },
      { user: { name: 'users/1' }, messagePayload: { message: { text: 'hi' } } },
    ]) {
      const res = await event(h, addOn(chat), authorization);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({});
    }
    expect(await db.select().from(googleChatSpaces)).toEqual([]);
  });

  test('a body in the other format than the token is 400', async () => {
    const h = await harness();
    const legacyBody = await event(h, added, `Bearer ${await addOnToken(h, h.oidcKeys)}`);
    expect(legacyBody.status).toBe(400);
    expect(await legacyBody.json()).toEqual({
      error: { code: 'invalid_request', message: 'invalid body' },
    });
    const addOnBody = await event(
      h,
      addOn({ addedToSpacePayload: { space: room } }),
      `Bearer ${await token(h, h.keys)}`,
    );
    expect(addOnBody.status).toBe(400);
    const badSpace = await event(
      h,
      addOn({ messagePayload: { space: { name: 7 } } }),
      `Bearer ${await addOnToken(h, h.oidcKeys)}`,
    );
    expect(badSpace.status).toBe(400);
    expect(await db.select().from(googleChatSpaces)).toEqual([]);
  });
});

describe('google chat link routes', () => {
  test('link routes are not found while google chat is off', async () => {
    const h = await harness({ enabled: false });
    await issueGoogleChatLinkCode(db, {
      spaceName: 'spaces/AAAA',
      displayName: 'Alpha room',
      codeHash: createHash('sha256').update('K7QF3MZP').digest('hex'),
      expiresAt: new Date(h.deps.now().getTime() + 60_000),
      now: h.deps.now(),
    });
    const res = await linkSpace(h, h.alice, 'K7QF3MZP');
    expect(res.status).toBe(404);
    const form = await h.app.request('/setup/google-chat', {
      method: 'POST',
      headers: { cookie: h.alice.cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        csrf: h.alice.csrf,
        installation_id: String(INST),
        code: 'K7QF3MZP',
      }).toString(),
    });
    expect(form.status).toBe(404);
    expect(await listGoogleChatSpaces(db, INST)).toEqual([]);
  });

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

  test('unlink rejects cross-site and missing csrf requests', async () => {
    const h = await harness();
    expect((await linkSpace(h, h.alice, await issueCode(h))).status).toBe(201);
    const path = `/v1/app/orgs/${INST}/google-chat/spaces/${encodeURIComponent('spaces/AAAA')}`;
    const remove = (headers: Record<string, string>) =>
      h.app.request(path, { method: 'DELETE', headers: { cookie: h.alice.cookie, ...headers } });
    const attempts: Record<string, string>[] = [
      { origin: 'https://evil.test', 'x-standcast-csrf': h.alice.csrf },
      { 'x-standcast-csrf': h.alice.csrf },
      { origin: APP },
      { origin: APP, 'x-standcast-csrf': 'nope' },
    ];
    for (const headers of attempts) {
      const res = await remove(headers);
      expect(res.status, JSON.stringify(headers)).toBe(403);
      expect(await errorCode(res)).toBe('forbidden');
    }
    const preflight = await h.app.request(path, {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.test', 'access-control-request-method': 'DELETE' },
    });
    expect(preflight.headers.get('access-control-allow-origin')).toBeNull();
    expect(preflight.headers.get('access-control-allow-methods')).toBeNull();
    expect(await listGoogleChatSpaces(db, INST)).toEqual([
      { name: 'spaces/AAAA', displayName: 'Alpha room' },
    ]);
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
  test('the setup form is gone', async () => {
    const h = await harness();
    const res = await h.app.request('/setup/google-chat', {
      method: 'POST',
      headers: { cookie: h.alice.cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        csrf: h.alice.csrf,
        installation_id: String(INST),
        code: 'K7QF3MZP',
      }).toString(),
    });
    expect(res.status).toBe(404);
    expect(await listGoogleChatSpaces(db, INST)).toEqual([]);
  });
});
