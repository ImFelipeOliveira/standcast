import type { SetupStatus, TrackerNotice } from '@standcast/orchestrator';
import { ApiError } from '../../api/client';
import type {
  ApiKeyScope,
  WebhookDelivery,
  WebhookEndpoint,
  WebhookEvent,
} from '../../api/mutations';
import type { Lang, MessageKey } from '../../i18n';

export type Translate = (key: MessageKey, vars?: Record<string, string>) => string;

export const API_KEY_SCOPES: readonly ApiKeyScope[] = [
  'teams:read',
  'dailies:read',
  'digests:read',
  'blockers:read',
];

export const WEBHOOK_EVENTS: readonly WebhookEvent[] = [
  'daily.submitted',
  'blocker.opened',
  'digest.sent',
];

export const SCOPE_LABELS: Record<ApiKeyScope, MessageKey> = {
  'teams:read': 'setup.apiKeys.scope.teams_read',
  'dailies:read': 'setup.apiKeys.scope.dailies_read',
  'digests:read': 'setup.apiKeys.scope.digests_read',
  'blockers:read': 'setup.apiKeys.scope.blockers_read',
};

export const EVENT_LABELS: Record<WebhookEvent, MessageKey> = {
  'daily.submitted': 'setup.webhooks.event.daily_submitted',
  'blocker.opened': 'setup.webhooks.event.blocker_opened',
  'digest.sent': 'setup.webhooks.event.digest_sent',
};

export const DELIVERY_LABELS: Record<WebhookDelivery['status'], MessageKey> = {
  pending: 'setup.webhooks.delivery.pending',
  delivered: 'setup.webhooks.delivery.delivered',
  failed: 'setup.webhooks.delivery.failed',
};

export type DisabledReason = NonNullable<WebhookEndpoint['disabledReason']>;

type FailureKind =
  | SetupStatus['teamFailures'][number]['kind']
  | SetupStatus['personFailures'][number]['kind'];

export const FAILURE_KIND_LABELS: Record<FailureKind, MessageKey> = {
  digest: 'setup.failed.kind.digest',
  late_daily: 'setup.failed.kind.late_daily',
  reminder: 'setup.failed.kind.reminder',
  blocker_route: 'setup.failed.kind.blocker_route',
};

const FAILURE_REASONS: Record<string, MessageKey> = {
  not_in_channel: 'setup.failure.not_in_channel',
  channel_not_found: 'setup.failure.channel_not_found',
  is_archived: 'setup.failure.is_archived',
  invalid_auth: 'setup.failure.slack_invalid',
  not_authed: 'setup.failure.slack_invalid',
  token_revoked: 'setup.failure.slack_invalid',
  account_inactive: 'setup.failure.slack_invalid',
  user_not_found: 'setup.failure.user_not_found',
  user_disabled: 'setup.failure.user_disabled',
  ratelimited: 'setup.failure.ratelimited',
  timeout: 'setup.failure.timeout',
  deadline_exceeded: 'setup.failure.deadline_exceeded',
  request_failed: 'setup.failure.request_failed',
  http_error: 'setup.failure.http_error',
  invalid_response: 'setup.failure.invalid_response',
  unknown_error: 'setup.failure.unknown_error',
  no_chat_connection: 'setup.failure.no_chat_connection',
  no_chat_identity: 'setup.failure.no_chat_identity',
  no_route_target: 'setup.failure.no_route_target',
  unsupported_provider: 'setup.failure.unsupported_provider',
  internal_error: 'setup.failure.internal_error',
  worker_died: 'setup.failure.worker_died',
};

export type FailureReason = { code: string; text: string | null; detail: string | null };

export function failureReason(t: Translate, error: string): FailureReason {
  const separator = error.indexOf(':');
  const code = (separator === -1 ? error : error.slice(0, separator)).trim();
  const rest = separator === -1 ? '' : error.slice(separator + 1).trim();
  const key = Object.hasOwn(FAILURE_REASONS, code) ? FAILURE_REASONS[code] : undefined;
  if (!key) return { code: error, text: null, detail: null };
  const detail = code === 'no_chat_identity' && rest ? rest : null;
  return { code, text: t(key), detail };
}

export const TRACKER_NOTICES: Record<TrackerNotice, MessageKey> = {
  linear_not_connected: 'setup.tracker.notConnected',
  jira_coming_soon: 'setup.tracker.jiraComingSoon',
};

export type TeamNotice = SetupStatus['teamNotices'][number];

const TEAM_NOTICES: Record<string, MessageKey> = {
  missing: 'setup.teams.missing',
  truncated: 'setup.teams.truncated',
  channel_not_found: 'setup.teams.channelNotFound',
  channel_not_member: 'setup.teams.channelNotMember',
};

export function noticeText(t: Translate, notice: TeamNotice): string | null {
  const key = Object.hasOwn(TEAM_NOTICES, notice.kind) ? TEAM_NOTICES[notice.kind] : undefined;
  return key ? t(key, { team: notice.team, reference: notice.reference }) : null;
}

export const CONFIG_REASONS: Record<string, MessageKey> = {
  no_repo: 'setup.config.reason.no_repo',
  no_file: 'setup.config.reason.no_file',
  no_access: 'setup.config.reason.no_access',
};

export function reasonText(t: Translate, reason: string): string {
  const key = Object.hasOwn(CONFIG_REASONS, reason) ? CONFIG_REASONS[reason] : undefined;
  return key ? t(key) : '';
}

export function formatDate(lang: Lang, value: Date | string): string {
  return new Intl.DateTimeFormat(lang, { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export function errorMessage(t: Translate, error: unknown): string {
  return error instanceof ApiError && error.code === 'invalid_request'
    ? `${t('setup.actionFailed')} ${error.message}`
    : t('setup.actionFailed');
}
