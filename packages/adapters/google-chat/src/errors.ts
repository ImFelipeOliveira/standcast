import { ChatDeliveryError } from '@standcast/core';

export { ChatDeliveryError };

export const GOOGLE_CHAT_REQUEST_TIMEOUT_MS = 15_000;

export async function send(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(GOOGLE_CHAT_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof ChatDeliveryError) throw error;
    const name = (error as { name?: string } | null)?.name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new ChatDeliveryError('timeout', 'google request timed out');
    }
    throw new ChatDeliveryError('request_failed', 'google request failed');
  }
}

export function statusError(
  status: number,
  overrides: Record<number, string> = {},
): ChatDeliveryError {
  const code =
    overrides[status] ??
    (status === 401 ? 'invalid_auth' : status === 429 ? 'ratelimited' : 'http_error');
  return new ChatDeliveryError(code, `google returned status ${status}`);
}

export async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ChatDeliveryError('invalid_response', 'google returned invalid json');
  }
}

export async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => {});
}
