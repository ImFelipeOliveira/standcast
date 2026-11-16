import {
  buildDailyPost,
  type ChatChannel,
  type ChatProvider,
  type MessageRef,
  postsEachDaily,
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
import type { WorkerDeps } from '../../deps';
import { resolveMemberTeams } from '../../teams';
import { isChannelLinked } from '../chat/chat';
import { chatUserIdFor } from '../chat/chat-identity';
import { describeDeliveryError, spaceNotLinked } from './delivery-error';

type DailyPostEntry = Parameters<typeof buildDailyPost>[0];

export const POST_DAILY_JOB = 'send-late-daily';

export type PostDailyJob = { installationId: number; memberId: string; date: string };

export async function postDaily(deps: WorkerDeps, job: PostDailyJob): Promise<void> {
  const installation = await getInstallation(deps.db, job.installationId);
  const config = operationalConfig(installation);
  if (!installation || !config) return;
  const member = await getMemberById(deps.db, job.memberId);
  if (!member) return;
  const found = (await listDailies(deps.db, job.installationId, job.date)).find(
    (d) => d.memberId === job.memberId,
  );
  if (!found) return;
  const teams = await resolveMemberTeams(deps, installation.id, installation.accountLogin, config);
  const chats = new Map<ChatProvider, ChatChannel | null>();
  const entries = new Map<ChatProvider, DailyPostEntry>();
  const postFor = async (provider: ChatProvider) => {
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
    const posting = postsEachDaily(team);
    const late = digest?.status === 'sent';
    const threadRef = late ? digest.ref : null;
    if (!posting && !threadRef) continue;
    const { chat, entry } = await postFor(team.chat.provider);
    const key: DeliveryKey = {
      installationId: job.installationId,
      teamName: team.name,
      date: job.date,
      kind: posting ? 'daily' : 'late_daily',
      subject: job.memberId,
    };
    const claim = await claimDelivery(deps.db, key);
    if (claim.status !== 'claimed') continue;
    if (!chat) {
      await failDelivery(deps.db, key, claim.token, 'no_chat_connection');
      continue;
    }
    let ref: MessageRef | undefined;
    try {
      const channel = threadRef && !posting ? threadRef.channel : team.chat.channel;
      if (await isChannelLinked(deps, job.installationId, team.chat.provider, channel)) {
        const msg = buildDailyPost(entry, team.language, late);
        ref =
          threadRef && !posting
            ? await chat.replyInThread(threadRef, msg)
            : await chat.postToChannel(channel, msg);
      }
    } catch (error) {
      await failDelivery(
        deps.db,
        key,
        claim.token,
        describeDeliveryError(error, team.chat.provider),
      );
      throw error;
    }
    if (!ref) {
      const reason = describeDeliveryError(spaceNotLinked(), team.chat.provider);
      await failDelivery(deps.db, key, claim.token, reason);
      continue;
    }
    await completeDelivery(deps.db, key, claim.token, ref);
  }
}
