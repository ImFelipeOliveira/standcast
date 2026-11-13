import { describe, expect, test } from 'bun:test';
import { parseConfig, type StandcastConfig } from '@standcast/core';
import { emptyTeam, toYaml } from './config-yaml';

function config(team: Partial<StandcastConfig['teams'][number]> = {}): StandcastConfig {
  return {
    teams: [
      {
        ...emptyTeam('plataforma'),
        managers: ['felipe'],
        members: ['carla', '@acme/platform'],
        ...team,
      },
    ],
    members: { felipe: { googleChat: 'users/1029' }, ana: { linear: 'ana@acme.dev' } },
  };
}

describe('emptyTeam', () => {
  test('defaults to en like standcast.yml, or to the language it is given', () => {
    expect(emptyTeam('x').language).toBe('en');
    expect(emptyTeam('x', 'pt-BR').language).toBe('pt-BR');
  });
});

describe('toYaml', () => {
  for (const chat of [
    { provider: 'slack' as const, channel: '#daily-plataforma' },
    { provider: 'google-chat' as const, channel: 'spaces/AAAA' },
  ]) {
    for (const tracker of [
      undefined,
      { provider: 'linear' as const, team: 'PLT' },
      { provider: 'jira' as const, team: 'PLT' },
    ]) {
      test(`${chat.provider} with ${tracker?.provider ?? 'no tracker'} is accepted by the server parser`, () => {
        const source = toYaml(config({ chat, ...(tracker ? { tracker } : {}) }));
        const parsed = parseConfig(source);
        expect(parsed.ok, source).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.config.teams[0]?.chat).toEqual(chat);
        expect(parsed.config.teams[0]?.tracker).toEqual(tracker);
        expect(parsed.config.members).toEqual(config().members);
      });
    }
  }

  test('quotes times, channels and team references', () => {
    const source = toYaml(config({ chat: { provider: 'slack', channel: '#daily' } }));
    expect(source).toContain('remind_at: "09:00"');
    expect(source).toContain('channel: "#daily"');
    expect(source).toContain('"@acme/platform"');
  });

  test('the blocker alert is written only when set', () => {
    expect(toYaml(config())).not.toContain('blocker_alert_days');
    const source = toYaml(config({ signals: { ...emptyTeam('x').signals, blockerAlertDays: 3 } }));
    expect(source).toContain('blocker_alert_days: 3');
    const parsed = parseConfig(source);
    expect(parsed.ok && parsed.config.teams[0]?.signals.blockerAlertDays).toBe(3);
  });
});
