import { CHAT_PROVIDERS, type ChatProvider, memberOverrides } from '@standcast/core';
import {
  getConnectionExternalId,
  getInstallation,
  getMemberById,
  operationalConfig,
  writeIdentityIfConnected,
} from '@standcast/db';
import { chatOverrideFor } from './chat-identity';
import type { Deps } from './deps';
import { logError } from './log-error';

async function lookupChatUser(
  deps: Deps,
  installationId: number,
  provider: ChatProvider,
  override: string | undefined,
  email: string | null,
): Promise<string | null> {
  if (provider === 'google-chat') return override ?? null;
  const chat = await deps.chatFor(installationId, provider);
  if (!chat) return null;
  return override ?? (email ? await chat.findUserByEmail(email) : null);
}

async function linkProvider(
  deps: Deps,
  installationId: number,
  provider: ChatProvider,
  memberId: string,
  override: string | undefined,
  email: string | null,
): Promise<void> {
  const connectionExternalId = await getConnectionExternalId(deps.db, installationId, provider);
  if (!connectionExternalId) return;
  const externalId = await lookupChatUser(deps, installationId, provider, override, email);
  if (!externalId) return;
  await writeIdentityIfConnected(deps.db, {
    installationId,
    memberId,
    provider,
    connectionExternalId,
    externalId,
  });
}

export async function linkChatIdentities(
  deps: Deps,
  memberId: string,
  email: string | null,
  installationIds: number[],
): Promise<void> {
  const member = await getMemberById(deps.db, memberId);
  if (!member) return;
  const login = member.login.toLowerCase();
  for (const installationId of installationIds) {
    try {
      const installation = await getInstallation(deps.db, installationId);
      const config = operationalConfig(installation);
      if (!config) continue;
      const overrides = memberOverrides(config, login);
      for (const provider of CHAT_PROVIDERS) {
        try {
          const override = chatOverrideFor(overrides, provider);
          await linkProvider(deps, installationId, provider, memberId, override, email);
        } catch (error) {
          logError('chat identity link failed', error);
        }
      }
    } catch (error) {
      logError('chat identity link failed', error);
    }
  }
}
