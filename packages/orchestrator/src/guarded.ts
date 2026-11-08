import { logError } from './log-error';
import { withDeadline } from './with-deadline';

export function guarded<T>(
  work: Promise<T>,
  fallback: T,
  timeoutMs: number,
  label: string,
  extra: Record<string, string> = {},
): Promise<T> {
  return withDeadline(work, timeoutMs).catch((error: unknown) => {
    logError(label, error, extra);
    return fallback;
  });
}
