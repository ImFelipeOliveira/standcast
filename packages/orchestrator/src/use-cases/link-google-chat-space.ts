import { createHash } from 'node:crypto';
import {
  deleteGoogleChatConnectionIfUnused,
  deleteGoogleChatSpaceBinding,
  type MemberRow,
  redeemGoogleChatLinkCode,
} from '@standcast/db';
import type { Deps } from '../deps';
import { DomainError } from './errors';
import type { MembershipCheck } from './org-context';
import { requireAdmin } from './require-admin';

export const LINK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const LINK_CODE_LENGTH = 8;
export const LINK_CODE_TTL_MS = 24 * 60 * 60 * 1000;
export const GOOGLE_CHAT_CONNECTION_SECRET = 'google-chat-app';

export type LinkCodeGuard = { beforeRedeem?: (installationId: number) => Promise<void> };

export function generateLinkCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(LINK_CODE_LENGTH));
  return Array.from(bytes, (byte) => LINK_CODE_ALPHABET[byte % LINK_CODE_ALPHABET.length]).join('');
}

export function hashLinkCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

const SPACE_NAME = /^spaces\/[A-Za-z0-9_-]{1,128}$/;

const LINK_CODE = new RegExp(`^[${LINK_CODE_ALPHABET}]{${LINK_CODE_LENGTH}}$`);

function normalizeLinkCode(code: string): string | null {
  const normalized = code.replace(/[\s-]/g, '').toUpperCase();
  return LINK_CODE.test(normalized) ? normalized : null;
}

export async function linkGoogleChatSpace(
  deps: Deps,
  isMember: MembershipCheck,
  member: MemberRow,
  input: { installationId: number; code: string },
  guard: LinkCodeGuard = {},
): Promise<{ space: string; displayName: string }> {
  const { installation } = await requireAdmin(deps, isMember, member, input.installationId);
  await guard.beforeRedeem?.(installation.id);
  const code = normalizeLinkCode(input.code);
  if (!code) throw new DomainError('invalid_code', 'the link code is invalid or expired');
  const result = await redeemGoogleChatLinkCode(deps.db, {
    codeHash: hashLinkCode(code),
    installationId: installation.id,
    now: deps.now(),
    connection: { secret: GOOGLE_CHAT_CONNECTION_SECRET, key: deps.encryptionKey },
  });
  if (result.status === 'invalid') {
    throw new DomainError('invalid_code', 'the link code is invalid or expired');
  }
  if (result.status === 'linked_elsewhere') {
    throw new DomainError(
      'space_already_linked',
      'this space is linked to another organization; an admin there must unlink it first',
    );
  }
  return { space: result.space.name, displayName: result.space.displayName };
}

export async function unlinkGoogleChatSpace(
  deps: Deps,
  isMember: MembershipCheck,
  member: MemberRow,
  input: { installationId: number; space: string },
): Promise<void> {
  const { installation } = await requireAdmin(deps, isMember, member, input.installationId);
  if (
    !SPACE_NAME.test(input.space) ||
    !(await deleteGoogleChatSpaceBinding(deps.db, installation.id, input.space))
  ) {
    throw new DomainError('not_found', 'space not linked to this organization');
  }
  await deleteGoogleChatConnectionIfUnused(deps.db, installation.id);
}
