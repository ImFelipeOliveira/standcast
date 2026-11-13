import { type ChatProvider, memberOverrides } from '@standcast/core';
import {
  listMemberIdentities,
  listMemberIdsWithSession,
  listMembersByLogins,
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
export type PersonTrackerLink = {
  provider: 'linear' | 'jira';
  status: LinkStatus;
  source: LinkSource;
};

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
  const rows = await listMembersByLogins(deps.db, logins);
  const byLogin = new Map(rows.map((row) => [row.login.toLowerCase(), row]));
  const ids = rows.map((row) => row.id);
  const [identities, cli] = await Promise.all([
    listMemberIdentities(deps.db, installation.id, ids),
    listMemberIdsWithSession(deps.db, ids, 'cli'),
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
      const trackers = [
        ...new Set(related.flatMap((team) => (team.tracker ? [team.tracker.provider] : []))),
      ].sort();
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
        tracker: trackers.map((provider) => {
          if (overrides[provider]) {
            return { provider, status: 'linked' as const, source: 'config' as const };
          }
          return provider === 'linear' && hasIdentity('linear')
            ? { provider, status: 'linked' as const, source: 'identity' as const }
            : { provider, status: 'missing' as const, source: null };
        }),
        cli: row ? cli.has(row.id) : false,
      };
    }),
  };
}
