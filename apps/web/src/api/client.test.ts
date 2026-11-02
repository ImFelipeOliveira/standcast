import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  ApiError,
  apiGet,
  apiPost,
  apiUrl,
  fetchSession,
  forgetSession,
  retrySignIn,
  SIGN_IN_DID_NOT_STICK,
  SIGN_IN_MARKER,
} from './client';

const originalFetch = globalThis.fetch;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

type Call = { url: string; init: RequestInit };

function stubFetch(responder: (call: Call) => Response): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return responder(call);
  }) as unknown as typeof fetch;
  return calls;
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

let storage: Storage = memoryStorage();

function stubWindow(
  pathname: string,
  search = '',
  sessionStorage: () => Storage = () => storage,
): string[] {
  const assigned: string[] = [];
  storage = memoryStorage();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { pathname, search, assign: (url: string) => assigned.push(url) },
      get sessionStorage() {
        return sessionStorage();
      },
    },
  });
  return assigned;
}

const unauthorized = () => json(401, { error: { code: 'unauthorized', message: 'sign in' } });

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => forgetSession());

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});

describe('api client', () => {
  test('401 redirects to sign-in', async () => {
    const assigned = stubWindow('/orgs/11/configuracao');
    stubFetch(() => json(401, { error: { code: 'unauthorized', message: 'sign in' } }));
    await expect(apiGet('/v1/app/orgs/11/setup')).rejects.toBeInstanceOf(ApiError);
    expect(assigned).toEqual([
      `${apiUrl}/auth/github/login?target=app&next=${encodeURIComponent('/orgs/11/configuracao')}`,
    ]);
  });

  test('401 keeps the query string in next', async () => {
    const assigned = stubWindow('/orgs/11/historico', '?team=core');
    stubFetch(() => json(401, { error: { code: 'unauthorized', message: 'sign in' } }));
    await expect(apiPost('/v1/app/logout')).rejects.toBeInstanceOf(ApiError);
    expect(assigned).toEqual([
      `${apiUrl}/auth/github/login?target=app&next=%2Forgs%2F11%2Fhistorico%3Fteam%3Dcore`,
    ]);
  });

  test('post sends csrf and credentials', async () => {
    stubWindow('/orgs/11/configuracao');
    const calls = stubFetch(({ url }) =>
      url.endsWith('/v1/app/session')
        ? json(200, { login: 'ana', avatarUrl: 'x', csrf: 'token-1', installations: [] })
        : json(201, { ok: true }),
    );
    const result = await apiPost<{ ok: boolean }>('/v1/app/orgs/11/api-keys', { name: 'ci' });
    expect(result).toEqual({ ok: true });
    const post = calls.find((call) => call.init.method === 'POST');
    expect(post?.url).toBe(`${apiUrl}/v1/app/orgs/11/api-keys`);
    expect(post?.init.credentials).toBe('include');
    const headers = post?.init.headers as Record<string, string>;
    expect(headers['X-Standcast-CSRF']).toBe('token-1');
    expect(headers['Content-Type']).toBe('application/json');
    expect(post?.init.body).toBe(JSON.stringify({ name: 'ci' }));
    for (const call of calls) expect(call.init.credentials).toBe('include');
  });

  test('post reuses the cached csrf', async () => {
    stubWindow('/');
    const calls = stubFetch(({ url }) =>
      url.endsWith('/v1/app/session')
        ? json(200, { login: 'ana', avatarUrl: 'x', csrf: 'token-2', installations: [] })
        : new Response(null, { status: 204 }),
    );
    await apiPost('/v1/app/orgs/11/api-keys/k1/revoke');
    await apiPost('/v1/app/orgs/11/api-keys/k2/revoke');
    expect(calls.filter((call) => call.url.endsWith('/v1/app/session'))).toHaveLength(1);
  });

  test('403 on post forgets the cached csrf', async () => {
    stubWindow('/');
    let token = 0;
    let rejectNext = true;
    const calls = stubFetch(({ url }) => {
      if (url.endsWith('/v1/app/session')) {
        token += 1;
        return json(200, {
          login: 'ana',
          avatarUrl: 'x',
          csrf: `token-${token}`,
          installations: [],
        });
      }
      if (rejectNext) {
        rejectNext = false;
        return json(403, { error: { code: 'forbidden', message: 'bad csrf' } });
      }
      return new Response(null, { status: 204 });
    });
    await expect(apiPost('/v1/app/orgs/11/api-keys/k1/revoke')).rejects.toBeInstanceOf(ApiError);
    await apiPost('/v1/app/orgs/11/api-keys/k1/revoke');
    expect(calls.filter((call) => call.url.endsWith('/v1/app/session'))).toHaveLength(2);
    const posts = calls.filter((call) => call.init.method === 'POST');
    const sent = posts.map(
      (call) => (call.init.headers as Record<string, string>)['X-Standcast-CSRF'],
    );
    expect(sent).toEqual(['token-1', 'token-2']);
  });

  test('accepted without a body resolves to undefined', async () => {
    stubWindow('/');
    stubFetch(({ url }) =>
      url.endsWith('/v1/app/session')
        ? json(200, { login: 'ana', avatarUrl: 'x', csrf: 'token-3', installations: [] })
        : new Response(null, { status: 202 }),
    );
    expect(await apiPost('/v1/app/orgs/11/webhooks/w1/test')).toBeUndefined();
  });

  test('api error carries status and code', async () => {
    stubWindow('/');
    stubFetch(() => json(403, { error: { code: 'forbidden', message: 'not a member' } }));
    const error = await apiGet('/v1/app/orgs/12/setup').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(403);
    expect((error as ApiError).code).toBe('forbidden');
    expect((error as ApiError).message).toBe('not a member');
  });

  test('api error without an envelope falls back to http_error', async () => {
    stubWindow('/');
    stubFetch(() => new Response('bad gateway', { status: 502, statusText: 'Bad Gateway' }));
    const error = (await apiGet('/v1/app/session').catch((caught: unknown) => caught)) as ApiError;
    expect(error.status).toBe(502);
    expect(error.code).toBe('http_error');
  });
  test('logout with an expired session does not redirect to sign-in', async () => {
    const assigned = stubWindow('/orgs/11/hoje');
    stubFetch(unauthorized);
    const error = await apiPost('/v1/app/logout', undefined, { skipAuthRedirect: true }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect(assigned).toEqual([]);
  });

  test('a second 401 within a minute stops redirecting', async () => {
    const assigned = stubWindow('/orgs/11/hoje');
    stubFetch(unauthorized);
    await expect(apiGet('/v1/app/session')).rejects.toBeInstanceOf(ApiError);
    const error = (await apiGet('/v1/app/session').catch((caught: unknown) => caught)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(401);
    expect(error.code).toBe(SIGN_IN_DID_NOT_STICK);
    expect(assigned).toHaveLength(1);
  });

  test('a 401 more than a minute after the last sign-in redirects again', async () => {
    const assigned = stubWindow('/orgs/11/hoje');
    storage.setItem(SIGN_IN_MARKER, String(Date.now() - 61_000));
    stubFetch(unauthorized);
    await expect(apiGet('/v1/app/session')).rejects.toBeInstanceOf(ApiError);
    expect(assigned).toHaveLength(1);
  });

  test('try again clears the marker and signs in', async () => {
    const assigned = stubWindow('/orgs/11/hoje');
    storage.setItem(SIGN_IN_MARKER, String(Date.now()));
    retrySignIn();
    expect(storage.getItem(SIGN_IN_MARKER)).toBeNull();
    expect(assigned).toEqual([
      `${apiUrl}/auth/github/login?target=app&next=${encodeURIComponent('/orgs/11/hoje')}`,
    ]);
  });

  test('a working session clears the marker', async () => {
    stubWindow('/');
    storage.setItem(SIGN_IN_MARKER, String(Date.now()));
    stubFetch(() => json(200, { login: 'ana', avatarUrl: 'x', csrf: 't', installations: [] }));
    await fetchSession();
    expect(storage.getItem(SIGN_IN_MARKER)).toBeNull();
  });

  test('a broken sessionStorage still redirects', async () => {
    const assigned = stubWindow('/orgs/11/hoje', '', () => {
      throw new Error('denied');
    });
    stubFetch(unauthorized);
    await expect(apiGet('/v1/app/session')).rejects.toBeInstanceOf(ApiError);
    await expect(apiGet('/v1/app/session')).rejects.toBeInstanceOf(ApiError);
    expect(assigned).toHaveLength(2);
  });
});
