import type { EditableConfig } from '@standcast/orchestrator';

export type ConfigDraft = NonNullable<EditableConfig['config']>;
export type TeamDraft = ConfigDraft['teams'][number];

const PLAIN = /^[A-Za-z][A-Za-z0-9_./-]*$/;
const RESERVED = /^(true|false|yes|no|on|off|null|~)$/i;

function scalar(value: string): string {
  return PLAIN.test(value) && !RESERVED.test(value) ? value : JSON.stringify(value);
}

function list(values: string[]): string {
  return `[${values.map(scalar).join(', ')}]`;
}

export function emptyTeam(name: string, language: TeamDraft['language'] = 'en'): TeamDraft {
  return {
    name,
    timezone: 'America/Sao_Paulo',
    workdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
    remindAt: '09:00',
    digestAt: '10:00',
    language,
    managers: [],
    members: [],
    chat: { provider: 'slack', channel: '#daily' },
    signals: { prReviewHours: 48, cardStaleDays: 5, directMessage: false },
  };
}

const MEMBER_KEYS = {
  slack: 'slack',
  googleChat: 'google_chat',
  linear: 'linear',
  jira: 'jira',
} as const;

export function toYaml(config: ConfigDraft): string {
  const lines = ['teams:'];
  for (const team of config.teams) {
    lines.push(
      `  - name: ${scalar(team.name)}`,
      `    timezone: ${scalar(team.timezone)}`,
      `    workdays: ${list(team.workdays)}`,
      `    remind_at: ${JSON.stringify(team.remindAt)}`,
      `    digest_at: ${JSON.stringify(team.digestAt)}`,
      `    language: ${team.language}`,
      `    managers: ${list(team.managers)}`,
      `    members: ${list(team.members)}`,
      '    chat:',
      `      provider: ${team.chat.provider}`,
      `      channel: ${scalar(team.chat.channel)}`,
    );
    if (team.tracker) {
      lines.push(
        '    tracker:',
        `      provider: ${team.tracker.provider}`,
        `      team: ${scalar(team.tracker.team)}`,
      );
    }
    lines.push(
      '    signals:',
      `      pr_review_hours: ${team.signals.prReviewHours}`,
      `      card_stale_days: ${team.signals.cardStaleDays}`,
      `      direct_message: ${team.signals.directMessage}`,
    );
    if (team.signals.blockerAlertDays !== undefined) {
      lines.push(`      blocker_alert_days: ${team.signals.blockerAlertDays}`);
    }
  }
  const members = Object.entries(config.members).filter(([, overrides]) =>
    Object.values(overrides).some((value) => value),
  );
  if (members.length > 0) {
    lines.push('members:');
    for (const [login, overrides] of members) {
      lines.push(`  ${scalar(login)}:`);
      for (const [key, name] of Object.entries(MEMBER_KEYS) as [
        keyof typeof MEMBER_KEYS,
        string,
      ][]) {
        const value = overrides[key];
        if (value) lines.push(`    ${name}: ${scalar(value)}`);
      }
    }
  }
  return `${lines.join('\n')}\n`;
}
