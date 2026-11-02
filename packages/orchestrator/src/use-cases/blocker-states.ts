import { type Item, teamsForMember } from '@standcast/core';
import {
  type BlockerStateRow,
  getBlockerState,
  getInstallation,
  getMemberById,
  type MemberRow,
  operationalConfig,
  setBlockerStateResolved,
  upsertBlockerState,
} from '@standcast/db';
import type { Deps } from '../deps';
import { blockerRouteId } from '../events';
import { resolveTeams } from '../teams';
import { DomainError } from './errors';
import { isInstallationAdmin } from './is-installation-admin';
import type { MembershipCheck } from './org-context';
import { isUuid } from './pagination';

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
}

export type SetBlockerResolvedInput = {
  installationId: number;
  blockerStateId: string;
  resolved: boolean;
};

async function managesAuthor(
  deps: Deps,
  installationId: number,
  login: string,
  state: BlockerStateRow,
): Promise<boolean> {
  const installation = await getInstallation(deps.db, installationId);
  const config = operationalConfig(installation);
  const author = await getMemberById(deps.db, state.authorMemberId);
  if (!installation || !config || !author) return false;
  const teams = await resolveTeams(deps, installationId, installation.accountLogin, config);
  const me = login.toLowerCase();
  return teamsForMember(author.login, teams).some((team) =>
    team.managers.some((m) => m.toLowerCase() === me),
  );
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
  const allowed =
    state.authorMemberId === current.id ||
    (await managesAuthor(deps, input.installationId, current.login, state)) ||
    (await isInstallationAdmin(deps, input.installationId, current));
  if (!allowed) throw new DomainError('forbidden', 'you cannot change this blocker');
  await setBlockerStateResolved(
    deps.db,
    input.installationId,
    state.id,
    input.resolved ? { at: deps.now(), by: current.id } : null,
  );
}
