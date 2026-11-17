import {
  type ChatChannel,
  type Language,
  memberOverrides,
  type StandcastConfig,
  t,
} from '@standcast/core';
import {
  consumeGoogleChatSignInToken,
  findGoogleChatSignInToken,
  type GoogleChatSignInToken,
  getConnectionExternalId,
  getIdentityByLogin,
  getInstallation,
  type InstallationRow,
  listGoogleChatSpaceConfigs,
  listMemberInstallations,
  type MemberRow,
  operationalConfig,
} from '@standcast/db';
import type { Deps } from '../../deps';
import { guarded } from '../../guarded';
import { writeGoogleChatIdentity } from './google-chat-events';
import { googleChatSpaceLanguage, hashLinkCode } from './link-google-chat-space';

export type ChatLinkFailure = 'expired' | 'not_member' | 'not_connected' | 'mapped';
export type ChatLinkContext = { language: Language; login: string; org: string };
export type ChatLinkPreview =
  | (ChatLinkContext & { status: 'confirm'; account: string; replaces: boolean })
  | (ChatLinkContext & { status: ChatLinkFailure });
export type ChatLinkResult = ChatLinkContext & { status: 'linked' | ChatLinkFailure };

export const GOOGLE_CHAT_LINK_NOTICE_TIMEOUT_MS = 3000;

type LinkInput = { member: MemberRow; token: string };

type Checked =
  | { context: ChatLinkContext; failure: ChatLinkFailure }
  | { context: ChatLinkContext; failure: null; found: GoogleChatSignInToken };

function expired(member: MemberRow): Checked {
  return { context: { language: 'en', login: member.login, org: '' }, failure: 'expired' };
}

function isMapped(config: StandcastConfig, login: string, chatUserId: string): boolean {
  const own = memberOverrides(config, login).googleChat;
  if (own !== undefined && own !== chatUserId) return true;
  return Object.entries(config.members).some(
    ([key, overrides]) =>
      key.toLowerCase() !== login.toLowerCase() && overrides.googleChat === chatUserId,
  );
}

async function failureFor(
  deps: Deps,
  member: MemberRow,
  found: GoogleChatSignInToken,
  installation: InstallationRow,
): Promise<ChatLinkFailure | null> {
  const memberships = await listMemberInstallations(deps.db, member.id);
  if (!memberships.some((row) => row.installationId === installation.id)) return 'not_member';
  if (!(await getConnectionExternalId(deps.db, installation.id, 'google-chat'))) {
    return 'not_connected';
  }
  const config = operationalConfig(installation);
  if (config && isMapped(config, member.login, found.chatUserId)) return 'mapped';
  return null;
}

async function checkLink(deps: Deps, input: LinkInput): Promise<Checked> {
  const found = await findGoogleChatSignInToken(deps.db, hashLinkCode(input.token), deps.now());
  const installation = found ? await getInstallation(deps.db, found.installationId) : null;
  if (!found || !installation) return expired(input.member);
  const configs = await listGoogleChatSpaceConfigs(deps.db, found.spaceName);
  const context = {
    language: googleChatSpaceLanguage(configs, found.spaceName),
    login: input.member.login,
    org: installation.accountLogin,
  };
  const failure = await failureFor(deps, input.member, found, installation);
  return failure ? { context, failure } : { context, failure: null, found };
}

export async function previewGoogleChatSignInLink(
  deps: Deps,
  input: LinkInput,
): Promise<ChatLinkPreview> {
  const checked = await checkLink(deps, input);
  if (checked.failure) return { ...checked.context, status: checked.failure };
  const { chatUserId, chatEmail, installationId } = checked.found;
  const current = await getIdentityByLogin(
    deps.db,
    installationId,
    'google-chat',
    input.member.login,
  );
  return {
    ...checked.context,
    status: 'confirm',
    account: chatEmail ?? chatUserId,
    replaces: current !== null && current !== chatUserId,
  };
}

async function sendNotice(
  chat: ChatChannel,
  installationId: number,
  userId: string,
  text: string,
): Promise<void> {
  await guarded(
    chat.sendDirect(userId, {
      fallbackText: text,
      blocks: [{ type: 'paragraph', content: [text] }],
    }),
    undefined,
    GOOGLE_CHAT_LINK_NOTICE_TIMEOUT_MS,
    'google chat link notice failed',
    { installationId: String(installationId) },
  );
}

async function notifyLinked(
  deps: Deps,
  installationId: number,
  context: ChatLinkContext,
  chatUserId: string,
  previous: string | null,
): Promise<void> {
  const chat = await guarded(
    deps.chatFor(installationId, 'google-chat'),
    null,
    GOOGLE_CHAT_LINK_NOTICE_TIMEOUT_MS,
    'google chat link notice failed',
    { installationId: String(installationId) },
  );
  if (!chat) return;
  const { language, login, org } = context;
  await sendNotice(
    chat,
    installationId,
    chatUserId,
    t(language, 'googleChat.linked', { logins: `@${login}` }),
  );
  if (previous) {
    await sendNotice(
      chat,
      installationId,
      previous,
      t(language, 'googleChat.replaced', { login, org }),
    );
  }
}

export async function completeGoogleChatSignInLink(
  deps: Deps,
  input: LinkInput,
): Promise<ChatLinkResult> {
  const checked = await checkLink(deps, input);
  if (checked.failure) return { ...checked.context, status: checked.failure };
  const consumed = await consumeGoogleChatSignInToken(
    deps.db,
    hashLinkCode(input.token),
    deps.now(),
  );
  if (!consumed) return { ...checked.context, status: 'expired' };
  const { installationId, chatUserId } = consumed;
  const { member } = input;
  const previous = await getIdentityByLogin(deps.db, installationId, 'google-chat', member.login);
  const written = await writeGoogleChatIdentity(deps, {
    installationId,
    memberId: member.id,
    chatUserId,
    takeFromOthers: true,
  });
  if (!written) return { ...checked.context, status: 'not_connected' };
  await notifyLinked(
    deps,
    installationId,
    checked.context,
    chatUserId,
    previous !== chatUserId ? previous : null,
  );
  return { ...checked.context, status: 'linked' };
}
