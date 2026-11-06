import {
  createGoogleChatChannel,
  createTokenSource,
  type ServiceAccount,
} from '@standcast/google-chat';
import type { ChatFactories } from '@standcast/orchestrator';
import { createSlackChannel } from '@standcast/slack';

export function chatFactories(
  googleChatAccount: ServiceAccount | undefined,
  opts: { fetch?: typeof fetch } = {},
): ChatFactories {
  const token = googleChatAccount ? createTokenSource(googleChatAccount, opts) : null;
  return {
    slack: (secret) => createSlackChannel(secret),
    'google-chat': token ? () => createGoogleChatChannel(token, opts) : null,
  };
}
