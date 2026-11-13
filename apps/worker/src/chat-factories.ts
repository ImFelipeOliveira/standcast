import {
  createGoogleChatChannel,
  createTokenSource,
  type ServiceAccount,
} from '@standcast/google-chat';
import type { ChatFactories } from '@standcast/orchestrator';
import { createSlackChannel } from '@standcast/slack';

export function chatFactories(
  googleChatAccount: ServiceAccount | undefined,
  opts: { fetch?: typeof fetch; interactionUrl?: string } = {},
): ChatFactories {
  const { interactionUrl, ...http } = opts;
  const token = googleChatAccount ? createTokenSource(googleChatAccount, http) : null;
  const channelOptions = interactionUrl ? { ...http, interactionUrl } : http;
  return {
    slack: (secret) => createSlackChannel(secret),
    'google-chat': token ? () => createGoogleChatChannel(token, channelOptions) : null,
  };
}
