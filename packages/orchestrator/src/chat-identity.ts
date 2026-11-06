import {
  type ChatChannel,
  ChatDeliveryError,
  type ChatProvider,
  type MemberOverrides,
  memberOverrides,
  type StandcastConfig,
} from '@standcast/core';
import { deleteIdentityByLogin, getIdentities, listGoogleChatSpaces } from '@standcast/db';
import type { Deps } from './deps';
import { logError } from './log-error';

export function chatOverrideFor(
  overrides: MemberOverrides,
  provider: ChatProvider,
): string | undefined {
  return provider === 'slack' ? overrides.slack : overrides.googleChat;
}

export async function chatUserIdsFor(
  deps: Pick<Deps, 'db'>,
  installationId: number,
  config: StandcastConfig,
  provider: ChatProvider,
  logins: string[],
): Promise<Map<string, string>> {
  const identities = await getIdentities(deps.db, installationId, provider);
  const ids = new Map<string, string>();
  for (const login of logins) {
    const lower = login.toLowerCase();
    const id = chatOverrideFor(memberOverrides(config, lower), provider) ?? identities.get(lower);
    if (id) ids.set(lower, id);
  }
  return ids;
}

export async function chatUserIdFor(
  deps: Pick<Deps, 'db'>,
  installationId: number,
  config: StandcastConfig,
  provider: ChatProvider,
  login: string,
): Promise<string | null> {
  const ids = await chatUserIdsFor(deps, installationId, config, provider, [login]);
  return ids.get(login.toLowerCase()) ?? null;
}

async function inLinkedSpace(
  chat: ChatChannel | null,
  spaces: () => Promise<string[]>,
  userId: string,
): Promise<boolean> {
  if (!chat?.isSpaceMember) return false;
  for (const space of await spaces()) {
    if (await chat.isSpaceMember(space, userId)) return true;
  }
  return false;
}

export async function directMessageIdsFor(
  deps: Pick<Deps, 'db'>,
  chat: ChatChannel | null,
  installationId: number,
  config: StandcastConfig,
  provider: ChatProvider,
  logins: string[],
): Promise<Map<string, string>> {
  if (provider !== 'google-chat') {
    return chatUserIdsFor(deps, installationId, config, provider, logins);
  }
  const identities = await getIdentities(deps.db, installationId, provider);
  let linkedSpaces: Promise<string[]> | null = null;
  const spaces = () => {
    linkedSpaces ??= listGoogleChatSpaces(deps.db, installationId).then((rows) =>
      rows.map((row) => row.name),
    );
    return linkedSpaces;
  };
  const ids = new Map<string, string>();
  for (const login of logins) {
    const lower = login.toLowerCase();
    const identity = identities.get(lower);
    const override = chatOverrideFor(memberOverrides(config, lower), provider);
    if (override === undefined || override === identity) {
      if (identity) ids.set(lower, identity);
      continue;
    }
    if (await inLinkedSpace(chat, spaces, override)) ids.set(lower, override);
  }
  return ids;
}

export async function directMessageIdFor(
  deps: Pick<Deps, 'db'>,
  chat: ChatChannel | null,
  installationId: number,
  config: StandcastConfig,
  provider: ChatProvider,
  login: string,
): Promise<string | null> {
  const ids = await directMessageIdsFor(deps, chat, installationId, config, provider, [login]);
  return ids.get(login.toLowerCase()) ?? null;
}

const STALE_CHAT_USER = new Set(['user_not_found', 'user_disabled']);

export async function forgetChatIdentity(
  deps: Pick<Deps, 'db'>,
  installationId: number,
  provider: ChatProvider,
  memberLogin: string,
  externalId: string,
): Promise<void> {
  await deleteIdentityByLogin(deps.db, installationId, provider, memberLogin, externalId);
}

export async function forgetStaleChatIdentity(
  deps: Pick<Deps, 'db'>,
  installationId: number,
  config: StandcastConfig,
  provider: ChatProvider,
  memberLogin: string,
  externalId: string,
  error: unknown,
): Promise<void> {
  if (!(error instanceof ChatDeliveryError) || !STALE_CHAT_USER.has(error.code)) return;
  const overrides = memberOverrides(config, memberLogin.toLowerCase());
  if (chatOverrideFor(overrides, provider) !== undefined) return;
  try {
    await forgetChatIdentity(deps, installationId, provider, memberLogin, externalId);
  } catch (cause) {
    logError('chat identity cleanup failed', cause, { installationId: String(installationId) });
  }
}
