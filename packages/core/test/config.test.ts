import { describe, expect, test } from 'bun:test';
import { parseConfig, parseTeamReference } from '../src/config';

const specExample = `
teams:
  - name: backend
    timezone: America/Boa_Vista
    workdays: [mon, tue, wed, thu, fri]
    remind_at: "09:30"
    digest_at: "10:00"
    language: pt-BR
    managers: [felipeoliveira]
    members: [alice, bob]
    chat:
      provider: slack
      channel: "#daily-backend"
    tracker:
      provider: linear
      team: BE
    signals:
      pr_review_hours: 48
      card_stale_days: 5
members:
  alice: { slack: U0123, linear: alice@acme.com }
`;

const team = (over: Record<string, unknown> = {}) => ({
  name: 'backend',
  timezone: 'America/Boa_Vista',
  remind_at: '09:30',
  digest_at: '10:00',
  managers: ['felipe'],
  members: ['alice'],
  chat: { provider: 'slack', channel: '#daily' },
  ...over,
});

const toYaml = (teams: unknown[]) => JSON.stringify({ teams });

describe('parseConfig', () => {
  test('parses the spec example', () => {
    const r = parseConfig(specExample);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.teams[0]?.digestAt).toBe('10:00');
    expect(r.config.teams[0]?.signals.prReviewHours).toBe(48);
    expect(r.config.members.alice?.slack).toBe('U0123');
  });

  test('rejects a slack id that is not a slack user id', () => {
    for (const slack of ['<!channel>', 'u0123', 'U1', 'C0123']) {
      const r = parseConfig(JSON.stringify({ teams: [team()], members: { alice: { slack } } }));
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.errors[0]?.path).toBe('members.alice.slack');
      expect(r.errors[0]?.message).toContain('Slack user id');
    }
  });

  test('requires linear member override to be an email', () => {
    const ok = parseConfig(
      JSON.stringify({ teams: [team()], members: { alice: { linear: 'alice@acme.com' } } }),
    );
    expect(ok.ok).toBe(true);
    const bad = parseConfig(
      JSON.stringify({ teams: [team()], members: { alice: { linear: 'alice' } } }),
    );
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.errors[0]?.path).toBe('members.alice.linear');
    expect(bad.errors[0]?.message).toContain('linear must be an email address');
  });

  test('still parses tracker provider jira', () => {
    const r = parseConfig(toYaml([team({ tracker: { provider: 'jira', team: 'BE' } })]));
    expect(r.ok).toBe(true);
  });

  test('google_chat override must be users/<digits>', () => {
    const ok = parseConfig(
      JSON.stringify({ teams: [team()], members: { alice: { google_chat: 'users/123456789' } } }),
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.config.members.alice?.googleChat).toBe('users/123456789');
    for (const google_chat of ['123456789', 'users/abc', 'users/', 'spaces/123', 'users/1 ']) {
      const r = parseConfig(
        JSON.stringify({ teams: [team()], members: { alice: { google_chat } } }),
      );
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.errors[0]?.path).toBe('members.alice.google_chat');
      expect(r.errors[0]?.message).toBe('must be a Google Chat user like users/123456789');
    }
  });

  test('a google chat team needs a space name as the channel', () => {
    const chat = (channel: string) => ({ chat: { provider: 'google-chat', channel } });
    expect(parseConfig(toYaml([team(chat('spaces/AAAAxxxxxxx'))])).ok).toBe(true);
    const invalid = ['#daily', 'daily-dev', 'spaces/', 'spaces/AAAA/messages', 'AAAAxxxxxxx'];
    for (const channel of invalid) {
      const r = parseConfig(toYaml([team(chat(channel))]));
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.errors[0]?.path).toBe('teams.0.chat.channel');
      expect(r.errors[0]?.message).toBe('must be a Google Chat space name like spaces/AAAAxxxxxxx');
    }
  });

  test('a google chat link as the channel suggests the space name', () => {
    for (const channel of [
      'https://chat.google.com/room/AAAAb1c2D3e?cls=7',
      'https://mail.google.com/chat/u/0/#chat/space/AAAAb1c2D3e',
    ]) {
      const r = parseConfig(toYaml([team({ chat: { provider: 'google-chat', channel } })]));
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.errors[0]?.message).toContain('for this link use spaces/AAAAb1c2D3e');
    }
  });

  test('a slack channel keeps any name', () => {
    const slack = team({ chat: { provider: 'slack', channel: 'daily-dev' } });
    expect(parseConfig(toYaml([slack])).ok).toBe(true);
  });

  test('accepts U and W slack user ids', () => {
    for (const slack of ['U0123', 'W0ABC9']) {
      const r = parseConfig(JSON.stringify({ teams: [team()], members: { alice: { slack } } }));
      expect(r.ok).toBe(true);
    }
  });

  test('applies defaults', () => {
    const r = parseConfig(toYaml([team()]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const t = r.config.teams[0];
    expect(t?.language).toBe('en');
    expect(t?.workdays).toEqual(['mon', 'tue', 'wed', 'thu', 'fri']);
    expect(t?.signals.cardStaleDays).toBe(5);
    expect(t?.signals.prReviewHours).toBe(48);
    expect(t?.tracker).toBeUndefined();
    expect(r.config.members).toEqual({});
  });

  test('rejects bad time', () => {
    const r = parseConfig(toYaml([team({ digest_at: '25:00' })]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.path === 'teams.0.digest_at')).toBe(true);
  });

  test('accepts managers written as @org/team-slug, mixed with logins', () => {
    const r = parseConfig(
      toYaml([team({ managers: ['alice', '@acme/eng-leads', '@Acme/ops_1'] })]),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.teams[0]?.managers).toEqual(['alice', '@acme/eng-leads', '@Acme/ops_1']);
  });

  test('rejects @-prefixed managers that are not @org/team-slug', () => {
    for (const value of ['@alice', '@acme/', '@/leads', '@acme/leads/extra', '@ac me/leads', '@']) {
      const r = parseConfig(toYaml([team({ managers: [value] })]));
      expect(r.ok).toBe(false);
      if (r.ok) return;
      const error = r.errors.find((e) => e.path === 'teams.0.managers.0');
      expect(error?.message).toContain('@org/team-slug');
    }
  });

  test('members follow the same team reference rule as managers', () => {
    const ok = parseConfig(toYaml([team({ members: ['alice', '@acme/eng-leads'] })]));
    expect(ok.ok).toBe(true);
    for (const value of ['@alice', '@acme/team name', '@acme/']) {
      const r = parseConfig(toYaml([team({ members: [value] })]));
      expect(r.ok).toBe(false);
      if (r.ok) return;
      const error = r.errors.find((e) => e.path === 'teams.0.members.0');
      expect(error?.message).toBe(
        'members must be GitHub logins or GitHub teams written as @org/team-slug',
      );
    }
  });

  test('still requires at least one manager', () => {
    const r = parseConfig(toYaml([team({ managers: [] })]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.path === 'teams.0.managers')).toBe(true);
  });

  test('accepts plain logins as managers', () => {
    expect(parseConfig(toYaml([team({ managers: ['alice', 'bob'] })])).ok).toBe(true);
  });

  test('parseTeamReference splits org and slug, and rejects anything else', () => {
    expect(parseTeamReference('@acme/eng-leads')).toEqual({ org: 'acme', slug: 'eng-leads' });
    expect(parseTeamReference('alice')).toBeNull();
    expect(parseTeamReference('@acme')).toBeNull();
    expect(parseTeamReference('@acme/leads/x')).toBeNull();
    expect(parseTeamReference('@acme/team name')).toBeNull();
  });

  test('a team slug of only "." or ".." is rejected, other dotted slugs are kept', () => {
    expect(parseTeamReference('@acme/.')).toBeNull();
    expect(parseTeamReference('@acme/..')).toBeNull();
    expect(parseTeamReference('@acme/.leads')).toEqual({ org: 'acme', slug: '.leads' });
    expect(parseTeamReference('@acme/...')).toEqual({ org: 'acme', slug: '...' });
    for (const field of ['managers', 'members'] as const) {
      for (const value of ['@acme/.', '@acme/..']) {
        const r = parseConfig(toYaml([team({ [field]: [value] })]));
        expect(r.ok).toBe(false);
        if (r.ok) return;
        const error = r.errors.find((e) => e.path === `teams.0.${field}.0`);
        expect(error?.message).toContain('@org/team-slug');
      }
      expect(parseConfig(toYaml([team({ [field]: ['@acme/.leads', '@acme/eng.leads'] })])).ok).toBe(
        true,
      );
    }
  });

  test('rejects unknown timezone', () => {
    const r = parseConfig(toYaml([team({ timezone: 'Mars/Base' })]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.path === 'teams.0.timezone')).toBe(true);
  });

  test('rejects duplicate team names', () => {
    const r = parseConfig(toYaml([team(), team()]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.path === 'teams.1.name')).toBe(true);
  });

  test('rejects invalid yaml', () => {
    const r = parseConfig('teams: [unclosed');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]?.path).toBe('');
  });

  test('rejects empty members', () => {
    const r = parseConfig(toYaml([team({ members: [] })]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.path === 'teams.0.members')).toBe(true);
  });

  test('rejects empty workdays', () => {
    const r = parseConfig(toYaml([team({ workdays: [] })]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.path === 'teams.0.workdays')).toBe(true);
  });

  test('rejects unknown keys', () => {
    const r = parseConfig(toYaml([team({ bogus: 1 })]));
    expect(r.ok).toBe(false);
  });

  test('signals.direct_message defaults to false', () => {
    const r = parseConfig(toYaml([team()]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.teams[0]?.signals.directMessage).toBe(false);
  });

  test('signals.direct_message can be enabled', () => {
    const r = parseConfig(toYaml([team({ signals: { direct_message: true } })]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.teams[0]?.signals.directMessage).toBe(true);
  });

  test('signals.blocker_alert_days is off when absent', () => {
    const r = parseConfig(toYaml([team()]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.teams[0]?.signals.blockerAlertDays).toBeUndefined();
    expect('blockerAlertDays' in (r.config.teams[0]?.signals ?? {})).toBe(false);
  });

  test('signals.blocker_alert_days accepts a positive whole number', () => {
    const r = parseConfig(toYaml([team({ signals: { blocker_alert_days: 3 } })]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.teams[0]?.signals.blockerAlertDays).toBe(3);
    expect(r.config.teams[0]?.signals.cardStaleDays).toBe(5);
  });

  test('signals.blocker_alert_days rejects zero, negative and fractional values', () => {
    for (const blocker_alert_days of [0, -2, 1.5, '3']) {
      const r = parseConfig(toYaml([team({ signals: { blocker_alert_days } })]));
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.errors).toHaveLength(1);
      expect(r.errors[0]?.path).toBe('teams.0.signals.blocker_alert_days');
      expect(r.errors[0]?.message).toBe(
        'blocker_alert_days must be a whole number of days greater than 0',
      );
    }
  });

  test('remind_at must be before digest_at', () => {
    for (const remind_at of ['10:00', '10:30']) {
      const r = parseConfig(toYaml([team({ remind_at, digest_at: '10:00' })]));
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.errors[0]?.path).toBe('teams.0.remind_at');
    }
  });
});
