import { GitHubRateLimitError } from '@standcast/github';
import { LinearAuthError, LinearRateLimitError } from '@standcast/linear';
import { logError } from '../../log-error';
import type { OrgContext } from '../access/org-context';

export const DRAFT_WARNING_SOURCES = [
  'github_activity',
  'github_pending',
  'github_plan',
  'linear_activity',
  'linear_pending',
  'linear_plan',
] as const;

export type DraftWarningSource = (typeof DRAFT_WARNING_SOURCES)[number];
export type DraftWarning = { source: DraftWarningSource; code: string };
export type DraftWarn = (warning: DraftWarning) => void;

const TIMEOUT_NAMES = new Set(['AbortError', 'TimeoutError']);

function nameOf(error: unknown): unknown {
  return typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : null;
}

function isTimeout(error: unknown): boolean {
  if (TIMEOUT_NAMES.has(String(nameOf(error)))) return true;
  const cause =
    typeof error === 'object' && error !== null ? (error as { cause?: unknown }).cause : null;
  return TIMEOUT_NAMES.has(String(nameOf(cause)));
}

export function warningCode(error: unknown): string {
  if (error instanceof GitHubRateLimitError || error instanceof LinearRateLimitError) {
    return 'rate_limited';
  }
  if (error instanceof LinearAuthError) return 'auth';
  if (isTimeout(error)) return 'timeout';
  return 'unavailable';
}

export async function fromSource<T>(
  source: DraftWarningSource,
  ctx: OrgContext,
  warn: DraftWarn,
  fallback: T,
  call: () => Promise<T>,
): Promise<T> {
  try {
    return await call();
  } catch (error) {
    const code = warningCode(error);
    logError(
      'draft source failed',
      { name: 'DraftSourceError', code },
      { installationId: String(ctx.installationId), source },
    );
    warn({ source, code });
    return fallback;
  }
}

export function sortWarnings(warnings: DraftWarning[]): DraftWarning[] {
  const order = (warning: DraftWarning) => DRAFT_WARNING_SOURCES.indexOf(warning.source);
  return [...warnings].sort((a, b) => order(a) - order(b));
}
