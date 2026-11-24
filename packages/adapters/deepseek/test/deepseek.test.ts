import { describe, expect, test } from 'bun:test';
import { TextModelError } from '@standcast/core';
import { createDeepSeekModel } from '../src';

const KEY = 'sk-1';

function setup(status: number, body: unknown) {
  const calls: { url: string; headers: Headers; body: string }[] = [];
  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), headers: new Headers(init?.headers), body: String(init?.body) });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  }) as typeof fetch;
  return { calls, model: createDeepSeekModel(KEY, 'deepseek-chat', { fetch: fetchImpl }) };
}

async function failure(run: () => Promise<unknown>): Promise<TextModelError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(TextModelError);
    return error as TextModelError;
  }
  throw new Error('expected failure');
}

const request = { system: 'S', user: 'U' };

describe('createDeepSeekModel', () => {
  test('posts a JSON chat completion and returns the message content', async () => {
    const { calls, model } = setup(200, { choices: [{ message: { content: '{"kind":"new"}' } }] });
    expect(await model.completeJson(request)).toBe('{"kind":"new"}');
    const call = calls[0];
    expect(call?.url).toBe('https://api.deepseek.com/chat/completions');
    expect(call?.headers.get('authorization')).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(String(call?.body))).toEqual({
      model: 'deepseek-chat',
      stream: false,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'S' },
        { role: 'user', content: 'U' },
      ],
    });
  });

  test('401 is rejected_key', async () => {
    const error = await failure(() => setup(401, `bad ${KEY}`).model.completeJson(request));
    expect(error.code).toBe('rejected_key');
  });

  test('403, 429 and 5xx are http_error', async () => {
    for (const status of [403, 429, 500, 503]) {
      const error = await failure(() => setup(status, {}).model.completeJson(request));
      expect(error.code).toBe('http_error');
    }
  });

  test('timeout is timeout; network failure is request_failed', async () => {
    const timeoutFetch = (async () => {
      throw new DOMException('t', 'TimeoutError');
    }) as unknown as typeof fetch;
    const netFetch = (async () => {
      throw new TypeError('down');
    }) as unknown as typeof fetch;
    const timeout = await failure(() =>
      createDeepSeekModel(KEY, 'm', { fetch: timeoutFetch }).completeJson(request),
    );
    const net = await failure(() =>
      createDeepSeekModel(KEY, 'm', { fetch: netFetch }).completeJson(request),
    );
    expect(timeout.code).toBe('timeout');
    expect(net.code).toBe('request_failed');
  });

  test('missing or empty content is bad_response', async () => {
    for (const body of [{}, { choices: [] }, { choices: [{ message: { content: '' } }] }, 'nope']) {
      const error = await failure(() => setup(200, body).model.completeJson(request));
      expect(error.code).toBe('bad_response');
    }
  });

  test('the key never appears in an error message', async () => {
    for (const status of [401, 500, 200]) {
      const error = await failure(() => setup(status, `echo ${KEY}`).model.completeJson(request));
      expect(String(error)).not.toContain(KEY);
    }
  });
});
