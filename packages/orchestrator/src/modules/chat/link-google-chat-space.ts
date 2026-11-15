import { createHash } from 'node:crypto';
import { type Language, type Message, type StandcastConfig, t } from '@standcast/core';
import {
  deleteGoogleChatConnectionIfUnused,
  deleteGoogleChatSpaceBinding,
  type MemberRow,
  operationalConfig,
  redeemGoogleChatLinkCode,
} from '@standcast/db';
import type { Deps } from '../../deps';
import { logError } from '../../log-error';
import { DomainError } from '../access/errors';
import type { MembershipCheck } from '../access/org-context';
import { requireAdmin } from '../access/require-admin';
import { MAX_GOOGLE_CHAT_SPACES } from './chat-identity';

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

export function googleChatSpaceLanguage(configs: StandcastConfig[], space: string): Language {
  const languages = new Set(
    configs.flatMap((config) =>
      config.teams
        .filter((team) => team.chat.provider === 'google-chat' && team.chat.channel === space)
        .map((team) => team.language),
    ),
  );
  const [only] = languages;
  return languages.size === 1 && only ? only : 'en';
}

function spaceLinkedMessage(org: string, language: Language): Message {
  const text = t(language, 'googleChat.spaceLinked', { org });
  return { fallbackText: text, blocks: [{ type: 'paragraph', content: [text] }] };
}

async function announceLink(
  deps: Deps,
  installationId: number,
  org: string,
  space: string,
  config: StandcastConfig | null,
): Promise<void> {
  try {
    const chat = await deps.chatFor(installationId, 'google-chat');
    const language = googleChatSpaceLanguage(config ? [config] : [], space);
    await chat?.postToChannel(space, spaceLinkedMessage(org, language));
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
    maxSpaces: MAX_GOOGLE_CHAT_SPACES,
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
  if (result.status === 'too_many_spaces') {
    throw new DomainError(
      'too_many_spaces',
      `an organization can link at most ${MAX_GOOGLE_CHAT_SPACES} google chat spaces; unlink one first`,
    );
  }
  await announceLink(
    deps,
    installation.id,
    installation.accountLogin,
    result.space.name,
    operationalConfig(installation),
  );
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
