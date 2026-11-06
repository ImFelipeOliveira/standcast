import { describe, expect, test } from 'bun:test';
import {
  CHAT_ISSUER_EMAIL,
  createGoogleJwks,
  GOOGLE_JWKS_URL,
  type JwksSource,
  verifyChatEvent,
} from '../src';
import { generateKeys, signJwt, type TestKeys } from './keys';

const PROJECT_NUMBER = '123456789012';
const NOW = 1_800_000_000_000;

function claims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: 'chat@system.gserviceaccount.com',
    aud: PROJECT_NUMBER,
    iat: NOW / 1000 - 10,
    exp: NOW / 1000 + 3600,
    ...overrides,
  };
}

async function bearer(
  keys: TestKeys,
  overrides: Record<string, unknown> = {},
  kid = keys.jwk.kid,
): Promise<string> {
  return `Bearer ${await signJwt(keys.privateKey, { alg: 'RS256', typ: 'JWT', kid }, claims(overrides))}`;
}

describe('verifyChatEvent', () => {
  test('verify accepts a chat token for the project number', async () => {
    const keys = await generateKeys('k1');
    const other = await generateKeys('k2');
    const opts = { jwks: async () => [other.jwk, keys.jwk], now: () => NOW };
    expect(CHAT_ISSUER_EMAIL).toBe('chat@system.gserviceaccount.com');
    expect(await verifyChatEvent(await bearer(keys), PROJECT_NUMBER, opts)).toBe(true);
    expect(
      await verifyChatEvent(await bearer(keys, { aud: [PROJECT_NUMBER] }), PROJECT_NUMBER, opts),
    ).toBe(true);
  });

  test('verify rejects another project, wrong issuer, expiry and unknown kid', async () => {
    const keys = await generateKeys('k1');
    const forger = await generateKeys('k1');
    const opts = { jwks: async () => [keys.jwk], now: () => NOW };
    const rejected = [
      await bearer(keys, { aud: '999999999999' }),
      await bearer(keys, { aud: 'https://api.test/webhooks/google-chat' }),
      await bearer(keys, { aud: undefined }),
      await bearer(keys, { iss: 'https://accounts.google.com' }),
      await bearer(keys, { iss: 'accounts.google.com' }),
      await bearer(keys, {
        iss: 'https://accounts.google.com',
        email: 'chat@system.gserviceaccount.com',
        email_verified: true,
      }),
      await bearer(keys, { iss: undefined }),
      await bearer(keys, { exp: NOW / 1000 - 1 }),
      await bearer(keys, { exp: undefined }),
      await bearer(keys, {}, 'k9'),
      await bearer(forger),
    ];
    for (const header of rejected) {
      expect(await verifyChatEvent(header, PROJECT_NUMBER, opts)).toBe(false);
    }
  });

  test('verify rejects every token when the project number is not numeric', async () => {
    const keys = await generateKeys('k1');
    const opts = { jwks: async () => [keys.jwk], now: () => NOW };
    for (const projectNumber of ['', 'my-project', 'https://api.test/webhooks/google-chat']) {
      const token = await bearer(keys, { aud: projectNumber });
      expect(await verifyChatEvent(token, projectNumber, opts)).toBe(false);
    }
  });

  test('verify rejects nbf and iat in the future beyond the skew', async () => {
    const keys = await generateKeys('k1');
    const opts = { jwks: async () => [keys.jwk], now: () => NOW };
    const at = (seconds: number) => NOW / 1000 + seconds;
    expect(await verifyChatEvent(await bearer(keys, { nbf: at(61) }), PROJECT_NUMBER, opts)).toBe(
      false,
    );
    expect(await verifyChatEvent(await bearer(keys, { iat: at(61) }), PROJECT_NUMBER, opts)).toBe(
      false,
    );
    expect(await verifyChatEvent(await bearer(keys, { nbf: 'x' }), PROJECT_NUMBER, opts)).toBe(
      false,
    );
    expect(
      await verifyChatEvent(await bearer(keys, { nbf: at(30), iat: at(30) }), PROJECT_NUMBER, opts),
    ).toBe(true);
  });

  test('an unknown kid refreshes the keys once', async () => {
    const oldKey = await generateKeys('old');
    const newKey = await generateKeys('new');
    const requests: Array<boolean> = [];
    const jwks: JwksSource = async (o) => {
      requests.push(o?.refresh ?? false);
      return o?.refresh ? [oldKey.jwk, newKey.jwk] : [oldKey.jwk];
    };
    expect(
      await verifyChatEvent(await bearer(newKey), PROJECT_NUMBER, { jwks, now: () => NOW }),
    ).toBe(true);
    expect(requests).toEqual([false, true]);
  });

  test('verify rejects missing, malformed and unsigned tokens', async () => {
    const keys = await generateKeys('k1');
    const opts = { jwks: async () => [keys.jwk], now: () => NOW };
    const valid = (await bearer(keys)).slice('Bearer '.length);
    const [header, payload] = valid.split('.');
    const none = `${Buffer.from(JSON.stringify({ alg: 'none', kid: 'k1' })).toString('base64url')}.${payload}.`;
    for (const value of [
      undefined,
      '',
      'Basic abc',
      'Bearer ',
      'Bearer a.b',
      `Bearer ${header}.${payload}.AAAA`,
      `Bearer ${none}`,
      valid,
    ]) {
      expect(await verifyChatEvent(value, PROJECT_NUMBER, opts)).toBe(false);
    }
  });

  test('verify is false when the keys cannot be loaded', async () => {
    const keys = await generateKeys('k1');
    const opts = {
      jwks: async (): Promise<JsonWebKey[]> => {
        throw new Error('network down');
      },
      now: () => NOW,
    };
    expect(await verifyChatEvent(await bearer(keys), PROJECT_NUMBER, opts)).toBe(false);
  });
});

describe('createGoogleJwks', () => {
  test('fetches google certs and caches them for an hour', async () => {
    const keys = await generateKeys('k1');
    const urls: string[] = [];
    let clock = NOW;
    const fetchImpl = (async (url: RequestInfo | URL) => {
      urls.push(String(url));
      return Response.json({ keys: [keys.jwk] });
    }) as typeof fetch;
    const jwks = createGoogleJwks({ fetch: fetchImpl, now: () => clock });
    expect(await jwks()).toEqual([keys.jwk]);
    clock += 59 * 60 * 1000;
    await jwks();
    expect(urls).toEqual([GOOGLE_JWKS_URL]);
    expect(GOOGLE_JWKS_URL).toBe(
      'https://www.googleapis.com/service_accounts/v1/jwk/chat@system.gserviceaccount.com',
    );
    clock += 2 * 60 * 1000;
    await jwks();
    expect(urls).toHaveLength(2);
  });

  test('a refresh refetches at most once every five minutes', async () => {
    const first = await generateKeys('k1');
    const second = await generateKeys('k2');
    let clock = NOW;
    let served = [first.jwk];
    let fetches = 0;
    const fetchImpl = (async () => {
      fetches += 1;
      return Response.json({ keys: served });
    }) as unknown as typeof fetch;
    const jwks = createGoogleJwks({ fetch: fetchImpl, now: () => clock });
    const opts = { jwks, now: () => clock };
    expect(await verifyChatEvent(await bearer(first), PROJECT_NUMBER, opts)).toBe(true);
    expect(fetches).toBe(1);

    served = [first.jwk, second.jwk];
    clock += 4 * 60 * 1000;
    expect(
      await verifyChatEvent(await bearer(second, { iat: clock / 1000 }), PROJECT_NUMBER, opts),
    ).toBe(false);
    expect(fetches).toBe(1);

    clock += 2 * 60 * 1000;
    expect(
      await verifyChatEvent(
        await bearer(second, { iat: clock / 1000, exp: clock / 1000 + 600 }),
        PROJECT_NUMBER,
        opts,
      ),
    ).toBe(true);
    expect(fetches).toBe(2);
    expect(
      await verifyChatEvent(
        await bearer(second, { kid: 'zz', iat: clock / 1000, exp: clock / 1000 + 600 }, 'zz'),
        PROJECT_NUMBER,
        opts,
      ),
    ).toBe(false);
    expect(fetches).toBe(2);
  });

  test('keeps only rsa keys with a kid and rejects invalid json', async () => {
    const keys = await generateKeys('k1');
    const bodies = [
      JSON.stringify({ keys: [keys.jwk, { kty: 'EC', kid: 'e' }, { kty: 'RSA' }, null] }),
      'not json',
    ];
    let calls = 0;
    const fetchImpl = (async () =>
      new Response(bodies[calls++] ?? '', { status: 200 })) as unknown as typeof fetch;
    expect(await createGoogleJwks({ fetch: fetchImpl, now: () => NOW })()).toEqual([keys.jwk]);
    await expect(createGoogleJwks({ fetch: fetchImpl, now: () => NOW })()).rejects.toThrow();
  });

  test('a failed fetch is not cached', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return calls === 1 ? new Response('down', { status: 503 }) : Response.json({ keys: [] });
    }) as unknown as typeof fetch;
    const jwks = createGoogleJwks({ fetch: fetchImpl, now: () => NOW });
    await expect(jwks()).rejects.toThrow();
    expect(await jwks()).toEqual([]);
  });
});
