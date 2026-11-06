import { ChatDeliveryError, discard, readJson, send, statusError } from './errors';

export const CHAT_BOT_SCOPE = 'https://www.googleapis.com/auth/chat.bot';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const TOKEN_LIFETIME_SECONDS = 3600;
export const TOKEN_REFRESH_MARGIN_MS = 60_000;

export type ServiceAccount = { clientEmail: string; privateKey: string };

export type TokenSource = (() => Promise<string>) & { invalidate: () => void };

export type TokenSourceOptions = { fetch?: typeof fetch; now?: () => number };

const INVALID_ACCOUNT =
  'GOOGLE_CHAT_SERVICE_ACCOUNT must be a base64 encoded service account JSON key';

export function parseServiceAccount(base64Json: string): ServiceAccount {
  let parsed: unknown;
  try {
    const bytes = Uint8Array.from(atob(base64Json.trim()), (c) => c.charCodeAt(0));
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error(INVALID_ACCOUNT);
  }
  const key = parsed as { client_email?: unknown; private_key?: unknown } | null;
  if (
    typeof key?.client_email !== 'string' ||
    key.client_email.length === 0 ||
    typeof key.private_key !== 'string' ||
    key.private_key.length === 0
  ) {
    throw new Error(INVALID_ACCOUNT);
  }
  return { clientEmail: key.client_email, privateKey: key.private_key };
}

export function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64urlJson(value: object): string {
  return base64url(new TextEncoder().encode(JSON.stringify(value)));
}

function pemBytes(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem
    .replace(/-----BEGIN [A-Z ]+-----/, '')
    .replace(/-----END [A-Z ]+-----/, '')
    .replace(/\s/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importSigningKey(pem: string): Promise<CryptoKey> {
  try {
    return await crypto.subtle.importKey(
      'pkcs8',
      pemBytes(pem),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  } catch {
    throw new ChatDeliveryError('invalid_auth', 'service account private key is invalid');
  }
}

async function signAssertion(key: CryptoKey, clientEmail: string, nowMs: number): Promise<string> {
  const iat = Math.floor(nowMs / 1000);
  const input = `${base64urlJson({ alg: 'RS256', typ: 'JWT' })}.${base64urlJson({
    iss: clientEmail,
    scope: CHAT_BOT_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat,
    exp: iat + TOKEN_LIFETIME_SECONDS,
  })}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(input),
  );
  return `${input}.${base64url(new Uint8Array(signature))}`;
}

export function createTokenSource(
  account: ServiceAccount,
  opts: TokenSourceOptions = {},
): TokenSource {
  const fetchImpl = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  let signingKey: Promise<CryptoKey> | undefined;
  let cached: { token: string; refreshAt: number } | undefined;
  let pending: Promise<string> | undefined;

  async function exchange(): Promise<string> {
    signingKey ??= importSigningKey(account.privateKey).catch((error: unknown) => {
      signingKey = undefined;
      throw error;
    });
    const issuedAt = now();
    const assertion = await signAssertion(await signingKey, account.clientEmail, issuedAt);
    const response = await send(fetchImpl, GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    });
    if (!response.ok) {
      await discard(response);
      throw statusError(response.status, { 400: 'invalid_auth', 403: 'invalid_auth' });
    }
    const body = (await readJson(response)) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== 'string' || body.access_token.length === 0) {
      throw new ChatDeliveryError('invalid_response', 'token response missing access_token');
    }
    const expiresIn =
      typeof body.expires_in === 'number' && body.expires_in > 0
        ? body.expires_in
        : TOKEN_LIFETIME_SECONDS;
    cached = {
      token: body.access_token,
      refreshAt: issuedAt + expiresIn * 1000 - TOKEN_REFRESH_MARGIN_MS,
    };
    return body.access_token;
  }

  const get = async () => {
    if (cached && now() < cached.refreshAt) return cached.token;
    pending ??= exchange().finally(() => {
      pending = undefined;
    });
    return pending;
  };
  return Object.assign(get, {
    invalidate: () => {
      cached = undefined;
    },
  });
}
