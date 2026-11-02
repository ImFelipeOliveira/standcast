import { logError } from './log-error';

export async function guarded<T>(
  work: Promise<T>,
  fallback: T,
  timeoutMs: number,
  label: string,
  extra: Record<string, string> = {},
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      logError(label, new Error(`timed out after ${timeoutMs}ms`), extra);
      resolve(fallback);
    }, timeoutMs);
  });
  const settled = work.catch((error: unknown) => {
    logError(label, error, extra);
    return fallback;
  });
  try {
    return await Promise.race([settled, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
