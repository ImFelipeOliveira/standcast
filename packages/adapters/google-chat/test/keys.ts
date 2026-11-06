export type TestKeys = {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  pem: string;
  jwk: JsonWebKey & { kid: string };
};

const ALGORITHM = {
  name: 'RSASSA-PKCS1-v1_5',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
};

function base64(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString('base64');
}

export function base64url(input: string | ArrayBuffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : Buffer.from(input);
  return buf.toString('base64url');
}

export function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

export async function generateKeys(kid = 'k1'): Promise<TestKeys> {
  const pair = (await crypto.subtle.generateKey(ALGORITHM, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  const lines = base64(pkcs8).match(/.{1,64}/g) ?? [];
  const pem = `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----\n`;
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return {
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    pem,
    jwk: { ...jwk, kid, alg: 'RS256', use: 'sig' },
  };
}

export async function signJwt(
  key: CryptoKey,
  header: Record<string, unknown>,
  claims: Record<string, unknown>,
): Promise<string> {
  const input = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(input),
  );
  return `${input}.${base64url(signature)}`;
}

export async function verifyJwt(key: CryptoKey, jwt: string): Promise<boolean> {
  const [header, payload, signature] = jwt.split('.');
  return crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    Buffer.from(signature ?? '', 'base64url'),
    new TextEncoder().encode(`${header}.${payload}`),
  );
}
