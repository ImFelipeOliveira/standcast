import { describe, expect, test } from 'bun:test';
import {
  addOnServiceAccountEmail,
  CHAT_ISSUER_EMAIL,
  createGoogleJwks,
  GOOGLE_JWKS_URL,
  GOOGLE_OIDC_JWKS_URL,
  type JwksSource,
  verifyAddOnEvent,
  verifyChatEvent,
} from '../src';
import { generateKeys, signJwt, type TestKeys } from './keys';

const PROJECT_NUMBER = '123456789012';
const NOW = 1_800_000_000_000;
const ENDPOINT = 'https://api.test/webhooks/google-chat';
const ADD_ON = { projectNumber: PROJECT_NUMBER, audience: ENDPOINT };
const ADD_ON_EMAIL = 'service-123456789012@gcp-sa-gsuiteaddons.iam.gserviceaccount.com';

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

async function addOnBearer(
  keys: TestKeys,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  return bearer(keys, {
    iss: 'https://accounts.google.com',
    aud: ENDPOINT,
    email: ADD_ON_EMAIL,
    email_verified: true,
    ...overrides,
  });
}

describe('verifyAddOnEvent', () => {
  test('accepts an add-on token for the endpoint url and the add-on service account', async () => {
    const keys = await generateKeys('k1');
    const other = await generateKeys('k2');
    const opts = { jwks: async () => [other.jwk, keys.jwk], now: () => NOW };
    expect(addOnServiceAccountEmail(PROJECT_NUMBER)).toBe(ADD_ON_EMAIL);
    expect(GOOGLE_OIDC_JWKS_URL).toBe('https://www.googleapis.com/oauth2/v3/certs');
    expect(await verifyAddOnEvent(await addOnBearer(keys), ADD_ON, opts)).toBe(true);
    expect(
      await verifyAddOnEvent(await addOnBearer(keys, { iss: 'accounts.google.com' }), ADD_ON, opts),
    ).toBe(true);
    expect(await verifyAddOnEvent(await addOnBearer(keys, { aud: [ENDPOINT] }), ADD_ON, opts)).toBe(
      true,
    );
  });

  test('rejects wrong email, audience, issuer, verification flag and expiry', async () => {
    const keys = await generateKeys('k1');
    const opts = { jwks: async () => [keys.jwk], now: () => NOW };
    const rejected = [
      await addOnBearer(keys, {
        email: 'service-999999999999@gcp-sa-gsuiteaddons.iam.gserviceaccount.com',
      }),
      await addOnBearer(keys, { email: CHAT_ISSUER_EMAIL }),
      await addOnBearer(keys, { email: undefined }),
      await addOnBearer(keys, { aud: PROJECT_NUMBER }),
      await addOnBearer(keys, { aud: 'https://evil.test/webhooks/google-chat' }),
      await addOnBearer(keys, { aud: undefined }),
      await addOnBearer(keys, { email_verified: false }),
      await addOnBearer(keys, { email_verified: 'true' }),
      await addOnBearer(keys, { email_verified: undefined }),
      await addOnBearer(keys, { iss: CHAT_ISSUER_EMAIL }),
      await addOnBearer(keys, { iss: 'https://evil.test' }),
      await addOnBearer(keys, { iss: undefined }),
      await addOnBearer(keys, { exp: NOW / 1000 - 1 }),
      await addOnBearer(keys, { exp: undefined }),
      await addOnBearer(keys, { nbf: NOW / 1000 + 61 }),
      await addOnBearer(keys, { iat: NOW / 1000 + 61 }),
      await bearer(keys),
    ];
    for (const header of rejected) {
      expect(await verifyAddOnEvent(header, ADD_ON, opts)).toBe(false);
    }
  });

  test('rejects a token signed by a key that is only in the chat key set', async () => {
    const oidc = await generateKeys('oidc');
    const chat = await generateKeys('chat');
    const requests: Array<boolean> = [];
    const jwks: JwksSource = async (o) => {
      requests.push(o?.refresh ?? false);
      return [oidc.jwk];
    };
    expect(await verifyAddOnEvent(await addOnBearer(chat), ADD_ON, { jwks, now: () => NOW })).toBe(
      false,
    );
    expect(requests).toEqual([false, true]);
    expect(await verifyAddOnEvent(await addOnBearer(oidc), ADD_ON, { jwks, now: () => NOW })).toBe(
      true,
    );
  });

  test('rejects every token without a numeric project number or an audience', async () => {
    const keys = await generateKeys('k1');
    const opts = { jwks: async () => [keys.jwk], now: () => NOW };
    const cases = [
      { projectNumber: '', audience: ENDPOINT },
      { projectNumber: 'my-project', audience: ENDPOINT },
      { projectNumber: PROJECT_NUMBER, audience: '' },
    ];
    for (const target of cases) {
      const token = await addOnBearer(keys, {
        aud: target.audience,
        email: addOnServiceAccountEmail(target.projectNumber),
      });
      expect(await verifyAddOnEvent(token, target, opts)).toBe(false);
    }
  });

  test('a chat event token is never an add-on token and the other way around', async () => {
    const keys = await generateKeys('k1');
    const opts = { jwks: async () => [keys.jwk], now: () => NOW };
    expect(await verifyChatEvent(await addOnBearer(keys), PROJECT_NUMBER, opts)).toBe(false);
    expect(await verifyAddOnEvent(await bearer(keys), ADD_ON, opts)).toBe(false);
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

  test('fetches the google oidc certs from the given url', async () => {
    const keys = await generateKeys('k1');
    const urls: string[] = [];
    const fetchImpl = (async (url: RequestInfo | URL) => {
      urls.push(String(url));
      return Response.json({ keys: [keys.jwk] });
    }) as typeof fetch;
    const jwks = createGoogleJwks({ fetch: fetchImpl, now: () => NOW, url: GOOGLE_OIDC_JWKS_URL });
    expect(await jwks()).toEqual([keys.jwk]);
    expect(urls).toEqual([GOOGLE_OIDC_JWKS_URL]);
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
