import { buildProductionReportItem, type MessageRef } from '@standcast/core';
import {
  claimDelivery,
  completeDelivery,
  type DeliveryKey,
  failDelivery,
  getInstallation,
  getProductionReport,
  operationalConfig,
} from '@standcast/db';
import type { WorkerDeps } from '../../deps';
import { describeDeliveryError } from '../delivery/delivery-error';
import type { SendProductionReportJob } from './send-production-report';

export const POST_REPORT_ITEM_JOB = 'post-report-item';

export type PostReportItemJob = SendProductionReportJob & { index: number; thread: MessageRef };

export async function postReportItem(deps: WorkerDeps, job: PostReportItemJob): Promise<void> {
  const config = operationalConfig(await getInstallation(deps.db, job.installationId));
  const team = config?.teams.find((t) => t.name === job.teamName);
  const report = await getProductionReport(deps.db, job.installationId, job.teamName, job.date);
  const item = report?.items[job.index];
  if (!team || !item) return;

  const key: DeliveryKey = {
    installationId: job.installationId,
    teamName: job.teamName,
    date: job.date,
    kind: 'production_report_item',
    subject: String(job.index),
  };
  const claim = await claimDelivery(deps.db, key);
  if (claim.status !== 'claimed') return;
  const provider = team.chat.provider;
  try {
    const chat = await deps.chatFor(job.installationId, provider);
    if (!chat) {
      await failDelivery(deps.db, key, claim.token, 'no_chat_connection');
      return;
    }
    const ref = await chat.replyInThread(
      job.thread,
      buildProductionReportItem({ lang: team.language, timezone: team.timezone, item }),
    );
    await completeDelivery(deps.db, key, claim.token, ref);
  } catch (error) {
    await failDelivery(deps.db, key, claim.token, describeDeliveryError(error, provider));
    throw error;
  }
}
