import { buildAwayNotice, type Message, teamsForMember } from '@standcast/core';
import {
  claimDelivery,
  completeDelivery,
  type DeliveryKey,
  failDelivery,
  getAwayPeriod,
  getInstallation,
  operationalConfig,
} from '@standcast/db';
import type { Deps, WorkerDeps } from '../../deps';
import { resolveMemberTeams } from '../../teams';
import { directMessageIdFor, forgetStaleChatIdentity } from '../chat/chat-identity';
import { describeDeliveryError, isTerminalDeliveryError } from '../delivery/delivery-error';

export const SEND_AWAY_NOTICE_JOB = 'send-away-notice';

export type SendAwayNoticeJob = {
  installationId: number;
  periodId: string;
  action: 'marked' | 'cancelled';
  byLogin: string;
  date: string;
};

export async function enqueueAwayNotice(deps: Deps, job: SendAwayNoticeJob): Promise<void> {
  await deps.queue.enqueue(SEND_AWAY_NOTICE_JOB, job, {
    singletonKey: `away-notice:${job.installationId}:${job.periodId}:${job.action}`,
  });
}

export async function sendAwayNotice(deps: WorkerDeps, job: SendAwayNoticeJob): Promise<void> {
  const installation = await getInstallation(deps.db, job.installationId);
  const config = operationalConfig(installation);
  if (!installation || !config) return;
  const period = await getAwayPeriod(deps.db, installation.id, job.periodId);
  if (!period) return;
  if (job.action === 'marked' && period.cancelledAt) return;
  const login = period.login;
  const [first] = teamsForMember(
    login,
    await resolveMemberTeams(deps, installation.id, installation.accountLogin, config),
  );
  if (!first) return;

  const key: DeliveryKey = {
    installationId: installation.id,
    teamName: '',
    date: job.date,
    kind: 'away_notice',
    subject: `${login}:${period.id}:${job.action}`,
  };
  const claim = await claimDelivery(deps.db, key);
  if (claim.status !== 'claimed') return;

  const provider = first.chat.provider;
  let chatUserId: string | null = null;
  try {
    const chat = await deps.chatFor(installation.id, provider);
    if (!chat) {
      await failDelivery(deps.db, key, claim.token, 'no_chat_connection');
      return;
    }
    chatUserId = await directMessageIdFor(deps, chat, installation.id, config, provider, login);
    if (!chatUserId) {
      await failDelivery(deps.db, key, claim.token, `no_chat_identity: ${login}`);
      return;
    }
    const text = buildAwayNotice(first.language, {
      by: job.byLogin,
      from: period.fromDate,
      until: period.untilDate,
      periodId: period.id,
      org: installation.accountLogin,
      action: job.action,
    });
    const message: Message = {
      fallbackText: text,
      blocks: [{ type: 'paragraph', content: [text] }],
    };
    const ref = await chat.sendDirect(chatUserId, message);
    await completeDelivery(deps.db, key, claim.token, ref);
  } catch (error) {
    await failDelivery(deps.db, key, claim.token, describeDeliveryError(error, provider));
    if (chatUserId) {
      await forgetStaleChatIdentity(
        deps,
        installation.id,
        config,
        provider,
        login,
        chatUserId,
        error,
      );
    }
    if (isTerminalDeliveryError(error)) return;
    throw error;
  }
}
