import { type JwksSource, verifyChatEvent } from '@standcast/google-chat';
import { type Deps, handleGoogleChatEvent } from '@standcast/orchestrator';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import {
  enforceRateLimit,
  FAILED_AUTH_LIMIT,
  type GetClientIp,
  GOOGLE_CHAT_SPACE_LIMIT,
} from '../middleware/rate-limit';
import { WEBHOOK_BODY_LIMIT_BYTES } from './webhooks';

export type GoogleChatWebhook = { projectNumber: string; jwks: JwksSource };

const eventSchema = z.object({
  type: z.string(),
  space: z
    .object({
      name: z.string().max(200),
      type: z.string().optional(),
      spaceType: z.string().optional(),
      displayName: z.string().optional(),
      singleUserBotDm: z.boolean().optional(),
    })
    .optional(),
  user: z.object({ name: z.string(), email: z.string().optional() }).optional(),
});

const invalidBody = { error: { code: 'invalid_request', message: 'invalid body' } };

export function googleChatRoutes(
  deps: Deps,
  options: { getClientIp: GetClientIp; googleChat: GoogleChatWebhook | null },
): Hono {
  const app = new Hono();
  const { googleChat } = options;
  if (!googleChat) {
    app.post('/webhooks/google-chat', (c) => c.body(null, 404));
    return app;
  }
  app.post(
    '/webhooks/google-chat',
    bodyLimit({
      maxSize: WEBHOOK_BODY_LIMIT_BYTES,
      onError: (c) =>
        c.json({ error: { code: 'payload_too_large', message: 'payload too large' } }, 413),
    }),
    async (c) => {
      const verified = await verifyChatEvent(
        c.req.header('authorization'),
        googleChat.projectNumber,
        {
          jwks: googleChat.jwks,
          now: () => deps.now().getTime(),
        },
      );
      if (!verified) {
        await enforceRateLimit(deps, c, `authfail:ip:${options.getClientIp(c)}`, FAILED_AUTH_LIMIT);
        return c.body(null, 401);
      }
      let body: unknown;
      try {
        body = JSON.parse(await c.req.text());
      } catch {
        return c.json(invalidBody, 400);
      }
      const parsed = eventSchema.safeParse(body);
      if (!parsed.success) return c.json(invalidBody, 400);
      const { space, ...event } = parsed.data;
      if (!space) return c.json({}, 200);
      await enforceRateLimit(deps, c, `google-chat:space:${space.name}`, GOOGLE_CHAT_SPACE_LIMIT);
      const reply = await handleGoogleChatEvent(deps, { ...event, space });
      return c.json(reply ? { text: reply.text } : {}, 200);
    },
  );
  return app;
}
