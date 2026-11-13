import { type ChatProvider, memberOverrides } from '@standcast/core';
import {
  getInstallationMemberIds,
  listMemberIdentities,
  listMemberIdsWithActiveCliSession,
  type MemberRow,
  operationalConfig,
} from '@standcast/db';
import type { Deps } from '../../deps';
import { resolveTeams } from '../../teams';
import type { MembershipCheck } from '../access/org-context';
import { requireAdmin } from '../access/require-admin';

export type LinkStatus = 'linked' | 'missing';
export type LinkSource = 'config' | 'identity' | null;

export type PersonChatLink = { provider: ChatProvider; status: LinkStatus; source: LinkSource };
export type PersonTrackerLink = { provider: 'linear'; status: LinkStatus; source: LinkSource };

export type PersonLinks = {
  login: string;
  teams: string[];
  managerOf: string[];
  chat: PersonChatLink[];
  tracker: PersonTrackerLink[];
  cli: boolean;
};

export type PeopleLinks = { people: PersonLinks[] };

const CHAT_OVERRIDE = { slack: 'slack', 'google-chat': 'googleChat' } as const;

function linearLink(override: boolean, identity: boolean): PersonTrackerLink {
  if (override) return { provider: 'linear', status: 'linked', source: 'config' };
  if (identity) return { provider: 'linear', status: 'linked', source: 'identity' };
  return { provider: 'linear', status: 'missing', source: null };
}

export async function getPeopleLinks(
  deps: Deps,
  isMember: MembershipCheck,
  member: MemberRow,
  installationId: number,
): Promise<PeopleLinks> {
  const { installation } = await requireAdmin(deps, isMember, member, installationId);
  const config = operationalConfig(installation);
  if (!config) return { people: [] };
  const teams = await resolveTeams(deps, installation.id, installation.accountLogin, config);
  const logins = [
    ...new Set(teams.flatMap((team) => [...team.memberLogins, ...team.managerLogins])),
  ].sort((a, b) => a.localeCompare(b));
  const memberIds = await getInstallationMemberIds(deps.db, installation.id, logins);
  const byLogin = new Map([...memberIds.entries()].map(([login, id]) => [login, { id }]));
  const ids = [...memberIds.values()];
  const [identities, cli] = await Promise.all([
    listMemberIdentities(deps.db, installation.id, ids),
    listMemberIdsWithActiveCliSession(deps.db, installation.id, ids, deps.now()),
  ]);
  const linked = new Set(identities.map((row) => `${row.memberId}:${row.provider}`));
  return {
    people: logins.map((login) => {
      const row = byLogin.get(login);
      const overrides = memberOverrides(config, login);
      const inTeams = teams.filter((team) => team.memberLogins.includes(login));
      const managed = teams.filter((team) => team.managerLogins.includes(login));
      const related = [...new Set([...inTeams, ...managed])];
      const hasIdentity = (provider: string) => (row ? linked.has(`${row.id}:${provider}`) : false);
      const providers = [...new Set(related.map((team) => team.chat.provider))].sort();
      const linear = related.some((team) => team.tracker?.provider === 'linear');
      return {
        login,
        teams: inTeams.map((team) => team.name).sort((a, b) => a.localeCompare(b)),
        managerOf: managed.map((team) => team.name).sort((a, b) => a.localeCompare(b)),
        chat: providers.map((provider) => {
          if (overrides[CHAT_OVERRIDE[provider]]) {
            return { provider, status: 'linked' as const, source: 'config' as const };
          }
          return hasIdentity(provider)
            ? { provider, status: 'linked' as const, source: 'identity' as const }
            : { provider, status: 'missing' as const, source: null };
        }),
        tracker: linear ? [linearLink(overrides.linear !== undefined, hasIdentity('linear'))] : [],
        cli: row ? cli.has(row.id) : false,
      };
    }),
  };
}
