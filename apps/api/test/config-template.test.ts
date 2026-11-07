import { describe, expect, test } from 'bun:test';
import { parseConfig } from '@standcast/core';
import {
  newConfigFileUrl,
  newConfigRepoUrl,
  standcastYmlTemplate,
} from '../src/web/config-template';

describe('standcastYmlTemplate', () => {
  test('sets the team language from the page language', () => {
    for (const lang of ['en', 'pt-BR'] as const) {
      const result = parseConfig(standcastYmlTemplate('alice', 'Team', lang));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.config.teams[0]?.language).toBe(lang);
    }
  });

  test('offers a slack team and a google chat team, without comments', () => {
    const template = standcastYmlTemplate('alice', 'Team', 'en');
    expect(template.split('\n').some((line) => line.trimStart().startsWith('#'))).toBe(false);
    const result = parseConfig(template);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.teams.map((team) => team.chat)).toEqual([
      { provider: 'slack', channel: '#daily' },
      { provider: 'google-chat', channel: 'spaces/AAAAAAAAAAA' },
    ]);
  });
});

describe('config repository urls', () => {
  test('creates the file in the given repository and branch', () => {
    expect(newConfigFileUrl('acme', '.github-private', 'main', 'teams: []')).toBe(
      'https://github.com/acme/.github-private/new/main?filename=standcast.yml&value=teams%3A%20%5B%5D',
    );
    expect(newConfigFileUrl('acme', '.github', 'trunk', '')).toBe(
      'https://github.com/acme/.github/new/trunk?filename=standcast.yml&value=',
    );
  });

  test('suggests a private .github-private repository', () => {
    expect(newConfigRepoUrl()).toBe(
      'https://github.com/new?name=.github-private&visibility=private',
    );
  });
});
