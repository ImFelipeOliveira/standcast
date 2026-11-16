import { randomBytes } from 'node:crypto';
import {
  GOOGLE_CHAT_SPACE,
  GOOGLE_CHAT_USER_ID,
  type Language,
  LINK_CHAT_ACCOUNT_ACTION,
  type MessageKey,
  t,
} from '@standcast/core';
import {
  deleteGoogleChatConnectionIfUnused,
  deleteInstallationIdentities,
  findMembersByEmail,
  getConnectionExternalId,
  getLinkedGoogleChatSpaceInstallation,
  issueGoogleChatLinkCode,
  issueGoogleChatSignInToken,
  listGoogleChatSpaceConfigs,
  listMemberInstallations,
  type MemberRow,
  removeGoogleChatSpace,
  writeIdentityIfConnected,
} from '@standcast/db';
import type { Deps } from '../../deps';
import {
  generateLinkCode,
  googleChatSpaceLanguage,
  hashLinkCode,
  LINK_CODE_TTL_MS,
} from './link-google-chat-space';

export type GoogleChatEvent = {
  type: string;
  space: {
    name: string;
    type?: string;
    spaceType?: string;
    displayName?: string;
    singleUserBotDm?: boolean;
  };
  user?: { name: string; email?: string };
  action?: string;
};

export type GoogleChatReply = { text: string; privateTo?: string };

type EventDeps = Pick<Deps, 'db' | 'now' | 'env'>;

export const SIGN_IN_TOKEN_TTL_MS = 15 * 60 * 1000;

const DISPLAY_NAME_LIMIT = 200;

function isDirectMessage(space: GoogleChatEvent['space']): boolean {
  return (
    space.singleUserBotDm === true || space.type === 'DM' || space.spaceType === 'DIRECT_MESSAGE'
  );
}

function reply(
  language: Language,
  key: MessageKey,
  vars: Record<string, string> = {},
): GoogleChatReply {
  return { text: t(language, key, vars) };
}

function replyWithMapHint(language: Language, key: MessageKey, userId: string): GoogleChatReply {
  return { text: `${t(language, key)}\n${t(language, 'googleChat.mapHint', { userId })}` };
}

async function spaceLanguage(deps: EventDeps, spaceName: string): Promise<Language> {
  return googleChatSpaceLanguage(await listGoogleChatSpaceConfigs(deps.db, spaceName), spaceName);
}

async function issueLinkCode(
  deps: EventDeps,
  space: GoogleChatEvent['space'],
): Promise<GoogleChatReply> {
  const code = generateLinkCode();
  const displayName = (space.displayName?.trim() || space.name).slice(0, DISPLAY_NAME_LIMIT);
  await issueGoogleChatLinkCode(deps.db, {
    spaceName: space.name,
    displayName,
    codeHash: hashLinkCode(code),
    expiresAt: new Date(deps.now().getTime() + LINK_CODE_TTL_MS),
    now: deps.now(),
  });
  return reply(await spaceLanguage(deps, space.name), 'googleChat.linkCode', { code });
}

async function removeSpace(deps: EventDeps, spaceName: string): Promise<null> {
  const installationId = await removeGoogleChatSpace(deps.db, spaceName);
  if (installationId !== null) {
    await deleteGoogleChatConnectionIfUnused(deps.db, installationId);
  }
  return null;
}

export async function writeGoogleChatIdentity(
  deps: Pick<Deps, 'db'>,
  input: { installationId: number; memberId: string; chatUserId: string },
): Promise<boolean> {
  const connectionExternalId = await getConnectionExternalId(
    deps.db,
    input.installationId,
    'google-chat',
  );
  if (!connectionExternalId) return false;
  return writeIdentityIfConnected(deps.db, {
    installationId: input.installationId,
    memberId: input.memberId,
    provider: 'google-chat',
    connectionExternalId,
    externalId: input.chatUserId,
  });
}

export function generateSignInToken(): string {
  return randomBytes(32).toString('base64url');
}

export function signInLinkUrl(publicUrl: string, token: string): string {
  return `${publicUrl}/link/google-chat?token=${token}`;
}

async function membersWithEmail(
  deps: EventDeps,
  email: string,
  installationId: number,
): Promise<MemberRow[]> {
  try {
    const found: MemberRow[] = [];
    for (const member of await findMembersByEmail(deps.db, email)) {
      const installations = await listMemberInstallations(deps.db, member.id);
      if (installations.some((row) => row.installationId === installationId)) found.push(member);
    }
    return found;
  } catch {
    throw new Error('google chat member lookup failed');
  }
}

async function offerSignInLink(
  deps: EventDeps,
  language: Language,
  input: { installationId: number; spaceName: string; chatUserId: string; chatEmail: string },
): Promise<GoogleChatReply> {
  const token = generateSignInToken();
  await issueGoogleChatSignInToken(deps.db, {
    tokenHash: hashLinkCode(token),
    chatUserId: input.chatUserId,
    chatEmail: input.chatEmail,
    installationId: input.installationId,
    spaceName: input.spaceName,
    expiresAt: new Date(deps.now().getTime() + SIGN_IN_TOKEN_TTL_MS),
  });
  const link = `<${signInLinkUrl(deps.env.publicUrl, token)}|${t(language, 'googleChat.signInLink')}>`;
  return {
    text: [
      t(language, 'googleChat.notFound'),
      link,
      t(language, 'googleChat.mapHint', { userId: input.chatUserId }),
    ].join('\n'),
  };
}

async function linkIdentity(
  deps: EventDeps,
  space: GoogleChatEvent['space'],
  user: NonNullable<GoogleChatEvent['user']>,
  language: Language,
): Promise<GoogleChatReply> {
  const installationId = await getLinkedGoogleChatSpaceInstallation(deps.db, space.name);
  if (installationId === null) return reply(language, 'googleChat.notConnected');
  const email = user.email?.trim();
  if (!email) return reply(language, 'googleChat.notFound');
  const members = await membersWithEmail(deps, email, installationId);
  if (members.length > 1) {
    await deleteInstallationIdentities(deps.db, installationId, 'google-chat', {
      memberIds: members.map((member) => member.id),
      externalId: user.name,
    });
    return replyWithMapHint(language, 'googleChat.ambiguous', user.name);
  }
  const [member] = members;
  if (!member) {
    return offerSignInLink(deps, language, {
      installationId,
      spaceName: space.name,
      chatUserId: user.name,
      chatEmail: email,
    });
  }
  const written = await writeGoogleChatIdentity(deps, {
    installationId,
    memberId: member.id,
    chatUserId: user.name,
  });
  if (!written) return reply(language, 'googleChat.notConnected');
  return reply(language, 'googleChat.linked', { logins: `@${member.login}` });
}

async function linkFromSpace(
  deps: EventDeps,
  space: GoogleChatEvent['space'],
  user: GoogleChatEvent['user'],
): Promise<GoogleChatReply | null> {
  if (!user || !GOOGLE_CHAT_USER_ID.test(user.name)) return null;
  const language = await spaceLanguage(deps, space.name);
  return { ...(await linkIdentity(deps, space, user, language)), privateTo: user.name };
}

function asksToLink(event: GoogleChatEvent): boolean {
  if (event.type === 'MESSAGE') return true;
  return event.type === 'CARD_CLICKED' && event.action === LINK_CHAT_ACCOUNT_ACTION;
}

export async function handleGoogleChatEvent(
  deps: EventDeps,
  event: GoogleChatEvent,
): Promise<GoogleChatReply | null> {
  const space = event.space;
  if (!space || typeof space.name !== 'string' || !GOOGLE_CHAT_SPACE.test(space.name)) return null;
  if (event.type === 'REMOVED_FROM_SPACE') return removeSpace(deps, space.name);
  if (isDirectMessage(space)) {
    if (event.type !== 'MESSAGE' && event.type !== 'ADDED_TO_SPACE') return null;
    return reply('en', 'googleChat.useSpace');
  }
  if (event.type === 'ADDED_TO_SPACE') return issueLinkCode(deps, space);
  if (asksToLink(event)) return linkFromSpace(deps, space, event.user);
  return null;
}
