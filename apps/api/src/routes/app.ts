import { listMemberInstallations } from '@standcast/db';
import { csrfToken, type Deps, logoutWebSession } from '@standcast/orchestrator';
import { Hono, type MiddlewareHandler } from 'hono';
import { deleteCookie } from 'hono/cookie';
import {
  type GetClientIp,
  IP_LIMIT,
  ipRateLimit,
  subjectRateLimit,
} from '../middleware/rate-limit';
import {
  CSRF_HEADER,
  WEB_COOKIE,
  WEB_COOKIE_PATH,
  type WebSessionEnv,
  webSessionAuth,
} from '../middleware/web-session';

function appCors(appUrl: string): MiddlewareHandler {
  return async (c, next) => {
    c.header('Vary', 'Origin', { append: true });
    const allowed = c.req.header('origin') === appUrl;
    if (allowed) {
      c.header('Access-Control-Allow-Origin', appUrl);
      c.header('Access-Control-Allow-Credentials', 'true');
    }
    if (c.req.method === 'OPTIONS') {
      if (allowed) {
        c.header('Access-Control-Allow-Headers', `Content-Type, ${CSRF_HEADER}`);
        c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      }
      return c.body(null, 204);
    }
    await next();
  };
}

export function appRoutes(deps: Deps, options: { getClientIp: GetClientIp }): Hono<WebSessionEnv> {
  const app = new Hono<WebSessionEnv>();
  app.use(
    '/v1/app/*',
    appCors(deps.env.appUrl),
    ipRateLimit(deps, options.getClientIp, 'app', IP_LIMIT),
    async (c, next) => {
      c.header('Cache-Control', 'no-store');
      await next();
    },
    webSessionAuth(deps, options.getClientIp),
    subjectRateLimit<WebSessionEnv>(deps),
  );

  app.get('/v1/app/session', async (c) => {
    const member = c.get('member');
    const linked = await listMemberInstallations(deps.db, member.id);
    return c.json(
      {
        login: member.login,
        avatarUrl: `https://github.com/${member.login}.png?size=80`,
        csrf: csrfToken(deps.env.sessionSecret, c.get('sessionToken')),
        installations: linked
          .map((i) => ({ id: i.installationId, owner: i.accountLogin }))
          .sort((a, b) => a.owner.localeCompare(b.owner, 'en', { sensitivity: 'base' })),
      },
      200,
    );
  });

  app.post('/v1/app/logout', async (c) => {
    await logoutWebSession(deps, c.get('sessionToken'));
    deleteCookie(c, WEB_COOKIE, { path: WEB_COOKIE_PATH, secure: true });
    return c.body(null, 204);
  });

  return app;
}
