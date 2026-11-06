import { createHash } from 'node:crypto';
import { type Message, t } from '@standcast/core';
import {
  deleteGoogleChatConnectionIfUnused,
  deleteGoogleChatSpaceBinding,
  type MemberRow,
  redeemGoogleChatLinkCode,
} from '@standcast/db';
import type { Deps } from '../deps';
import { logError } from '../log-error';
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

function spaceLinkedMessage(org: string): Message {
  const texts = [
    t('en', 'googleChat.spaceLinked', { org }),
    t('pt-BR', 'googleChat.spaceLinked', { org }),
  ];
  return {
    fallbackText: texts.join('\n\n'),
    blocks: texts.map((text) => ({ type: 'paragraph', content: [text] })),
  };
}

async function announceLink(
  deps: Deps,
  installationId: number,
  org: string,
  space: string,
): Promise<void> {
  try {
    const chat = await deps.chatFor(installationId, 'google-chat');
    await chat?.postToChannel(space, spaceLinkedMessage(org));
  } catch (error) {
    logError('google chat link notice failed', error, { installationId: String(installationId) });
  }
}

export async function linkGoogleChatSpace(
  deps: Deps,
  isMember: MembershipCheck,
  member: MemberRow,
  input: { installationId: number; code: string },
  guard: LinkCodeGuard = {},
): Promise<{ space: string; displayName: string }> {
  if (!deps.googleChatAvailable) {
    throw new DomainError('not_found', 'google chat is not available on this server');
  }
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
  await announceLink(deps, installation.id, installation.accountLogin, result.space.name);
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
