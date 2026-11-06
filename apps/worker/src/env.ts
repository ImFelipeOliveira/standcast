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
    STANDCAST_ENCRYPTION_KEY: z
      .string()
      .transform((v) => Buffer.from(v, 'base64'))
      .refine((b) => b.length === 32, 'must be 32 bytes, base64'),
    GITHUB_APP_ID: z.string().min(1),
    GITHUB_APP_PRIVATE_KEY: z.string().min(1),
    GITHUB_WEBHOOK_SECRET: z.string().min(1),
    GITHUB_CLIENT_ID: z.string().min(1),
    GITHUB_CLIENT_SECRET: z.string().min(1),
    LINEAR_CLIENT_ID: z.string().min(1),
    LINEAR_CLIENT_SECRET: z.string().min(1),
    SUPPORT_EMAIL: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    BETA_EMAIL_FROM: z.string().optional(),
    GOOGLE_CHAT_SERVICE_ACCOUNT: googleChatServiceAccount,
  })
  .superRefine((value, ctx) => {
    if (value.RESEND_API_KEY && !value.BETA_EMAIL_FROM) {
      ctx.addIssue({
        code: 'custom',
        path: ['BETA_EMAIL_FROM'],
        message: 'required when RESEND_API_KEY is set',
      });
    }
    if (value.RESEND_API_KEY && !value.SUPPORT_EMAIL) {
      ctx.addIssue({
        code: 'custom',
        path: ['SUPPORT_EMAIL'],
        message: 'required when RESEND_API_KEY is set',
      });
    }
  });

export type Env = z.output<typeof schema>;

export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  return schema.parse(source);
}
