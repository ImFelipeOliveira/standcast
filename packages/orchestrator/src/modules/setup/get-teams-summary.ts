import { dailyDateFor } from '@standcast/core';
import { listDailies, type MemberRow, operationalConfig } from '@standcast/db';
import type { Deps } from '../../deps';
import { guarded } from '../../guarded';
import { resolveTeams } from '../../teams';
import { authorizeInstallation } from '../access/authorize-installation';
import { isInstallationAdmin } from '../access/is-installation-admin';
import type { MembershipCheck } from '../access/org-context';

const ADMIN_CHECK_TIMEOUT_MS = 3000;

export type TeamSummary = { team: string; sent: number; total: number };

export async function getTeamsSummary(
  deps: Deps,
  isMember: MembershipCheck,
  member: MemberRow,
  installationId: number,
): Promise<TeamSummary[]> {
  const { member: current, installation } = await authorizeInstallation(
    deps,
    isMember,
    member,
    installationId,
  );
  const config = operationalConfig(installation);
  if (!config) return [];
  const login = current.login.toLowerCase();
  const teams = await resolveTeams(deps, installation.id, installation.accountLogin, config);
  const own = (team: (typeof teams)[number]) =>
    team.memberLogins.includes(login) || team.managers.some((m) => m.toLowerCase() === login);
  const admin =
    !teams.every(own) &&
    (await guarded(
      isInstallationAdmin(deps, installation.id, current),
      false,
      ADMIN_CHECK_TIMEOUT_MS,
      'teams summary admin check failed',
      { installationId: String(installation.id) },
    ));
  const readable = teams.filter((team) => admin || own(team));
  const now = deps.now();
  const sentBy = new Map<string, Set<string>>();
  for (const date of new Set(readable.map((team) => dailyDateFor(now, team)))) {
    const rows = await listDailies(deps.db, installation.id, date);
    sentBy.set(date, new Set(rows.map((row) => row.login.toLowerCase())));
  }
  return readable.map((team) => {
    const sent = sentBy.get(dailyDateFor(now, team)) ?? new Set<string>();
    return {
      team: team.name,
      sent: team.memberLogins.filter((l) => sent.has(l)).length,
      total: team.memberLogins.length,
    };
  });
}
