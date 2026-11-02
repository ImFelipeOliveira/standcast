import { dailyDateFor, localDate, localInstant, type ResolvedTeam } from '@standcast/core';
import {
  getDelivery,
  type InstallationRow,
  MAX_DELIVERY_ATTEMPTS,
  type MemberRow,
  operationalConfig,
} from '@standcast/db';
import type { Deps } from '../deps';
import { guarded } from '../guarded';
import { resolveTeams } from '../teams';
import { authorizeInstallation } from './authorize-installation';
import { DomainError } from './errors';
import { isInstallationAdmin } from './is-installation-admin';
import type { MembershipCheck } from './org-context';

const ADMIN_CHECK_TIMEOUT_MS = 3000;

export type TeamAccess = {
  member: MemberRow;
  installation: InstallationRow;
  team: ResolvedTeam;
  date: string;
  elevated: boolean;
  belongs: boolean;
};

export async function loadTeamAccess(
  deps: Deps,
  isMember: MembershipCheck,
  member: MemberRow,
  input: { installationId: number; team: string },
): Promise<TeamAccess> {
  const { member: current, installation } = await authorizeInstallation(
    deps,
    isMember,
    member,
    input.installationId,
  );
  const config = operationalConfig(installation);
  const configured = config?.teams.find((t) => t.name === input.team);
  if (!config || !configured) throw new DomainError('not_found', 'team not found');
  const [team] = await resolveTeams(deps, installation.id, installation.accountLogin, {
    ...config,
    teams: [configured],
  });
  if (!team) throw new DomainError('not_found', 'team not found');
  const login = current.login.toLowerCase();
  const manager = team.managers.some((m) => m.toLowerCase() === login);
  const elevated =
    manager ||
    (await guarded(
      isInstallationAdmin(deps, installation.id, current),
      false,
      ADMIN_CHECK_TIMEOUT_MS,
      'team access admin check failed',
      { installationId: String(installation.id) },
    ));
  return {
    member: current,
    installation,
    team,
    date: dailyDateFor(deps.now(), team),
    elevated,
    belongs: team.memberLogins.includes(login),
  };
}

export type DigestState = { status: 'scheduled' | 'sent' | 'failed'; sentAt: Date | null };

export async function digestState(deps: Deps, access: TeamAccess): Promise<DigestState> {
  const row = await getDelivery(deps.db, {
    installationId: access.installation.id,
    teamName: access.team.name,
    date: access.date,
    kind: 'digest',
  });
  if (row?.status === 'sent') return { status: 'sent', sentAt: row.updatedAt };
  if (row?.status === 'failed' && row.attempts >= MAX_DELIVERY_ATTEMPTS) {
    return { status: 'failed', sentAt: null };
  }
  return { status: 'scheduled', sentAt: null };
}

export function remindWindowOpen(deps: Deps, access: TeamAccess): boolean {
  const { team, date } = access;
  const now = deps.now();
  if (localDate(now, team.timezone) !== date) return false;
  return now.getTime() < localInstant(date, team.digestAt, team.timezone).getTime();
}
