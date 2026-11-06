import { ChatDeliveryError, type ChatProvider } from '@standcast/core';

const SAFE_CODE = /^[a-z][a-z0-9_]{0,63}$/;

const SLACK_MESSAGES: Record<string, string> = {
  not_in_channel: 'the bot is not in the channel',
  channel_not_found: 'the channel was not found',
  is_archived: 'the channel is archived',
  invalid_auth: 'the Slack connection is no longer valid',
  not_authed: 'the Slack connection is no longer valid',
  token_revoked: 'the Slack connection is no longer valid',
  account_inactive: 'the Slack connection is no longer valid',
  user_not_found: 'the Slack user was not found',
  user_disabled: 'the Slack user is deactivated',
  ratelimited: 'Slack rate limited the request',
  timeout: 'Slack did not answer in time',
  deadline_exceeded: 'the attempt ran past its deadline',
  request_failed: 'could not reach Slack',
  http_error: 'Slack returned an HTTP error',
  invalid_response: 'Slack returned an unexpected response',
};

const GOOGLE_CHAT_MESSAGES: Record<string, string> = {
  not_in_channel: 'the Standcast app is not in the space',
  channel_not_found: 'the space was not found',
  space_not_linked: 'the space is not linked to this organization',
  no_dm_space: 'the person has not opened a chat with the Standcast app yet',
  invalid_auth: 'the Google Chat credentials are not valid',
  user_not_found: 'the Google Chat user was not found',
  ratelimited: 'Google Chat rate limited the request',
  timeout: 'Google Chat did not answer in time',
  deadline_exceeded: 'the attempt ran past its deadline',
  request_failed: 'could not reach Google Chat',
  http_error: 'Google Chat returned an HTTP error',
  invalid_response: 'Google Chat returned an unexpected response',
};

const COPY: Record<ChatProvider, { messages: Record<string, string>; fallback: string }> = {
  slack: { messages: SLACK_MESSAGES, fallback: 'Slack rejected the message' },
  'google-chat': { messages: GOOGLE_CHAT_MESSAGES, fallback: 'Google Chat rejected the message' },
};

const TERMINAL_CODES = new Set(['no_dm_space', 'space_not_linked']);

export function describeDeliveryError(error: unknown, provider: ChatProvider = 'slack'): string {
  if (!(error instanceof ChatDeliveryError)) return 'internal_error: unexpected error';
  const code = SAFE_CODE.test(error.code) ? error.code : 'unknown_error';
  const copy = COPY[provider] ?? COPY.slack;
  return `${code}: ${copy.messages[code] ?? copy.fallback}`;
}

export function isTerminalDeliveryError(error: unknown): boolean {
  return error instanceof ChatDeliveryError && TERMINAL_CODES.has(error.code);
}

export function spaceNotLinked(): ChatDeliveryError {
  return new ChatDeliveryError('space_not_linked', 'the space is not linked to this installation');
}
