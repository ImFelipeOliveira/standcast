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

const MAX_MEMBERSHIP_SPACES = 10;
const MEMBERSHIP_BUDGET_MS = 20_000;

type Membership = 'member' | 'not_member' | 'timeout';

export type DirectMessageTargets = { ids: Map<string, string>; timedOut: Set<string> };

function isTimeout(error: unknown): boolean {
  return error instanceof ChatDeliveryError && error.code === 'timeout';
}

export function membershipTimeout(): ChatDeliveryError {
  return new ChatDeliveryError('timeout', 'google chat membership check timed out');
}

function anyConfirmed(checks: Promise<boolean>[]): Promise<Membership> {
  return new Promise((resolve) => {
    let pending = checks.length;
    let timedOut = false;
    const timer = setTimeout(() => resolve('timeout'), MEMBERSHIP_BUDGET_MS);
    const settle = (member: boolean) => {
      pending -= 1;
      if (!member && pending > 0) return;
      clearTimeout(timer);
      if (member) resolve('member');
      else resolve(timedOut ? 'timeout' : 'not_member');
    };
    for (const check of checks) {
      check.then(settle, (error: unknown) => {
        logError('google chat membership check failed', error);
        if (isTimeout(error)) timedOut = true;
        settle(false);
      });
    }
  });
}

async function inLinkedSpace(
  chat: ChatChannel | null,
  spaces: () => Promise<string[]>,
  userId: string,
): Promise<Membership> {
  if (!chat?.isSpaceMember) return 'not_member';
  const names = (await spaces()).slice(0, MAX_MEMBERSHIP_SPACES);
  if (names.length === 0) return 'not_member';
  return anyConfirmed(
    names.map(async (space) => (await chat.isSpaceMember?.(space, userId)) === true),
  );
}

export async function directMessageIdsFor(
  deps: Pick<Deps, 'db'>,
  chat: ChatChannel | null,
  installationId: number,
  config: StandcastConfig,
  provider: ChatProvider,
  logins: string[],
): Promise<DirectMessageTargets> {
  const timedOut = new Set<string>();
  if (provider !== 'google-chat') {
    return { ids: await chatUserIdsFor(deps, installationId, config, provider, logins), timedOut };
  }
  const identities = await getIdentities(deps.db, installationId, provider);
  let linkedSpaces: Promise<string[]> | null = null;
  const spaces = () => {
    linkedSpaces ??= listGoogleChatSpaces(deps.db, installationId).then((rows) =>
      rows.map((row) => row.name),
    );
    return linkedSpaces;
  };
  const verified = new Map<string, Promise<Membership>>();
  const membership = (userId: string) => {
    let check = verified.get(userId);
    if (!check) {
      check = inLinkedSpace(chat, spaces, userId);
      verified.set(userId, check);
    }
    return check;
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
    const result = await membership(override);
    if (result === 'member') ids.set(lower, override);
    if (result === 'timeout') timedOut.add(lower);
  }
  return { ids, timedOut };
}

export async function directMessageIdFor(
  deps: Pick<Deps, 'db'>,
  chat: ChatChannel | null,
  installationId: number,
  config: StandcastConfig,
  provider: ChatProvider,
  login: string,
): Promise<string | null> {
  const { ids, timedOut } = await directMessageIdsFor(
    deps,
    chat,
    installationId,
    config,
    provider,
    [login],
  );
  const lower = login.toLowerCase();
  if (timedOut.has(lower)) throw membershipTimeout();
  return ids.get(lower) ?? null;
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
