import { describe, expect, test } from 'bun:test';
import { parseConfig } from '@standcast/core';
import { standcastYmlTemplate } from '../src/web/config-template';

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
