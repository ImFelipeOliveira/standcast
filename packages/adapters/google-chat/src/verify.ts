import { discard, readJson, send, statusError } from './errors';

export const CHAT_ISSUER_EMAIL = 'chat@system.gserviceaccount.com';
export const GOOGLE_JWKS_URL = `https://www.googleapis.com/service_accounts/v1/jwk/${CHAT_ISSUER_EMAIL}`;
export const JWKS_CACHE_MS = 60 * 60 * 1000;
export const JWKS_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
export const CLOCK_SKEW_MS = 60_000;

export type JwksSource = (opts?: { refresh?: boolean }) => Promise<JsonWebKey[]>;

export type VerifyChatEventOptions = {
  jwks: JwksSource;
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

function notInFuture(seconds: unknown, nowMs: number): boolean {
  return (
    seconds === undefined ||
    (typeof seconds === 'number' && seconds * 1000 <= nowMs + CLOCK_SKEW_MS)
  );
}

function claimsValid(
  claims: Record<string, unknown>,
  projectNumber: string,
  nowMs: number,
): boolean {
  return (
    notInFuture(claims.nbf, nowMs) &&
    notInFuture(claims.iat, nowMs) &&
    claims.iss === CHAT_ISSUER_EMAIL &&
    audienceMatches(claims.aud, projectNumber) &&
    typeof claims.exp === 'number' &&
    claims.exp * 1000 > nowMs
  );
}

export async function verifyChatEvent(
  authorization: string | undefined,
  projectNumber: string,
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
    if (!/^\d+$/.test(projectNumber)) return false;
    if (!claimsValid(claims, projectNumber, (opts.now ?? Date.now)())) return false;
    const byKid = (keys: JsonWebKey[]) => keys.find((k: KeyWithId) => k.kid === header.kid);
    const jwk = byKid(await opts.jwks()) ?? byKid(await opts.jwks({ refresh: true }));
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
): JwksSource {
  const fetchImpl = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  let cached: { keys: JsonWebKey[]; fetchedAt: number } | undefined;
  let pending: Promise<JsonWebKey[]> | undefined;

  async function load(): Promise<JsonWebKey[]> {
    const response = await send(fetchImpl, opts.url ?? GOOGLE_JWKS_URL, { method: 'GET' });
    if (!response.ok) {
      await discard(response);
      throw statusError(response.status);
    }
    const body = (await readJson(response)) as { keys?: unknown } | null;
    if (!Array.isArray(body?.keys)) throw new Error('google jwks response missing keys');
    const keys = (body.keys as KeyWithId[]).filter(
      (k) => typeof k === 'object' && k !== null && k.kty === 'RSA' && typeof k.kid === 'string',
    );
    cached = { keys, fetchedAt: now() };
    return keys;
  }

  return async ({ refresh = false } = {}) => {
    const age = cached ? now() - cached.fetchedAt : Number.POSITIVE_INFINITY;
    if (cached && age < (refresh ? JWKS_REFRESH_INTERVAL_MS : JWKS_CACHE_MS)) return cached.keys;
    pending ??= load().finally(() => {
      pending = undefined;
    });
    return pending;
  };
}
