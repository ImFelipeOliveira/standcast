import { describe, expect, test } from 'bun:test';
import { ChatDeliveryError, type Message } from '@standcast/core';
import { createGoogleChatChannel, GOOGLE_CHAT_REQUEST_TIMEOUT_MS } from '../src';

type Call = { method: string; url: string; headers: Headers; body: unknown; signal?: AbortSignal };

const API = 'https://chat.test';
const msg: Message = { fallbackText: 'fb', blocks: [{ type: 'paragraph', content: ['hi'] }] };

function fake(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      method: init?.method ?? 'GET',
      url: String(url),
      headers: new Headers(init?.headers),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      signal: init?.signal ?? undefined,
    };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  const channel = createGoogleChatChannel(async () => 'ya29.token', {
    apiUrl: API,
    fetch: fetchImpl,
  });
  return { calls, channel };
}

function googleError(status: number): Response {
  return Response.json(
    { error: { code: status, message: 'raw google text', status: 'X' } },
    {
      status,
    },
  );
}

async function failure(run: () => Promise<unknown>): Promise<ChatDeliveryError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(ChatDeliveryError);
    return error as ChatDeliveryError;
  }
  throw new Error('expected failure');
}

describe('createGoogleChatChannel', () => {
  test('post returns the thread as ref', async () => {
    const { calls, channel } = fake(() =>
      Response.json({
        name: 'spaces/AAA/messages/m1',
        thread: { name: 'spaces/AAA/threads/t1' },
      }),
    );
    const ref = await channel.postToChannel('spaces/AAA', msg);
    expect(ref).toEqual({ channel: 'spaces/AAA', id: 'spaces/AAA/threads/t1' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe(`${API}/v1/spaces/AAA/messages`);
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer ya29.token');
    expect(calls[0]?.headers.get('content-type')).toBe('application/json');
    expect(calls[0]?.body).toEqual({ text: 'hi' });
    expect(calls[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(GOOGLE_CHAT_REQUEST_TIMEOUT_MS).toBe(15_000);
  });

  test('reply uses the thread and fallback option', async () => {
    const { calls, channel } = fake(() =>
      Response.json({
        name: 'spaces/AAA/messages/m2',
        thread: { name: 'spaces/AAA/threads/t1' },
      }),
    );
    const ref = await channel.replyInThread(
      { channel: 'spaces/AAA', id: 'spaces/AAA/threads/t1' },
      msg,
    );
    expect(ref).toEqual({ channel: 'spaces/AAA', id: 'spaces/AAA/threads/t1' });
    expect(calls[0]?.url).toBe(
      `${API}/v1/spaces/AAA/messages?messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD`,
    );
    expect(calls[0]?.body).toEqual({ text: 'hi', thread: { name: 'spaces/AAA/threads/t1' } });
  });

  test('a response without a thread is invalid_response', async () => {
    const { channel } = fake(() => Response.json({ name: 'spaces/AAA/messages/m1' }));
    const err = await failure(() => channel.postToChannel('spaces/AAA', msg));
    expect(err.code).toBe('invalid_response');
  });

  test('a malformed space name is not sent', async () => {
    const { calls, channel } = fake(() => Response.json({}));
    const err = await failure(() => channel.postToChannel('spaces/AAA/../x', msg));
    expect(err.code).toBe('channel_not_found');
    expect(await channel.checkChannel('#general')).toBe('not_found');
    expect(calls).toHaveLength(0);
  });

  test('dm finds the space then posts', async () => {
    const { calls, channel } = fake((call) =>
      call.method === 'GET'
        ? Response.json({ name: 'spaces/DM1', spaceType: 'DIRECT_MESSAGE' })
        : Response.json({
            name: 'spaces/DM1/messages/m',
            thread: { name: 'spaces/DM1/threads/t' },
          }),
    );
    const ref = await channel.sendDirect('users/123', msg);
    expect(calls.map((c) => c.method)).toEqual(['GET', 'POST']);
    expect(calls[0]?.url).toBe(`${API}/v1/spaces:findDirectMessage?name=users%2F123`);
    expect(calls[1]?.url).toBe(`${API}/v1/spaces/DM1/messages`);
    expect(ref).toEqual({ channel: 'spaces/DM1', id: 'spaces/DM1/threads/t' });
  });

  test('dm without a space is no_dm_space', async () => {
    const { calls, channel } = fake(() => googleError(404));
    const err = await failure(() => channel.sendDirect('users/123', msg));
    expect(err.code).toBe('no_dm_space');
    expect(err.message).not.toContain('raw google text');
    expect(calls).toHaveLength(1);
  });

  test('dm to an invalid user is user_not_found', async () => {
    const { calls, channel } = fake(() => googleError(400));
    expect((await failure(() => channel.sendDirect('users/123', msg))).code).toBe('user_not_found');
    expect((await failure(() => channel.sendDirect('U123', msg))).code).toBe('user_not_found');
    expect(calls).toHaveLength(1);
  });

  test('a dm space that disappears before the post is user_not_found', async () => {
    const { channel } = fake((call) =>
      call.method === 'GET' ? Response.json({ name: 'spaces/DM1' }) : googleError(404),
    );
    expect((await failure(() => channel.sendDirect('users/123', msg))).code).toBe('user_not_found');
  });

  test('findUserByEmail is always null', async () => {
    const { calls, channel } = fake(() => Response.json({}));
    expect(await channel.findUserByEmail('a@x.com')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  test('check channel maps 404 and 403', async () => {
    const statuses = [200, 404, 403];
    const { calls, channel } = fake(() => {
      const status = statuses[calls.length - 1] ?? 500;
      return status === 200 ? Response.json({ name: 'spaces/AAA' }) : googleError(status);
    });
    expect(await channel.checkChannel('spaces/AAA')).toBe('ok');
    expect(await channel.checkChannel('spaces/AAA')).toBe('not_found');
    expect(await channel.checkChannel('spaces/AAA')).toBe('not_member');
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.url).toBe(`${API}/v1/spaces/AAA`);
    expect((await failure(() => channel.checkChannel('spaces/AAA'))).code).toBe('http_error');
  });

  test('post errors map to delivery codes', async () => {
    const cases: Array<[number, string]> = [
      [401, 'invalid_auth'],
      [403, 'not_in_channel'],
      [404, 'channel_not_found'],
      [500, 'http_error'],
    ];
    for (const [status, code] of cases) {
      const { channel } = fake(() => googleError(status));
      const err = await failure(() => channel.postToChannel('spaces/AAA', msg));
      expect(err.code).toBe(code);
      expect(err.message).not.toContain('raw google text');
    }
  });

  test('429 is ratelimited', async () => {
    const { channel } = fake(() => googleError(429));
    expect((await failure(() => channel.postToChannel('spaces/AAA', msg))).code).toBe(
      'ratelimited',
    );
    expect((await failure(() => channel.checkChannel('spaces/AAA'))).code).toBe('ratelimited');
    expect((await failure(() => channel.sendDirect('users/1', msg))).code).toBe('ratelimited');
  });

  test('timeouts and network failures', async () => {
    const timedOut = fake(() => {
      throw new DOMException('timed out', 'TimeoutError');
    });
    expect((await failure(() => timedOut.channel.postToChannel('spaces/AAA', msg))).code).toBe(
      'timeout',
    );
    const aborted = fake(() => {
      throw new DOMException('aborted', 'AbortError');
    });
    expect((await failure(() => aborted.channel.checkChannel('spaces/AAA'))).code).toBe('timeout');
    const broken = fake(() => {
      throw new TypeError('fetch failed');
    });
    expect((await failure(() => broken.channel.postToChannel('spaces/AAA', msg))).code).toBe(
      'request_failed',
    );
  });

  test('a token failure propagates its code', async () => {
    const channel = createGoogleChatChannel(
      async () => {
        throw new ChatDeliveryError('invalid_auth', 'token rejected');
      },
      { apiUrl: API, fetch: (async () => Response.json({})) as unknown as typeof fetch },
    );
    expect((await failure(() => channel.postToChannel('spaces/AAA', msg))).code).toBe(
      'invalid_auth',
    );
  });
});
