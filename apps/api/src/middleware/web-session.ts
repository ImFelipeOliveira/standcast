import { type MemberRow, resolveSession } from '@standcast/db';
import { type Deps, DomainError, verifyCsrf } from '@standcast/orchestrator';
import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import {
  enforceRateLimit,
  FAILED_AUTH_LIMIT,
  type GetClientIp,
  type RateLimitEnv,
  SESSION_LIMIT,
} from './rate-limit';

export const WEB_COOKIE = 'sc_web';
export const WEB_COOKIE_PATH = '/';
export const WEB_SESSION_SECONDS = 7 * 24 * 60 * 60;
export const CSRF_HEADER = 'X-Standcast-CSRF';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export type WebSessionEnv = RateLimitEnv & {
  Variables: { member: MemberRow; sessionToken: string };
};

export function webSessionAuth(
  deps: Deps,
  getClientIp: GetClientIp,
): MiddlewareHandler<WebSessionEnv> {
  return async (c, next) => {
    const token = getCookie(c, WEB_COOKIE);
    const member = token ? await resolveSession(deps.db, token, 'web') : null;
    if (!token || !member) {
      await enforceRateLimit(deps, c, `authfail:ip:${getClientIp(c)}`, FAILED_AUTH_LIMIT);
      throw new DomainError('unauthorized', 'missing or invalid session');
    }
    if (UNSAFE_METHODS.has(c.req.method)) {
      if (c.req.header('origin') !== deps.env.appUrl) {
        throw new DomainError('forbidden', 'cross-origin request');
      }
      if (!verifyCsrf(deps.env.sessionSecret, token, c.req.header(CSRF_HEADER))) {
        throw new DomainError('forbidden', 'invalid csrf token');
      }
    }
    c.set('member', member);
    c.set('sessionToken', token);
    c.set('rateLimitSubject', { key: `app:member:${member.id}`, limit: SESSION_LIMIT });
    await next();
  };
}
