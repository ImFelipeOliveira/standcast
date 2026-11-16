import { type AwayPeriodRow, getMemberById, listAwayPeriods, type MemberRow } from '@standcast/db';
import type { Deps } from '../../deps';
import type { MembershipCheck } from '../access/org-context';
import { type AwayOrg, awayAccessFor, loadAwayCaller } from './away-access';

export type AwayPeriod = {
  id: string;
  login: string;
  from: string;
  until: string;
  markedBy: string;
  markedAt: string;
  mine: boolean;
};

export function toAwayPeriod(
  row: AwayPeriodRow,
  markedBy: string,
  callerLogin: string,
): AwayPeriod {
  return {
    id: row.id,
    login: row.login,
    from: row.fromDate,
    until: row.untilDate,
    markedBy: markedBy.toLowerCase(),
    markedAt: row.createdAt.toISOString(),
    mine: row.login === callerLogin,
  };
}

export async function listAway(
  deps: Deps,
  isMember: MembershipCheck,
  member: MemberRow,
  input: AwayOrg & { login?: string },
): Promise<AwayPeriod[]> {
  const caller = await loadAwayCaller(deps, isMember, member, input);
  const access = await awayAccessFor(deps, caller, input.login, 'manage');
  const rows = await listAwayPeriods(deps.db, caller.installation.id, access.login, access.today);
  const markers = new Map<string, string>();
  for (const id of new Set(rows.map((row) => row.createdBy))) {
    const marker = await getMemberById(deps.db, id);
    if (marker) markers.set(id, marker.login);
  }
  return rows.map((row) => toAwayPeriod(row, markers.get(row.createdBy) ?? '', caller.login));
}
