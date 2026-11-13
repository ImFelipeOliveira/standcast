import { type MemberRow, redeliverWebhookDelivery } from '@standcast/db';
import type { Deps } from '../../deps';
import { DomainError } from '../access/errors';
import type { MembershipCheck } from '../access/org-context';
import { isUuid } from '../access/pagination';
import { requireAdmin } from '../access/require-admin';
import { DELIVER_WEBHOOK_JOB } from '../delivery/emit-event';

export async function redeliverWebhook(
  deps: Deps,
  isMember: MembershipCheck,
  member: MemberRow,
  installationId: number,
  deliveryId: string,
): Promise<void> {
  await requireAdmin(deps, isMember, member, installationId);
  if (
    !isUuid(deliveryId) ||
    !(await redeliverWebhookDelivery(deps.db, installationId, deliveryId, deps.now()))
  ) {
    throw new DomainError('not_found', 'failed webhook delivery not found');
  }
  await deps.queue.enqueue(DELIVER_WEBHOOK_JOB, { deliveryId });
}
