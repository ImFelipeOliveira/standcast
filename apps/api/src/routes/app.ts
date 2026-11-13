import { API_KEY_SCOPES, listMemberInstallations, WEBHOOK_EVENTS } from '@standcast/db';
import {
  createInstallationApiKey,
  createMembershipCheck,
  createWebhookEndpoint,
  csrfToken,
  type Deps,
  DomainError,
  disableWebhookEndpoint,
  getEditableConfig,
  getOrgBlockers,
  getOrgContext,
  getPeopleLinks,
  getSetupStatus,
  getTeamDigest,
  getTeamHistory,
  getTeamShipped,
  getTeamsSummary,
  getTeamToday,
  linkGoogleChatSpace,
  logoutWebSession,
  redeliverWebhook,
  remindNow,
  revokeInstallationApiKey,
  searchTeamDailies,
  sendTestEvent,
  setBlockerResolved,
  unlinkGoogleChatSpace,
  validateConfigSource,
} from '@standcast/orchestrator';
import { type Context, Hono, type MiddlewareHandler } from 'hono';
import { deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import {
  type GetClientIp,
  IP_LIMIT,
  ipRateLimit,
  linkCodeGuard,
  linkCodeIpRateLimit,
  subjectRateLimit,
} from '../middleware/rate-limit';
import {
  CSRF_HEADER,
  WEB_COOKIE,
  WEB_COOKIE_PATH,
  type WebSessionEnv,
  webSessionAuth,
} from '../middleware/web-session';

const createKeyBody = z.object({
  name: z.string(),
  scopes: z.array(z.enum(API_KEY_SCOPES)),
});

const createWebhookBody = z.object({
  url: z.string(),
  events: z.array(z.enum(WEBHOOK_EVENTS)),
});

const linkSpaceBody = z.object({ code: z.string() });

const ORG = '/v1/app/orgs/:installationId';

function installationIdOf(c: Context): number {
  const raw = c.req.param('installationId') ?? '';
  return /^\d{1,15}$/.test(raw) ? Number(raw) : Number.NaN;
}

async function parseBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  const body: unknown = await c.req.json().catch(() => undefined);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new DomainError('invalid_request', 'invalid request', parsed.error.issues);
  }
  return parsed.data;
}

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
        c.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      }
      return c.body(null, 204);
    }
    await next();
  };
}

export function appRoutes(deps: Deps, options: { getClientIp: GetClientIp }): Hono<WebSessionEnv> {
  const app = new Hono<WebSessionEnv>();
  const isMember = createMembershipCheck(deps);
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

  app.get(`${ORG}/context`, async (c) =>
    c.json(await getOrgContext(deps, isMember, c.get('member'), installationIdOf(c)), 200),
  );

  app.get(`${ORG}/setup`, async (c) =>
    c.json(await getSetupStatus(deps, isMember, c.get('member'), installationIdOf(c)), 200),
  );

  app.get(`${ORG}/teams/summary`, async (c) =>
    c.json(await getTeamsSummary(deps, isMember, c.get('member'), installationIdOf(c)), 200),
  );

  app.get(`${ORG}/teams/:team/today`, async (c) =>
    c.json(
      await getTeamToday(deps, isMember, c.get('member'), {
        installationId: installationIdOf(c),
        team: c.req.param('team'),
      }),
      200,
    ),
  );

  const teamInput = (c: Context) => ({
    installationId: installationIdOf(c),
    team: c.req.param('team') ?? '',
  });
  const rangeInput = (c: Context) => {
    const from = c.req.query('from');
    const to = c.req.query('to');
    return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
  };

  app.get(`${ORG}/teams/:team/history/digests`, async (c) =>
    c.json(
      await getTeamHistory(deps, isMember, c.get('member'), { ...teamInput(c), ...rangeInput(c) }),
      200,
    ),
  );

  app.get(`${ORG}/teams/:team/history/digests/:date`, async (c) =>
    c.json(
      await getTeamDigest(deps, isMember, c.get('member'), {
        ...teamInput(c),
        date: c.req.param('date'),
      }),
      200,
    ),
  );

  app.get(`${ORG}/teams/:team/history/search`, async (c) =>
    c.json(
      await searchTeamDailies(deps, isMember, c.get('member'), {
        ...teamInput(c),
        ...rangeInput(c),
        q: c.req.query('q') ?? '',
      }),
      200,
    ),
  );

  app.get(`${ORG}/teams/:team/history/shipped`, async (c) =>
    c.json(
      await getTeamShipped(deps, isMember, c.get('member'), { ...teamInput(c), ...rangeInput(c) }),
      200,
    ),
  );

  app.get(`${ORG}/config`, async (c) =>
    c.json(await getEditableConfig(deps, isMember, c.get('member'), installationIdOf(c)), 200),
  );

  app.post(`${ORG}/config/validate`, async (c) => {
    const body: unknown = await c.req.json().catch(() => undefined);
    const source =
      typeof body === 'object' && body !== null && 'source' in body
        ? (body as { source: unknown }).source
        : undefined;
    return c.json(
      await validateConfigSource(deps, isMember, c.get('member'), installationIdOf(c), source),
      200,
    );
  });

  app.get(`${ORG}/people`, async (c) =>
    c.json(await getPeopleLinks(deps, isMember, c.get('member'), installationIdOf(c)), 200),
  );

  app.post(`${ORG}/webhooks/deliveries/:deliveryId/redeliver`, async (c) => {
    await redeliverWebhook(
      deps,
      isMember,
      c.get('member'),
      installationIdOf(c),
      c.req.param('deliveryId'),
    );
    return c.body(null, 204);
  });

  app.get(`${ORG}/blockers`, async (c) => {
    const team = c.req.query('team');
    return c.json(
      await getOrgBlockers(deps, isMember, c.get('member'), {
        installationId: installationIdOf(c),
        ...(team ? { team } : {}),
      }),
      200,
    );
  });

  for (const [action, resolved] of [
    ['resolve', true],
    ['reopen', false],
  ] as const) {
    app.post(`${ORG}/blockers/:blockerStateId/${action}`, async (c) => {
      await setBlockerResolved(deps, isMember, c.get('member'), {
        installationId: installationIdOf(c),
        blockerStateId: c.req.param('blockerStateId'),
        resolved,
      });
      return c.body(null, 204);
    });
  }

  app.post(`${ORG}/teams/:team/remind/:login`, async (c) => {
    const result = await remindNow(deps, isMember, c.get('member'), {
      installationId: installationIdOf(c),
      team: c.req.param('team'),
      login: c.req.param('login'),
    });
    return c.json({ result }, 202);
  });

  app.post(`${ORG}/api-keys`, async (c) => {
    const { name, scopes } = await parseBody(c, createKeyBody);
    const created = await createInstallationApiKey(deps, isMember, c.get('member'), {
      installationId: installationIdOf(c),
      name,
      scopes,
    });
    return c.json({ key: created.summary, secret: created.key }, 201);
  });

  app.post(`${ORG}/api-keys/:keyId/revoke`, async (c) => {
    await revokeInstallationApiKey(
      deps,
      isMember,
      c.get('member'),
      installationIdOf(c),
      c.req.param('keyId'),
    );
    return c.body(null, 204);
  });

  app.post(`${ORG}/webhooks`, async (c) => {
    const { url, events } = await parseBody(c, createWebhookBody);
    const created = await createWebhookEndpoint(deps, isMember, c.get('member'), {
      installationId: installationIdOf(c),
      url,
      events,
    });
    return c.json({ endpoint: created.endpoint, secret: created.secret }, 201);
  });

  app.post(`${ORG}/webhooks/:endpointId/disable`, async (c) => {
    await disableWebhookEndpoint(
      deps,
      isMember,
      c.get('member'),
      installationIdOf(c),
      c.req.param('endpointId'),
    );
    return c.body(null, 204);
  });

  app.post(`${ORG}/webhooks/:endpointId/test`, async (c) => {
    await sendTestEvent(
      deps,
      isMember,
      c.get('member'),
      installationIdOf(c),
      c.req.param('endpointId'),
    );
    return c.body(null, 202);
  });

  app.post(
    `${ORG}/google-chat/spaces`,
    linkCodeIpRateLimit(deps, options.getClientIp),
    async (c) => {
      const { code } = await parseBody(c, linkSpaceBody);
      const linked = await linkGoogleChatSpace(
        deps,
        isMember,
        c.get('member'),
        { installationId: installationIdOf(c), code },
        linkCodeGuard(deps, c),
      );
      return c.json({ space: linked.space, displayName: linked.displayName }, 201);
    },
  );

  app.delete(`${ORG}/google-chat/spaces/:space`, async (c) => {
    await unlinkGoogleChatSpace(deps, isMember, c.get('member'), {
      installationId: installationIdOf(c),
      space: c.req.param('space'),
    });
    return c.body(null, 204);
  });

  return app;
}
