import { type JwksSource, verifyAddOnEvent, verifyChatEvent } from '@standcast/google-chat';
import {
  type Deps,
  type GoogleChatEvent,
  type GoogleChatReply,
  handleGoogleChatEvent,
} from '@standcast/orchestrator';
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

export type GoogleChatWebhook = {
  projectNumber: string;
  jwks: JwksSource;
  endpointUrl: string;
  oidcJwks: JwksSource;
};

type Format = 'chat' | 'addOn';

const spaceSchema = z.object({
  name: z.string().max(200),
  type: z.string().optional(),
  spaceType: z.string().optional(),
  displayName: z.string().optional(),
  singleUserBotDm: z.boolean().optional(),
});

const userSchema = z.object({ name: z.string(), email: z.string().optional() });

const commonSchema = z
  .object({ parameters: z.record(z.string(), z.string().max(200)).optional() })
  .optional()
  .catch(undefined);

const eventSchema = z.object({
  type: z.string(),
  space: spaceSchema.optional(),
  user: userSchema.optional(),
  common: commonSchema,
});

const payloadSchema = z.object({ space: spaceSchema.optional() }).optional();

const addOnEventSchema = z.object({
  commonEventObject: commonSchema,
  chat: z.object({
    user: userSchema.optional(),
    space: spaceSchema.optional(),
    messagePayload: payloadSchema,
    addedToSpacePayload: payloadSchema,
    removedFromSpacePayload: payloadSchema,
    buttonClickedPayload: payloadSchema,
  }),
});

const ADD_ON_PAYLOADS = [
  ['addedToSpacePayload', 'ADDED_TO_SPACE'],
  ['removedFromSpacePayload', 'REMOVED_FROM_SPACE'],
  ['messagePayload', 'MESSAGE'],
  ['buttonClickedPayload', 'CARD_CLICKED'],
] as const;

function withAction(event: GoogleChatEvent, common: z.infer<typeof commonSchema>): GoogleChatEvent {
  const action = common?.parameters?.action;
  return event.type === 'CARD_CLICKED' && action ? { ...event, action } : event;
}

function parseEvent(format: Format, body: unknown): GoogleChatEvent | 'ignore' | 'invalid' {
  if (format === 'chat') {
    const parsed = eventSchema.safeParse(body);
    if (!parsed.success) return 'invalid';
    const { space, common, ...event } = parsed.data;
    return space ? withAction({ ...event, space }, common) : 'ignore';
  }
  const parsed = addOnEventSchema.safeParse(body);
  if (!parsed.success) return 'invalid';
  const { chat, commonEventObject } = parsed.data;
  const found = ADD_ON_PAYLOADS.find(([key]) => chat[key]);
  if (!found) return 'ignore';
  const [key, type] = found;
  const space = chat[key]?.space ?? chat.space;
  if (!space) return 'ignore';
  return withAction({ type, space, ...(chat.user ? { user: chat.user } : {}) }, commonEventObject);
}

async function verifiedFormat(
  googleChat: GoogleChatWebhook,
  authorization: string | undefined,
  now: () => number,
): Promise<Format | null> {
  const { projectNumber, endpointUrl } = googleChat;
  if (await verifyChatEvent(authorization, projectNumber, { jwks: googleChat.jwks, now })) {
    return 'chat';
  }
  const addOn = await verifyAddOnEvent(
    authorization,
    { projectNumber, audience: endpointUrl },
    { jwks: googleChat.oidcJwks, now },
  );
  return addOn ? 'addOn' : null;
}

function wrapReply(format: Format, reply: GoogleChatReply | null) {
  if (!reply) return {};
  const message = {
    text: reply.text,
    ...(reply.privateTo ? { privateMessageViewer: { name: reply.privateTo } } : {}),
  };
  if (format === 'chat') return message;
  return { hostAppDataAction: { chatDataAction: { createMessageAction: { message } } } };
}

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
      const format = await verifiedFormat(googleChat, c.req.header('authorization'), () =>
        deps.now().getTime(),
      );
      if (!format) {
        await enforceRateLimit(deps, c, `authfail:ip:${options.getClientIp(c)}`, FAILED_AUTH_LIMIT);
        return c.body(null, 401);
      }
      let body: unknown;
      try {
        body = JSON.parse(await c.req.text());
      } catch {
        return c.json(invalidBody, 400);
      }
      const parsed = parseEvent(format, body);
      if (parsed === 'invalid') return c.json(invalidBody, 400);
      if (parsed === 'ignore') return c.json({}, 200);
      await enforceRateLimit(
        deps,
        c,
        `google-chat:space:${parsed.space.name}`,
        GOOGLE_CHAT_SPACE_LIMIT,
      );
      const reply = await handleGoogleChatEvent(deps, parsed);
      return c.json(wrapReply(format, reply), 200);
    },
  );
  return app;
}
