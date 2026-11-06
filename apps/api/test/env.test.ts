import { describe, expect, test } from 'bun:test';
import { parseEnv } from '../src/env';

const base = {
  DATABASE_URL: 'postgres://localhost/x',
  PUBLIC_URL: 'https://api.standcast.app',
  SUPPORT_EMAIL: 'help@standcast.app',
  STANDCAST_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  GITHUB_APP_ID: '1',
  GITHUB_APP_PRIVATE_KEY: 'key',
  GITHUB_WEBHOOK_SECRET: 'whsec',
  GITHUB_CLIENT_ID: 'cid',
  GITHUB_CLIENT_SECRET: 'secret',
  SESSION_SECRET: 'a-session-secret-of-length',
  SLACK_CLIENT_ID: 'sid',
  SLACK_CLIENT_SECRET: 'ssecret',
  LINEAR_CLIENT_ID: 'lid',
  LINEAR_CLIENT_SECRET: 'lsecret',
  APP_URL: 'https://app.standcast.app',
};

describe('parseEnv', () => {
  test('APP_URL is required', () => {
    const { APP_URL: _, ...withoutAppUrl } = base;
    expect(() => parseEnv(withoutAppUrl)).toThrow(/APP_URL/);
  });

  test('APP_URL must be https without trailing slash', () => {
    expect(parseEnv(base).APP_URL).toBe('https://app.standcast.app');
    expect(parseEnv({ ...base, APP_URL: 'http://localhost:4173' }).APP_URL).toBe(
      'http://localhost:4173',
    );
    for (const APP_URL of ['http://x', 'https://x/', 'http://localhost:4173/']) {
      expect(() => parseEnv({ ...base, APP_URL }), APP_URL).toThrow();
    }
  });

  test('APP_URL must be an exact origin', () => {
    for (const APP_URL of [
      'https://app.standcast.app/web',
      'https://app.standcast.app?x=1',
      'https://App.Standcast.app',
      'https://app.standcast.app:443',
      'http://localhost:80',
      'not a url',
    ]) {
      expect(() => parseEnv({ ...base, APP_URL }), APP_URL).toThrow(/APP_URL/);
    }
    expect(parseEnv({ ...base, APP_URL: 'https://app.standcast.app:8443' }).APP_URL).toBe(
      'https://app.standcast.app:8443',
    );
  });

  test('strips trailing slashes from PUBLIC_URL', () => {
    for (const raw of ['https://api.standcast.app/', 'https://api.standcast.app///']) {
      expect(parseEnv({ ...base, PUBLIC_URL: raw }).PUBLIC_URL).toBe('https://api.standcast.app');
    }
    expect(parseEnv({ ...base, PUBLIC_URL: 'https://x.dev/base/' }).PUBLIC_URL).toBe(
      'https://x.dev/base',
    );
    expect(parseEnv(base).PUBLIC_URL).toBe('https://api.standcast.app');
  });

  test('rejects a PUBLIC_URL that is not a url', () => {
    expect(() => parseEnv({ ...base, PUBLIC_URL: 'api.standcast.app' })).toThrow();
  });

  test('defaults DOCS_URL to the docs domain', () => {
    expect(parseEnv(base).DOCS_URL).toBe('https://docs.standcast.app');
  });

  test('accepts an https DOCS_URL without a trailing slash', () => {
    const DOCS_URL = 'https://docs-standcast.usefachada.dev';
    expect(parseEnv({ ...base, DOCS_URL }).DOCS_URL).toBe(DOCS_URL);
  });

  test('rejects a DOCS_URL that is not https, ends with a slash or is not a url', () => {
    for (const DOCS_URL of [
      'http://docs.standcast.app',
      'https://docs.standcast.app/',
      'docs.standcast.app',
      'javascript:alert(1)',
    ]) {
      expect(() => parseEnv({ ...base, DOCS_URL }), DOCS_URL).toThrow();
    }
  });

  test('defaults LANDING_URL and rejects http or a trailing slash', () => {
    expect(parseEnv(base).LANDING_URL).toBe('https://standcast.usefachada.dev');
    for (const LANDING_URL of ['http://x.dev', 'https://x.dev/', 'x.dev']) {
      expect(() => parseEnv({ ...base, LANDING_URL }), LANDING_URL).toThrow();
    }
  });

  test('google chat is off without GOOGLE_CHAT_SERVICE_ACCOUNT', () => {
    expect(parseEnv(base).GOOGLE_CHAT_SERVICE_ACCOUNT).toBeUndefined();
    expect(parseEnv({ ...base, GOOGLE_CHAT_SERVICE_ACCOUNT: '' }).GOOGLE_CHAT_SERVICE_ACCOUNT).toBe(
      undefined,
    );
  });

  test('GOOGLE_CHAT_SERVICE_ACCOUNT is parsed at startup and fails fast when malformed', () => {
    const key = Buffer.from(
      JSON.stringify({ client_email: 'bot@p.iam.gserviceaccount.com', private_key: 'pem' }),
    ).toString('base64');
    expect(
      parseEnv({ ...base, GOOGLE_CHAT_SERVICE_ACCOUNT: key }).GOOGLE_CHAT_SERVICE_ACCOUNT,
    ).toEqual({ clientEmail: 'bot@p.iam.gserviceaccount.com', privateKey: 'pem' });
    for (const GOOGLE_CHAT_SERVICE_ACCOUNT of [
      'not base64 json',
      Buffer.from('{}').toString('base64'),
    ]) {
      expect(() => parseEnv({ ...base, GOOGLE_CHAT_SERVICE_ACCOUNT })).toThrow(
        /must be a base64 encoded service account JSON key[\s\S]*GOOGLE_CHAT_SERVICE_ACCOUNT/,
      );
    }
  });

  test('GOOGLE_CHAT_AUDIENCE defaults to the webhook url', () => {
    expect(parseEnv(base).GOOGLE_CHAT_AUDIENCE).toBe(
      'https://api.standcast.app/webhooks/google-chat',
    );
    expect(
      parseEnv({ ...base, GOOGLE_CHAT_AUDIENCE: 'https://chat.example.com/hook' })
        .GOOGLE_CHAT_AUDIENCE,
    ).toBe('https://chat.example.com/hook');
    expect(() => parseEnv({ ...base, GOOGLE_CHAT_AUDIENCE: 'not a url' })).toThrow(
      /GOOGLE_CHAT_AUDIENCE/,
    );
  });
});
