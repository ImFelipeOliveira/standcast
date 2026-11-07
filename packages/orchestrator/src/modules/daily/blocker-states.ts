import {
  dailyDateFor,
  type Item,
  localDate,
  type ResolvedTeam,
  teamsForMember,
} from '@standcast/core';
import {
  type BlockerStateRow,
  getBlockerState,
  getInstallation,
  getMemberById,
  type InstallationRow,
  type MemberRow,
  operationalConfig,
  retireMissingBlockerStates,
  setBlockerStateResolved,
  upsertBlockerState,
} from '@standcast/db';
import type { Deps } from '../../deps';
import { guarded } from '../../guarded';
import { resolveTeams } from '../../teams';
import { DomainError } from '../access/errors';
import { isInstallationAdmin } from '../access/is-installation-admin';
import type { MembershipCheck } from '../access/org-context';
import { isUuid } from '../access/pagination';
import { blockerRouteId } from '../delivery/events';

export type RecordBlockersInput = {
  installationId: number;
  memberId: string;
  date: string;
  blockers: Item[];
};

export async function recordBlockers(deps: Deps, input: RecordBlockersInput): Promise<void> {
  const unique = new Map(input.blockers.map((b) => [blockerRouteId(b), b]));
  for (const [blockerId, blocker] of unique) {
    await upsertBlockerState(deps.db, {
      installationId: input.installationId,
      authorMemberId: input.memberId,
      blockerId,
      text: blocker.text,
      ref: blocker.ref ?? null,
      date: input.date,
    });
  }
  await retireMissingBlockerStates(deps.db, {
    installationId: input.installationId,
    authorMemberId: input.memberId,
    date: input.date,
    keep: [...unique.keys()],
  });
}

export type SetBlockerResolvedInput = {
  installationId: number;
  blockerStateId: string;
  resolved: boolean;
};

const ADMIN_CHECK_TIMEOUT_MS = 3000;

async function authorTeams(
  deps: Deps,
  installation: InstallationRow,
  state: BlockerStateRow,
): Promise<ResolvedTeam[]> {
  const config = operationalConfig(installation);
  const author = await getMemberById(deps.db, state.authorMemberId);
  if (!config || !author) return [];
  const teams = await resolveTeams(deps, installation.id, installation.accountLogin, config);
  return teamsForMember(author.login, teams);
}

export async function setBlockerResolved(
  deps: Deps,
  isMember: MembershipCheck,
  member: MemberRow,
  input: SetBlockerResolvedInput,
): Promise<void> {
  const state = isUuid(input.blockerStateId)
    ? await getBlockerState(deps.db, input.installationId, input.blockerStateId)
    : null;
  const installation = state ? await getInstallation(deps.db, input.installationId) : null;
  if (!state || !installation) throw new DomainError('not_found', 'blocker not found');
  const current = await isMember(installation, member);
  if (!current) throw new DomainError('not_found', 'blocker not found');
  const teams = await authorTeams(deps, installation, state);
  const me = current.login.toLowerCase();
  const allowed =
    state.authorMemberId === current.id ||
    teams.some((team) => team.managers.some((m) => m.toLowerCase() === me)) ||
    (await guarded(
      isInstallationAdmin(deps, installation.id, current),
      false,
      ADMIN_CHECK_TIMEOUT_MS,
      'blocker resolve admin check failed',
      { installationId: String(installation.id) },
    ));
  if (!allowed) throw new DomainError('forbidden', 'you cannot change this blocker');
  const now = deps.now();
  const first = teams[0];
  const resolvedOn = first ? dailyDateFor(now, first) : localDate(now, 'UTC');
  await setBlockerStateResolved(
    deps.db,
    installation.id,
    state.id,
    input.resolved ? { at: now, by: current.id, on: resolvedOn } : null,
  );
}
