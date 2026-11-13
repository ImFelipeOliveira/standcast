import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type Language = 'pt-BR' | 'en';
export const CHAT_PROVIDERS = ['slack', 'google-chat'] as const;
export type ChatProvider = (typeof CHAT_PROVIDERS)[number];

export type TeamConfig = {
  name: string;
  timezone: string;
  workdays: Weekday[];
  remindAt: string;
  digestAt: string;
  language: Language;
  managers: string[];
  members: string[];
  chat: { provider: ChatProvider; channel: string };
  tracker?: { provider: 'linear' | 'jira'; team: string };
  signals: {
    prReviewHours: number;
    cardStaleDays: number;
    directMessage: boolean;
    blockerAlertDays?: number;
  };
};

export type MemberOverrides = {
  slack?: string;
  googleChat?: string;
  linear?: string;
  jira?: string;
};

export type StandcastConfig = {
  teams: TeamConfig[];
  members: Record<string, MemberOverrides>;
};

export type ConfigError = { path: string; message: string };

export type ParseConfigResult =
  | { ok: true; config: StandcastConfig }
  | { ok: false; errors: ConfigError[] };

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:MM (24h)');

const timezone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, 'unknown IANA timezone');

const weekday = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
const login = z.string().min(1);
const GITHUB_TEAM_REFERENCE = /^@([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/;

export type GitHubTeamReference = { org: string; slug: string };

export function parseTeamReference(value: string): GitHubTeamReference | null {
  const match = GITHUB_TEAM_REFERENCE.exec(value);
  if (!match) return null;
  const slug = match[2] as string;
  if (slug === '.' || slug === '..') return null;
  return { org: match[1] as string, slug };
}

const loginOrTeam = (field: string) =>
  login.refine((value) => !value.startsWith('@') || parseTeamReference(value) !== null, {
    message: `${field} must be GitHub logins or GitHub teams written as @org/team-slug`,
  });

const BLOCKER_ALERT_DAYS_MESSAGE =
  'blocker_alert_days must be a whole number of days greater than 0';

const blockerAlertDays = z
  .number({ error: BLOCKER_ALERT_DAYS_MESSAGE })
  .int(BLOCKER_ALERT_DAYS_MESSAGE)
  .positive(BLOCKER_ALERT_DAYS_MESSAGE);

const teamSchema = z.strictObject({
  name: z.string().min(1),
  timezone,
  workdays: z.array(weekday).min(1).default(['mon', 'tue', 'wed', 'thu', 'fri']),
  remind_at: time,
  digest_at: time,
  language: z.enum(['pt-BR', 'en']).default('en'),
  managers: z.array(loginOrTeam('managers')).min(1),
  members: z.array(loginOrTeam('members')).min(1),
  chat: z.strictObject({
    provider: z.enum(CHAT_PROVIDERS),
    channel: z.string().min(1),
  }),
  tracker: z
    .strictObject({
      provider: z.enum(['linear', 'jira']),
      team: z.string().min(1),
    })
    .optional(),
  signals: z
    .strictObject({
      pr_review_hours: z.number().positive().default(48),
      card_stale_days: z.number().positive().default(5),
      direct_message: z.boolean().default(false),
      blocker_alert_days: blockerAlertDays.optional(),
    })
    .default({ pr_review_hours: 48, card_stale_days: 5, direct_message: false }),
});

export const SLACK_USER_ID = /^[UW][A-Z0-9]{2,}$/;

export const GOOGLE_CHAT_USER_ID = /^users\/\d+$/;

export const GOOGLE_CHAT_SPACE = /^spaces\/[A-Za-z0-9_-]+$/;

export function isSlackUserId(id: string): boolean {
  return SLACK_USER_ID.test(id);
}

export function memberOverrides(config: StandcastConfig, login: string): MemberOverrides {
  const lower = login.toLowerCase();
  return Object.entries(config.members).find(([key]) => key.toLowerCase() === lower)?.[1] ?? {};
}

const overridesSchema = z.strictObject({
  slack: z.string().regex(SLACK_USER_ID, 'must be a Slack user id like U0123ABCD').optional(),
  google_chat: z
    .string()
    .regex(GOOGLE_CHAT_USER_ID, 'must be a Google Chat user like users/123456789')
    .optional(),
  linear: z.email('linear must be an email address').optional(),
  jira: z.string().optional(),
});

const configSchema = z
  .strictObject({
    teams: z.array(teamSchema).min(1),
    members: z.record(z.string(), overridesSchema).default({}),
  })
  .superRefine((cfg, ctx) => {
    const seen = new Set<string>();
    cfg.teams.forEach((t, i) => {
      if (seen.has(t.name)) {
        ctx.addIssue({
          code: 'custom',
          path: ['teams', i, 'name'],
          message: `duplicate team name "${t.name}"`,
        });
      }
      seen.add(t.name);
      if (t.remind_at >= t.digest_at) {
        ctx.addIssue({
          code: 'custom',
          path: ['teams', i, 'remind_at'],
          message: 'remind_at must be before digest_at',
        });
      }
      if (t.chat.provider === 'google-chat' && !GOOGLE_CHAT_SPACE.test(t.chat.channel)) {
        ctx.addIssue({
          code: 'custom',
          path: ['teams', i, 'chat', 'channel'],
          message: googleChatChannelMessage(t.chat.channel),
        });
      }
    });
  });

const GOOGLE_CHAT_SPACE_IN_URL = /\/(?:room|space)\/([A-Za-z0-9_-]+)/;

function googleChatChannelMessage(channel: string): string {
  const base = 'must be a Google Chat space name like spaces/AAAAxxxxxxx';
  const fromUrl = GOOGLE_CHAT_SPACE_IN_URL.exec(channel)?.[1];
  return fromUrl ? `${base}; for this link use spaces/${fromUrl}` : base;
}

type RawConfig = z.output<typeof configSchema>;

function compact<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

function toConfig(raw: RawConfig): StandcastConfig {
  return {
    teams: raw.teams.map((t) => {
      const team: TeamConfig = {
        name: t.name,
        timezone: t.timezone,
        workdays: t.workdays,
        remindAt: t.remind_at,
        digestAt: t.digest_at,
        language: t.language,
        managers: t.managers,
        members: t.members,
        chat: t.chat,
        signals: {
          prReviewHours: t.signals.pr_review_hours,
          cardStaleDays: t.signals.card_stale_days,
          directMessage: t.signals.direct_message,
        },
      };
      if (t.signals.blocker_alert_days !== undefined) {
        team.signals.blockerAlertDays = t.signals.blocker_alert_days;
      }
      if (t.tracker) team.tracker = t.tracker;
      return team;
    }),
    members: Object.fromEntries(
      Object.entries(raw.members).map(([k, v]) => [
        k,
        compact({ slack: v.slack, googleChat: v.google_chat, linear: v.linear, jira: v.jira }),
      ]),
    ),
  };
}

export function parseConfig(source: string): ParseConfigResult {
  let data: unknown;
  try {
    data = parseYaml(source);
  } catch (e) {
    return { ok: false, errors: [{ path: '', message: (e as Error).message }] };
  }
  const result = configSchema.safeParse(data);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    };
  }
  return { ok: true, config: toConfig(result.data) };
}
