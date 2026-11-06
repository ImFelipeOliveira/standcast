import {
  type ChannelCheck,
  type ChatChannel,
  GOOGLE_CHAT_USER_ID,
  type Message,
  type MessageRef,
} from '@standcast/core';
import { ChatDeliveryError, discard, readJson, send, statusError } from './errors';
import { renderGoogleChat } from './render';

export const GOOGLE_CHAT_API_URL = 'https://chat.googleapis.com';
export const REPLY_OPTION = 'REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD';

const SPACE_NAME = /^spaces\/[A-Za-z0-9_-]+$/;

export type ChatTokenProvider = (() => Promise<string>) & { invalidate?: () => void };

export type GoogleChatChannelOptions = { apiUrl?: string; fetch?: typeof fetch };

export function isGoogleChatSpace(name: string): boolean {
  return SPACE_NAME.test(name);
}

export function createGoogleChatChannel(
  token: ChatTokenProvider,
  opts: GoogleChatChannelOptions = {},
): ChatChannel {
  const fetchImpl = opts.fetch ?? fetch;
  const api = `${(opts.apiUrl ?? GOOGLE_CHAT_API_URL).replace(/\/+$/, '')}/v1`;

  async function call(method: 'GET' | 'POST', path: string, body?: object): Promise<Response> {
    const headers: Record<string, string> = { Authorization: `Bearer ${await token()}` };
    if (body) headers['Content-Type'] = 'application/json';
    const response = await send(fetchImpl, `${api}/${path}`, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 401) token.invalidate?.();
    return response;
  }

  async function post(
    space: string,
    msg: Message,
    overrides: Record<number, string>,
    thread?: string,
  ): Promise<MessageRef> {
    const path = thread
      ? `${space}/messages?messageReplyOption=${REPLY_OPTION}`
      : `${space}/messages`;
    const response = await call('POST', path, {
      ...renderGoogleChat(msg),
      ...(thread ? { thread: { name: thread } } : {}),
    });
    if (!response.ok) {
      await discard(response);
      throw statusError(response.status, overrides);
    }
    const created = (await readJson(response)) as { thread?: { name?: unknown } } | null;
    const threadName = created?.thread?.name;
    if (typeof threadName !== 'string' || threadName.length === 0) {
      throw new ChatDeliveryError('invalid_response', 'google response missing thread name');
    }
    return { channel: space, id: threadName };
  }

  function requireSpace(space: string): void {
    if (!SPACE_NAME.test(space)) {
      throw new ChatDeliveryError('channel_not_found', 'not a google chat space name');
    }
  }

  const channelErrors = { 403: 'not_in_channel', 404: 'channel_not_found' };

  async function findDirectSpace(userId: string): Promise<string> {
    if (!GOOGLE_CHAT_USER_ID.test(userId)) {
      throw new ChatDeliveryError('user_not_found', 'not a google chat user name');
    }
    const response = await call(
      'GET',
      `spaces:findDirectMessage?${new URLSearchParams({ name: userId })}`,
    );
    if (!response.ok) {
      await discard(response);
      throw statusError(response.status, { 400: 'user_not_found', 404: 'no_dm_space' });
    }
    const space = (await readJson(response)) as { name?: unknown } | null;
    if (typeof space?.name !== 'string' || !SPACE_NAME.test(space.name)) {
      throw new ChatDeliveryError('invalid_response', 'google response missing space name');
    }
    return space.name;
  }

  async function checkChannel(space: string): Promise<ChannelCheck> {
    if (!SPACE_NAME.test(space)) return 'not_found';
    const response = await call('GET', space);
    await discard(response);
    if (response.ok) return 'ok';
    if (response.status === 404) return 'not_found';
    if (response.status === 403) return 'not_member';
    throw statusError(response.status);
  }

  return {
    postToChannel: async (space, msg) => {
      requireSpace(space);
      return post(space, msg, channelErrors);
    },
    replyInThread: async (ref, msg) => {
      requireSpace(ref.channel);
      if (!ref.id.startsWith(`${ref.channel}/threads/`)) {
        throw new ChatDeliveryError('invalid_response', 'thread does not belong to the space');
      }
      return post(ref.channel, msg, channelErrors, ref.id);
    },
    sendDirect: async (userId, msg) => {
      const space = await findDirectSpace(userId);
      return post(space, msg, { 403: 'not_in_channel', 404: 'user_not_found' });
    },
    findUserByEmail: async () => null,
    checkChannel,
  };
}
