import type { ChatProvider, MessageRef } from '@standcast/core';

const SPACE = /^spaces\/([A-Za-z0-9_-]+)$/;
const THREAD = /^spaces\/[A-Za-z0-9_-]+\/threads\/([A-Za-z0-9_-]+)$/;

export function chatLink(
  provider: ChatProvider,
  ref: MessageRef | null,
  slackTeamId: string | null,
): string | null {
  if (!ref) return null;
  if (provider === 'slack') {
    if (!slackTeamId) return null;
    const query = new URLSearchParams({ team: slackTeamId, channel: ref.channel });
    return `https://slack.com/app_redirect?${query}`;
  }
  const space = SPACE.exec(ref.channel)?.[1];
  if (!space) return null;
  const thread = THREAD.exec(ref.id)?.[1];
  return thread
    ? `https://chat.google.com/room/${space}/${thread}`
    : `https://chat.google.com/room/${space}`;
}
