import { describe, expect, test } from 'bun:test';
import { parseEnv } from '../src/env';

const base = {
  DATABASE_URL: 'postgres://x',
  STANDCAST_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
  GITHUB_APP_ID: '1',
  GITHUB_APP_PRIVATE_KEY: 'k',
  GITHUB_WEBHOOK_SECRET: 's',
  GITHUB_CLIENT_ID: 'c',
  GITHUB_CLIENT_SECRET: 's',
  LINEAR_CLIENT_ID: 'c',
  LINEAR_CLIENT_SECRET: 's',
};

describe('worker env', () => {
  test('parses without resend variables', () => {
    expect(() => parseEnv(base)).not.toThrow();
  });

  test('fails when RESEND_API_KEY is set without BETA_EMAIL_FROM', () => {
    expect(() => parseEnv({ ...base, RESEND_API_KEY: 'r', SUPPORT_EMAIL: 'a@b.c' })).toThrow();
  });

  test('fails when RESEND_API_KEY is set without SUPPORT_EMAIL', () => {
    expect(() => parseEnv({ ...base, RESEND_API_KEY: 'r', BETA_EMAIL_FROM: 'a@b.c' })).toThrow();
  });

  test('parses with all three set', () => {
    expect(() =>
      parseEnv({
        ...base,
        RESEND_API_KEY: 'r',
        BETA_EMAIL_FROM: 'a@b.c',
        SUPPORT_EMAIL: 's@b.c',
      }),
    ).not.toThrow();
  });

  test('PUBLIC_URL is optional, loses trailing slashes and must be a url', () => {
    expect(parseEnv(base).PUBLIC_URL).toBeUndefined();
    expect(parseEnv({ ...base, PUBLIC_URL: '' }).PUBLIC_URL).toBeUndefined();
    expect(parseEnv({ ...base, PUBLIC_URL: 'https://api.standcast.app//' }).PUBLIC_URL).toBe(
      'https://api.standcast.app',
    );
    expect(() => parseEnv({ ...base, PUBLIC_URL: 'api.standcast.app' })).toThrow();
  });

  test('GOOGLE_CHAT_SERVICE_ACCOUNT is optional, parsed and fails fast when malformed', () => {
    expect(parseEnv(base).GOOGLE_CHAT_SERVICE_ACCOUNT).toBeUndefined();
    const key = Buffer.from(
      JSON.stringify({ client_email: 'bot@p.iam.gserviceaccount.com', private_key: 'pem' }),
    ).toString('base64');
    expect(
      parseEnv({ ...base, GOOGLE_CHAT_SERVICE_ACCOUNT: key }).GOOGLE_CHAT_SERVICE_ACCOUNT,
    ).toEqual({ clientEmail: 'bot@p.iam.gserviceaccount.com', privateKey: 'pem' });
    expect(() => parseEnv({ ...base, GOOGLE_CHAT_SERVICE_ACCOUNT: 'nope' })).toThrow(
      /must be a base64 encoded service account JSON key[\s\S]*GOOGLE_CHAT_SERVICE_ACCOUNT/,
    );
  });
});
