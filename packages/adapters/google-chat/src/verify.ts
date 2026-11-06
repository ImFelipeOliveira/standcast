import { discard, send, statusError } from './errors';

export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
export const JWKS_CACHE_MS = 60 * 60 * 1000;
export const CHAT_ISSUER_EMAIL = 'chat@system.gserviceaccount.com';
export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export type VerifyChatEventOptions = {
  jwks: () => Promise<JsonWebKey[]>;
  now?: () => number;
};

type KeyWithId = JsonWebKey & { kid?: string };

function decodeBase64url(segment: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(segment)) throw new Error('invalid base64url');
  const padded = segment.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJson(segment: string): Record<string, unknown> {
  const value: unknown = JSON.parse(new TextDecoder().decode(decodeBase64url(segment)));
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid jwt segment');
  }
  return value as Record<string, unknown>;
}

function audienceMatches(aud: unknown, audience: string): boolean {
  if (typeof aud === 'string') return aud === audience;
  return Array.isArray(aud) && aud.includes(audience);
}

function claimsValid(claims: Record<string, unknown>, audience: string, nowMs: number): boolean {
  return (
    typeof claims.iss === 'string' &&
    GOOGLE_ISSUERS.includes(claims.iss) &&
    audienceMatches(claims.aud, audience) &&
    typeof claims.exp === 'number' &&
    claims.exp * 1000 > nowMs &&
    claims.email === CHAT_ISSUER_EMAIL &&
    (claims.email_verified === true || claims.email_verified === 'true')
  );
}

export async function verifyChatEvent(
  authorization: string | undefined,
  audience: string,
  opts: VerifyChatEventOptions,
): Promise<boolean> {
  try {
    const match = /^Bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(
      authorization ?? '',
    );
    if (!match) return false;
    const [, rawHeader = '', rawPayload = '', rawSignature = ''] = match;
    const header = decodeJson(rawHeader);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return false;
    const claims = decodeJson(rawPayload);
    if (!claimsValid(claims, audience, (opts.now ?? Date.now)())) return false;
    const jwk = (await opts.jwks()).find((k: KeyWithId) => k.kid === header.kid);
    if (jwk?.kty !== 'RSA') return false;
    const { kty, n, e } = jwk;
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty, n, e },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      decodeBase64url(rawSignature),
      new TextEncoder().encode(`${rawHeader}.${rawPayload}`),
    );
  } catch {
    return false;
  }
}

export function createGoogleJwks(
  opts: { fetch?: typeof fetch; now?: () => number; url?: string } = {},
): () => Promise<JsonWebKey[]> {
  const fetchImpl = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  let cached: { keys: JsonWebKey[]; expiresAt: number } | undefined;
  let pending: Promise<JsonWebKey[]> | undefined;

  async function load(): Promise<JsonWebKey[]> {
    const response = await send(fetchImpl, opts.url ?? GOOGLE_JWKS_URL, { method: 'GET' });
    if (!response.ok) {
      await discard(response);
      throw statusError(response.status);
    }
    const body = (await response.json()) as { keys?: unknown };
    if (!Array.isArray(body.keys)) throw new Error('google jwks response missing keys');
    const keys = body.keys as JsonWebKey[];
    cached = { keys, expiresAt: now() + JWKS_CACHE_MS };
    return keys;
  }

  return async () => {
    if (cached && now() < cached.expiresAt) return cached.keys;
    pending ??= load().finally(() => {
      pending = undefined;
    });
    return pending;
  };
}
