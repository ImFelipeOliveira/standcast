import { describe, expect, test } from 'bun:test';
import { parseConfig, type StandcastConfig } from '../src/config';
import {
  CONFIG_REPOS,
  FALLBACK_CONFIG_REPO,
  hasIdentityOverrides,
  isConfigRepo,
  PREFERRED_CONFIG_REPO,
} from '../src/config-repository';

function configWith(members: string): StandcastConfig {
  const parsed = parseConfig(`teams:
  - name: backend
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [alice]
    members: ["@acme/backend"]
    chat: { provider: slack, channel: "#daily" }
${members}`);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.config;
}

describe('config repositories', () => {
  test('prefers .github-private and falls back to .github', () => {
    expect(CONFIG_REPOS).toEqual(['.github-private', '.github']);
    expect(PREFERRED_CONFIG_REPO).toBe('.github-private');
    expect(FALLBACK_CONFIG_REPO).toBe('.github');
  });

  test('recognizes only the config repositories', () => {
    expect(isConfigRepo('.github-private')).toBe(true);
    expect(isConfigRepo('.github')).toBe(true);
    expect(isConfigRepo('.GITHUB')).toBe(false);
    expect(isConfigRepo('api')).toBe(false);
    expect(isConfigRepo(undefined)).toBe(false);
  });
});

describe('hasIdentityOverrides', () => {
  test('is false without a members map', () => {
    expect(hasIdentityOverrides(configWith(''))).toBe(false);
  });

  test('is false when every entry is empty', () => {
    expect(hasIdentityOverrides(configWith('members:\n  alice: {}\n'))).toBe(false);
  });

  test.each([
    ['linear', 'alice@acme.com'],
    ['slack', 'U0123ABCD'],
    ['google_chat', 'users/123456789'],
    ['jira', 'alice'],
  ])('is true with a %s override', (key, value) => {
    expect(
      hasIdentityOverrides(configWith(`members:\n  bob: {}\n  alice: { ${key}: "${value}" }\n`)),
    ).toBe(true);
  });
});
