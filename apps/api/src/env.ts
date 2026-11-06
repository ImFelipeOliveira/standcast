import { parseServiceAccount } from '@standcast/google-chat';
import { z } from 'zod';

const googleChatServiceAccount = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (!value) return undefined;
    try {
      return parseServiceAccount(value);
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: 'must be a base64 encoded service account JSON key',
      });
      return z.NEVER;
    }
  });

const schema = z
  .object({
    DATABASE_URL: z.string().min(1),
    PORT: z.coerce.number().int().positive().default(3000),
    PUBLIC_URL: z.url().transform((url) => url.replace(/\/+$/, '')),
    SUPPORT_EMAIL: z.string().min(1),
    DOCS_URL: z
      .url({ protocol: /^https$/ })
      .refine((url) => !url.endsWith('/'), 'must not end with a slash')
      .default('https://docs.standcast.app'),
    LANDING_URL: z
      .url({ protocol: /^https$/ })
      .refine((url) => !url.endsWith('/'), 'must not end with a slash')
      .default('https://standcast.usefachada.dev'),
    APP_URL: z
      .string()
      .refine(
        (url) => url.startsWith('https://') || /^http:\/\/localhost(:\d+)?$/.test(url),
        'must be https, or http://localhost with an optional port',
      )
      .refine(
        (url) => URL.canParse(url) && new URL(url).origin === url,
        'must be an exact origin: lowercase host, no path, query, trailing slash or default port',
      ),
    TRUST_PROXY: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(1).default(1),
    STANDCAST_ENCRYPTION_KEY: z
      .string()
      .transform((v) => Buffer.from(v, 'base64'))
      .refine((b) => b.length === 32, 'must be 32 bytes, base64'),
    GITHUB_APP_ID: z.string().min(1),
    GITHUB_APP_PRIVATE_KEY: z.string().min(1),
    GITHUB_WEBHOOK_SECRET: z.string().min(1),
    GITHUB_CLIENT_ID: z.string().min(1),
    GITHUB_CLIENT_SECRET: z.string().min(1),
    SESSION_SECRET: z.string().min(16),
    SLACK_CLIENT_ID: z.string().min(1),
    SLACK_CLIENT_SECRET: z.string().min(1),
    LINEAR_CLIENT_ID: z.string().min(1),
    LINEAR_CLIENT_SECRET: z.string().min(1),
    GOOGLE_CHAT_SERVICE_ACCOUNT: googleChatServiceAccount,
    GOOGLE_CHAT_PROJECT_NUMBER: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().regex(/^\d+$/, 'must be the numeric Google Cloud project number').optional(),
    ),
  })
  .superRefine((env, ctx) => {
    if (env.GOOGLE_CHAT_SERVICE_ACCOUNT && !env.GOOGLE_CHAT_PROJECT_NUMBER) {
      ctx.addIssue({
        code: 'custom',
        path: ['GOOGLE_CHAT_PROJECT_NUMBER'],
        message: 'is required when GOOGLE_CHAT_SERVICE_ACCOUNT is set',
      });
    }
  });

export type Env = z.output<typeof schema>;

export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  return schema.parse(source);
}
