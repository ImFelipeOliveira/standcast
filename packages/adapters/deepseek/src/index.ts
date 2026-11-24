import { type TextModel, TextModelError } from '@standcast/core';

export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
export const DEEPSEEK_TIMEOUT_MS = 60_000;
export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-chat';

export type DeepSeekOptions = {
  fetch?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
};

export function createDeepSeekModel(
  apiKey: string,
  model: string,
  opts: DeepSeekOptions = {},
): TextModel {
  return {
    async completeJson({ system, user }) {
      const fetchImpl = opts.fetch ?? fetch;
      let response: Response;
      try {
        response = await fetchImpl(`${opts.baseUrl ?? DEEPSEEK_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            stream: false,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
          signal: AbortSignal.timeout(opts.timeoutMs ?? DEEPSEEK_TIMEOUT_MS),
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'TimeoutError') {
          throw new TextModelError('timeout', 'text model request timed out');
        }
        throw new TextModelError('request_failed', 'text model request failed');
      }
      if (response.status === 401 || response.status === 403) {
        await response.body?.cancel().catch(() => {});
        throw new TextModelError(
          'rejected_key',
          `text model rejected the key (${response.status})`,
        );
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw new TextModelError('http_error', `text model returned status ${response.status}`);
      }
      let content: unknown;
      try {
        const json = (await response.json()) as {
          choices?: { message?: { content?: unknown } }[];
        };
        content = json.choices?.[0]?.message?.content;
      } catch {
        throw new TextModelError('bad_response', 'text model returned an unreadable response');
      }
      if (typeof content !== 'string' || content.length === 0) {
        throw new TextModelError('bad_response', 'text model returned no content');
      }
      return content;
    },
  };
}
