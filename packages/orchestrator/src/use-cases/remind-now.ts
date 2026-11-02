import { localInstant } from '@standcast/core';
import {
  getDelivery,
  getInstallationMemberIds,
  getMemberDaily,
  MAX_DELIVERY_ATTEMPTS,
  type MemberRow,
} from '@standcast/db';
import type { Deps } from '../deps';
import { DomainError } from './errors';
import type { MembershipCheck } from './org-context';
import { digestState, loadTeamAccess } from './team-access';

export type RemindNowInput = { installationId: number; team: string; login: string };

export type RemindNowResult = 'queued' | 'already_sent' | 'too_late';

export async function remindNow(
  deps: Deps,
  isMember: MembershipCheck,
  member: MemberRow,
  input: RemindNowInput,
): Promise<RemindNowResult> {
  const access = await loadTeamAccess(deps, isMember, member, input);
  if (!access.elevated) throw new DomainError('forbidden', 'you cannot remind this team');
  const login = input.login.toLowerCase();
  if (!access.team.memberLogins.includes(login)) {
    throw new DomainError('not_found', 'person not found in this team');
  }
  const { team, date } = access;
  const installationId = access.installation.id;
  const digestAt = localInstant(date, team.digestAt, team.timezone).getTime();
  if (deps.now().getTime() >= digestAt) return 'too_late';
  if ((await digestState(deps, access)).status === 'sent') return 'too_late';
  const memberId = (await getInstallationMemberIds(deps.db, installationId, [login])).get(login);
  if (memberId && (await getMemberDaily(deps.db, installationId, memberId, date))) {
    return 'already_sent';
  }
  const reminder = await getDelivery(deps.db, {
    installationId,
    teamName: '',
    date,
    kind: 'reminder',
    subject: login,
  });
  const settled =
    reminder?.status === 'sent' ||
    (reminder?.status === 'failed' && reminder.attempts >= MAX_DELIVERY_ATTEMPTS);
  if (settled) return 'already_sent';
  await deps.queue.enqueue(
    'send-reminder',
    { installationId, login, date },
    { singletonKey: `reminder:${installationId}:${login}:${date}` },
  );
  return 'queued';
}
