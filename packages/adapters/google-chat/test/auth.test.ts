import { describe, expect, test } from 'bun:test';
import { ChatDeliveryError } from '@standcast/core';
import { CHAT_BOT_SCOPE, createTokenSource, GOOGLE_TOKEN_URL, parseServiceAccount } from '../src';
import { decodeSegment, generateKeys, verifyJwt } from './keys';

function encodeKey(json: object): string {
  return Buffer.from(JSON.stringify(json)).toString('base64');
}

type TokenCall = { url: string; init: RequestInit };

function tokenFetch(responses: Array<() => Response>) {
  const calls: TokenCall[] = [];
  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (!next) throw new Error('no response');
    return next();
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe('parseServiceAccount', () => {
  test('reads client email and private key from base64 json', () => {
    const account = parseServiceAccount(
      encodeKey({ type: 'service_account', client_email: 'bot@p.iam', private_key: 'PEM' }),
    );
    expect(account).toEqual({ clientEmail: 'bot@p.iam', privateKey: 'PEM' });
  });

  test('rejects malformed input without echoing it', () => {
    expect(() => parseServiceAccount('not base64 json')).toThrow(
      'GOOGLE_CHAT_SERVICE_ACCOUNT must be a base64 encoded service account JSON key',
    );
    expect(() => parseServiceAccount(encodeKey({ client_email: 'x' }))).toThrow(
      'GOOGLE_CHAT_SERVICE_ACCOUNT must be a base64 encoded service account JSON key',
    );
  });
});

describe('createTokenSource', () => {
  test('token is signed and cached', async () => {
    const keys = await generateKeys();
    let clock = 1_800_000_000_000;
    const { calls, fetchImpl } = tokenFetch([
      () => Response.json({ access_token: 'ya29.one', expires_in: 3600, token_type: 'Bearer' }),
      () => Response.json({ access_token: 'ya29.two', expires_in: 3600, token_type: 'Bearer' }),
    ]);
    const token = createTokenSource(
      { clientEmail: 'bot@p.iam', privateKey: keys.pem },
      { fetch: fetchImpl, now: () => clock },
    );

    const [a, b] = await Promise.all([token(), token()]);
    expect(a).toBe('ya29.one');
    expect(b).toBe('ya29.one');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(GOOGLE_TOKEN_URL);
    expect(calls[0]?.init.method).toBe('POST');
    expect(new Headers(calls[0]?.init.headers).get('content-type')).toBe(
      'application/x-www-form-urlencoded',
    );
    const form = new URLSearchParams(String(calls[0]?.init.body));
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    const assertion = form.get('assertion') ?? '';
    expect(await verifyJwt(keys.publicKey, assertion)).toBe(true);
    const [header, payload] = assertion.split('.');
    expect(decodeSegment(header ?? '')).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(decodeSegment(payload ?? '')).toEqual({
      iss: 'bot@p.iam',
      scope: CHAT_BOT_SCOPE,
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1_800_000_000,
      exp: 1_800_003_600,
    });
    expect(CHAT_BOT_SCOPE).toBe('https://www.googleapis.com/auth/chat.bot');

    clock += 3600_000 - 61_000;
    expect(await token()).toBe('ya29.one');
    expect(calls).toHaveLength(1);

    clock += 2_000;
    expect(await token()).toBe('ya29.two');
    expect(calls).toHaveLength(2);
  });

  test('a rejected exchange is invalid_auth and is not cached', async () => {
    const keys = await generateKeys();
    const { calls, fetchImpl } = tokenFetch([
      () => Response.json({ error: 'invalid_grant' }, { status: 400 }),
      () => Response.json({ access_token: 'ya29.ok', expires_in: 3600 }),
    ]);
    const token = createTokenSource(
      { clientEmail: 'bot@p.iam', privateKey: keys.pem },
      { fetch: fetchImpl },
    );
    const err = await token().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatDeliveryError);
    expect((err as ChatDeliveryError).code).toBe('invalid_auth');
    expect(await token()).toBe('ya29.ok');
    expect(calls).toHaveLength(2);
  });

  test('invalidate drops the cached token', async () => {
    const keys = await generateKeys();
    const { calls, fetchImpl } = tokenFetch([
      () => Response.json({ access_token: 'ya29.one', expires_in: 3600 }),
      () => Response.json({ access_token: 'ya29.two', expires_in: 3600 }),
    ]);
    const token = createTokenSource(
      { clientEmail: 'bot@p.iam', privateKey: keys.pem },
      { fetch: fetchImpl },
    );
    expect(await token()).toBe('ya29.one');
    expect(await token()).toBe('ya29.one');
    token.invalidate();
    expect(await token()).toBe('ya29.two');
    expect(calls).toHaveLength(2);
  });

  test('a timed out exchange is timeout', async () => {
    const keys = await generateKeys();
    const fetchImpl = (async () => {
      throw new DOMException('timed out', 'TimeoutError');
    }) as unknown as typeof fetch;
    const token = createTokenSource(
      { clientEmail: 'bot@p.iam', privateKey: keys.pem },
      { fetch: fetchImpl },
    );
    const err = await token().catch((e: unknown) => e);
    expect((err as ChatDeliveryError).code).toBe('timeout');
  });
});
