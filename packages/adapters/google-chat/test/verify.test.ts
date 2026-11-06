import { describe, expect, test } from 'bun:test';
import { CHAT_ISSUER_EMAIL, createGoogleJwks, GOOGLE_JWKS_URL, verifyChatEvent } from '../src';
import { generateKeys, signJwt, type TestKeys } from './keys';

const AUDIENCE = 'https://api.test/webhooks/google-chat';
const NOW = 1_800_000_000_000;

function claims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: 'https://accounts.google.com',
    aud: AUDIENCE,
    email: 'chat@system.gserviceaccount.com',
    email_verified: true,
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
  test('verify accepts a valid google token', async () => {
    const keys = await generateKeys('k1');
    const other = await generateKeys('k2');
    const opts = { jwks: async () => [other.jwk, keys.jwk], now: () => NOW };
    expect(CHAT_ISSUER_EMAIL).toBe('chat@system.gserviceaccount.com');
    expect(await verifyChatEvent(await bearer(keys), AUDIENCE, opts)).toBe(true);
    expect(
      await verifyChatEvent(await bearer(keys, { iss: 'accounts.google.com' }), AUDIENCE, opts),
    ).toBe(true);
    expect(await verifyChatEvent(await bearer(keys, { aud: [AUDIENCE] }), AUDIENCE, opts)).toBe(
      true,
    );
  });

  test('verify rejects wrong audience, issuer, email, expiry and unknown kid', async () => {
    const keys = await generateKeys('k1');
    const forger = await generateKeys('k1');
    const opts = { jwks: async () => [keys.jwk], now: () => NOW };
    const rejected = [
      await bearer(keys, { aud: 'https://evil.test/webhooks/google-chat' }),
      await bearer(keys, { iss: 'https://evil.test' }),
      await bearer(keys, { email: 'someone@gmail.com' }),
      await bearer(keys, { email_verified: false }),
      await bearer(keys, { exp: NOW / 1000 - 1 }),
      await bearer(keys, {}, 'k9'),
      await bearer(forger),
    ];
    for (const header of rejected) {
      expect(await verifyChatEvent(header, AUDIENCE, opts)).toBe(false);
    }
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
      expect(await verifyChatEvent(value, AUDIENCE, opts)).toBe(false);
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
    expect(await verifyChatEvent(await bearer(keys), AUDIENCE, opts)).toBe(false);
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
    expect(GOOGLE_JWKS_URL).toBe('https://www.googleapis.com/oauth2/v3/certs');
    clock += 2 * 60 * 1000;
    await jwks();
    expect(urls).toHaveLength(2);
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
