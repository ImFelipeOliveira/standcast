import { validateAwayPeriod } from '@standcast/core';
import { createAwayPeriod, type MemberRow } from '@standcast/db';
import type { Deps } from '../../deps';
import { DomainError } from '../access/errors';
import type { MembershipCheck } from '../access/org-context';
import { awayAccessFor, loadAwayCaller } from './away-access';
import { type AwayPeriod, toAwayPeriod } from './list-away';
import { enqueueAwayNotice } from './send-away-notice';

export type MarkAwayInput = {
  installationId: number;
  login?: string;
  from?: string;
  until: string;
};

export async function markAway(
  deps: Deps,
  isMember: MembershipCheck,
  member: MemberRow,
  input: MarkAwayInput,
): Promise<AwayPeriod> {
  const caller = await loadAwayCaller(deps, isMember, member, input.installationId);
  const access = await awayAccessFor(deps, caller, input.login, 'mark');
  const from = input.from ?? access.today;
  if (validateAwayPeriod({ from, until: input.until, today: access.today }) !== 'ok') {
    throw new DomainError('invalid_away_period', 'the away period is not valid');
  }
  const row = await createAwayPeriod(deps.db, {
    installationId: caller.installation.id,
    login: access.login,
    from,
    until: input.until,
    createdBy: caller.member.id,
  });
  if (row === 'overlap') {
    throw new DomainError('away_overlap', 'the person is already away on some of these days');
  }
  if (!access.self) {
    await enqueueAwayNotice(deps, {
      installationId: caller.installation.id,
      periodId: row.id,
      action: 'marked',
      byLogin: caller.login,
      date: access.today,
    });
  }
  return toAwayPeriod(row, caller.login, caller.login);
}
