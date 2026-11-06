import type { Deps } from '@standcast/orchestrator';
import { Hono } from 'hono';
import { onError } from './http/errors';
import type { GetClientIp } from './middleware/rate-limit';
import { appRoutes } from './routes/app';
import { betaRoutes } from './routes/beta';
import { docsRoutes } from './routes/docs';
import { type GoogleChatWebhook, googleChatRoutes } from './routes/google-chat';
import { publicRoutes } from './routes/public';
import { v1Routes } from './routes/v1';
import { webRoutes } from './routes/web';
import { webhookRoutes } from './routes/webhooks';

export type AppOptions = {
  getClientIp: GetClientIp;
  healthTimeoutMs?: number;
  googleChat?: GoogleChatWebhook | null;
};

export function createApp(deps: Deps, options: AppOptions): Hono {
  const app = new Hono();
  const publicApi = publicRoutes(deps, {
    getClientIp: options.getClientIp,
    healthTimeoutMs: options.healthTimeoutMs,
  });
  const internalApi = v1Routes(deps, { getClientIp: options.getClientIp });
  app.onError(onError);
  app.route('/', appRoutes(deps, { getClientIp: options.getClientIp }));
  app.route('/', internalApi);
  app.route('/', publicApi);
  app.route(
    '/',
    docsRoutes(deps, { public: publicApi, internal: internalApi }, options.getClientIp),
  );
  app.route('/', betaRoutes(deps, { getClientIp: options.getClientIp }));
  app.route('/webhooks', webhookRoutes(deps));
  app.route(
    '/',
    googleChatRoutes(deps, {
      getClientIp: options.getClientIp,
      googleChat: options.googleChat ?? null,
    }),
  );
  app.route('/', webRoutes(deps, { getClientIp: options.getClientIp }));
  return app;
}
