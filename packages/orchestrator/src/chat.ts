import type { ChatChannel } from '@standcast/core';
import { getConnection } from '@standcast/db';
import type { Deps } from './deps';

export type ChatFactories = {
  slack: (secret: string) => ChatChannel;
  'google-chat': (() => ChatChannel) | null;
};

export function createChatFor(
  db: Parameters<typeof getConnection>[0],
  encryptionKey: Uint8Array,
  factories: ChatFactories,
): Deps['chatFor'] {
  return async (installationId, provider) => {
    const connection = await getConnection(db, installationId, provider, encryptionKey);
    if (!connection) return null;
    if (provider === 'slack') return factories.slack(connection.secret);
    const googleChat = factories['google-chat'];
    return googleChat ? googleChat() : null;
  };
}
