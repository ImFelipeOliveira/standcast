import {
  buildLateDaily,
  type ChatChannel,
  type ChatProvider,
  type MessageRef,
  teamsForMember,
} from '@standcast/core';
import {
  claimDelivery,
  completeDelivery,
  type DeliveryKey,
  failDelivery,
  getDelivery,
  getInstallation,
  getMemberById,
  listDailies,
  operationalConfig,
} from '@standcast/db';
import { chatUserIdFor } from '../chat-identity';
import type { WorkerDeps } from '../deps';
import { resolveTeams } from '../teams';
import { describeDeliveryError } from './delivery-error';

type LateDailyEntry = Parameters<typeof buildLateDaily>[0];

export type SendLateDailyJob = { installationId: number; memberId: string; date: string };

export async function sendLateDaily(deps: WorkerDeps, job: SendLateDailyJob): Promise<void> {
  const installation = await getInstallation(deps.db, job.installationId);
  const config = operationalConfig(installation);
  if (!installation || !config) return;
  const member = await getMemberById(deps.db, job.memberId);
  if (!member) return;
  const found = (await listDailies(deps.db, job.installationId, job.date)).find(
    (d) => d.memberId === job.memberId,
  );
  if (!found) return;
  const teams = await resolveTeams(deps, installation.id, installation.accountLogin, config);
  const chats = new Map<ChatProvider, ChatChannel | null>();
  const entries = new Map<ChatProvider, LateDailyEntry>();
  const lateDailyFor = async (provider: ChatProvider) => {
    if (!chats.has(provider)) chats.set(provider, await deps.chatFor(job.installationId, provider));
    let entry = entries.get(provider);
    if (!entry) {
      const chatUserId = await chatUserIdFor(
        deps,
        job.installationId,
        config,
        provider,
        member.login,
      );
      entry = { login: member.login, ...(chatUserId ? { chatUserId } : {}), daily: found.payload };
      entries.set(provider, entry);
    }
    return { chat: chats.get(provider) ?? null, entry };
  };

  for (const team of teamsForMember(member.login, teams)) {
    const digest = await getDelivery(deps.db, {
      installationId: job.installationId,
      teamName: team.name,
      date: job.date,
      kind: 'digest',
    });
    if (digest?.status !== 'sent' || !digest.ref) continue;
    const { chat, entry } = await lateDailyFor(team.chat.provider);
    const key: DeliveryKey = {
      installationId: job.installationId,
      teamName: team.name,
      date: job.date,
      kind: 'late_daily',
      subject: job.memberId,
    };
    const claim = await claimDelivery(deps.db, key);
    if (claim.status !== 'claimed') continue;
    if (!chat) {
      await failDelivery(deps.db, key, claim.token, 'no_chat_connection');
      continue;
    }
    let ref: MessageRef;
    try {
      ref = await chat.replyInThread(digest.ref, buildLateDaily(entry, team.language));
    } catch (error) {
      await failDelivery(deps.db, key, claim.token, describeDeliveryError(error));
      throw error;
    }
    await completeDelivery(deps.db, key, claim.token, ref);
  }
}
