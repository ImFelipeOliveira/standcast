import { cancelAwayPeriod, getAwayPeriod, type MemberRow } from '@standcast/db';
import type { Deps } from '../../deps';
import { DomainError } from '../access/errors';
import type { MembershipCheck } from '../access/org-context';
import { awayAccessFor, loadAwayCaller } from './away-access';
import { enqueueAwayNotice } from './send-away-notice';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function cancelAway(
  deps: Deps,
  isMember: MembershipCheck,
  member: MemberRow,
  input: { installationId: number; periodId: string },
): Promise<void> {
  const caller = await loadAwayCaller(deps, isMember, member, input.installationId);
  const notFound = () => new DomainError('not_found', 'away period not found');
  if (!UUID.test(input.periodId)) throw notFound();
  const period = await getAwayPeriod(deps.db, caller.installation.id, input.periodId);
  if (!period || period.cancelledAt) throw notFound();
  const access = await awayAccessFor(deps, caller, period.login, 'manage');
  const cancelled = await cancelAwayPeriod(deps.db, {
    installationId: caller.installation.id,
    id: period.id,
    cancelledBy: caller.member.id,
  });
  if (!cancelled) throw notFound();
  if (!access.self) {
    await enqueueAwayNotice(deps, {
      installationId: caller.installation.id,
      periodId: period.id,
      action: 'cancelled',
      byLogin: caller.login,
    });
  }
}
