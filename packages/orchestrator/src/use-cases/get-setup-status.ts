import type {
  ChannelCheck,
  ChatProvider,
  ConfigError,
  StandcastConfig,
  TeamConfig,
} from '@standcast/core';
import {
  type ApiKeySummary,
  getConnection,
  getConnectionInfo,
  listApiKeys,
  listFailedPersonDeliveryGroups,
  listFailedTeamDeliveries,
  listGoogleChatSpaces,
  listMemberInstallations,
  type MemberRow,
  operationalConfig,
  type PersonFailureGroup,
  type TeamFailure,
} from '@standcast/db';
import { isChannelLinked } from '../chat';
import type { Deps } from '../deps';
import { guarded } from '../guarded';
import { statusOf } from '../membership';
import { type TeamNotice, teamResolutionNotices } from '../teams';
import { authorizeInstallation } from './authorize-installation';
import { isInstallationAdmin } from './is-installation-admin';
import type { MembershipCheck } from './org-context';
import { loadWebhookOverview, type WebhookOverview } from './webhook-endpoints';

const TEAM_FAILURE_LIMIT = 5;
const PERSON_FAILURE_GROUP_LIMIT = 10;
const TEAM_NOTICES_TIMEOUT_MS = 3000;

export type SetupStatus = {
  installationId: number;
  owner: string;
  installations: { id: number; owner: string }[];
  login: string;
  admin: boolean;
  config:
    | { status: 'configured' }
    | { status: 'invalid'; errors: ConfigError[]; lastValid: boolean }
    | { status: 'unconfigured'; reason: string };
  accessWarning: string | null;
  configRepo: { exists: true; defaultBranch: string } | { exists: false };
  slack: { connected: false } | { connected: true; workspace: string };
  googleChat: { available: boolean; spaces: { name: string; displayName: string }[] };
  linear:
    | { connected: false }
    | { connected: true; workspace: string; urlKey: string; invalid: boolean };
  trackerNotices: TrackerNotice[];
  teamNotices: TeamNotice[];
  teams: SetupTeam[];
  configFileUrl: string | null;
  teamFailures: TeamFailure[];
  personFailures: PersonFailureGroup[];
  apiKeys: { manage: false } | { manage: true; keys: ApiKeySummary[] };
  webhooks: { manage: false } | ({ manage: true } & WebhookOverview);
  supportEmail: string;
};

export type SetupTeam = {
  name: string;
  channel: string | null;
  remindAt: string;
  digestAt: string;
  tracker: 'linear' | 'jira' | null;
};

function setupTeams(config: StandcastConfig | null): SetupTeam[] {
  return (config?.teams ?? []).map((team) => ({
    name: team.name,
    channel: team.chat.channel || null,
    remindAt: team.remindAt,
    digestAt: team.digestAt,
    tracker: team.tracker?.provider ?? null,
  }));
}

function configFileUrl(
  owner: string,
  configRepo: SetupStatus['configRepo'],
  config: SetupStatus['config'],
): string | null {
  if (!configRepo.exists || config.status === 'unconfigured') return null;
  const branch = configRepo.defaultBranch.split('/').map(encodeURIComponent).join('/');
  return `https://github.com/${encodeURIComponent(owner)}/.github/blob/${branch}/standcast.yml`;
}

export type TrackerNotice = 'linear_not_connected' | 'jira_coming_soon';

function trackerNotices(
  config: StandcastConfig | null,
  linear: SetupStatus['linear'],
): TrackerNotice[] {
  const providers = new Set(config?.teams.map((team) => team.tracker?.provider) ?? []);
  const notices: TrackerNotice[] = [];
  if (providers.has('linear') && !linear.connected) notices.push('linear_not_connected');
  if (providers.has('jira')) notices.push('jira_coming_soon');
  return notices;
}

type Octokit = Awaited<ReturnType<Deps['github']['installationOctokit']>>;

async function findConfigRepo(octokit: Octokit, owner: string): Promise<SetupStatus['configRepo']> {
  try {
    const response = await octokit.request('GET /repos/{owner}/{repo}', {
      owner,
      repo: '.github',
    });
    return { exists: true, defaultBranch: response.data.default_branch || 'main' };
  } catch (error) {
    if (statusOf(error) === 404) return { exists: false };
    throw error;
  }
}

async function safeTeamNotices(
  deps: Deps,
  installationId: number,
  owner: string,
  config: StandcastConfig | null,
): Promise<TeamNotice[]> {
  if (!config) return [];
  return guarded(
    teamResolutionNotices(deps, installationId, owner, config),
    [],
    TEAM_NOTICES_TIMEOUT_MS,
    'setup team resolution failed',
    { installationId: String(installationId) },
  );
}

const CHANNEL_NOTICES: Record<
  ChatProvider,
  Record<Exclude<ChannelCheck, 'ok'>, TeamNotice['kind']>
> = {
  slack: { not_found: 'channel_not_found', not_member: 'channel_not_member' },
  'google-chat': { not_found: 'space_not_found', not_member: 'space_not_member' },
};

async function linkedTeams(
  deps: Deps,
  installationId: number,
  provider: ChatProvider,
  teams: TeamConfig[],
): Promise<{ linked: TeamConfig[]; unlinked: TeamConfig[] }> {
  const channels = [...new Set(teams.map((team) => team.chat.channel))];
  const flags = await Promise.all(
    channels.map((channel) => isChannelLinked(deps, installationId, provider, channel)),
  );
  const linkedChannels = new Set(channels.filter((_, i) => flags[i]));
  return {
    linked: teams.filter((team) => linkedChannels.has(team.chat.channel)),
    unlinked: teams.filter((team) => !linkedChannels.has(team.chat.channel)),
  };
}

async function providerChannelNotices(
  deps: Deps,
  installationId: number,
  provider: ChatProvider,
  teams: TeamConfig[],
): Promise<TeamNotice[]> {
  if (provider === 'google-chat' && !deps.googleChatAvailable) return [];
  const { linked, unlinked } = await linkedTeams(deps, installationId, provider, teams);
  const unlinkedNotices: TeamNotice[] = unlinked.map((team) => ({
    team: team.name,
    reference: team.chat.channel,
    kind: 'space_not_linked',
  }));
  if (linked.length === 0) return unlinkedNotices;
  const chat = await deps.chatFor(installationId, provider);
  if (!chat) return unlinkedNotices;
  const channels = [...new Set(linked.map((team) => team.chat.channel))];
  const checks = await Promise.all(
    channels.map((channel) =>
      guarded<ChannelCheck | null>(
        chat.checkChannel(channel),
        null,
        TEAM_NOTICES_TIMEOUT_MS,
        'setup channel check failed',
        { installationId: String(installationId), channel },
      ),
    ),
  );
  const results = new Map<string, ChannelCheck | null>();
  channels.forEach((channel, i) => {
    results.set(channel, checks[i] ?? null);
  });
  const checked = linked.flatMap((team): TeamNotice[] => {
    const result = results.get(team.chat.channel);
    if (!result || result === 'ok') return [];
    return [
      { team: team.name, reference: team.chat.channel, kind: CHANNEL_NOTICES[provider][result] },
    ];
  });
  return [...unlinkedNotices, ...checked];
}

async function channelNotices(
  deps: Deps,
  installationId: number,
  config: StandcastConfig,
): Promise<TeamNotice[]> {
  const byProvider = new Map<ChatProvider, TeamConfig[]>();
  for (const team of config.teams) {
    if (!team.chat.channel) continue;
    byProvider.set(team.chat.provider, [...(byProvider.get(team.chat.provider) ?? []), team]);
  }
  const notices = await Promise.all(
    [...byProvider].map(([provider, teams]) =>
      providerChannelNotices(deps, installationId, provider, teams),
    ),
  );
  const order = new Map(config.teams.map((team, i) => [team.name, i]));
  return notices.flat().sort((a, b) => (order.get(a.team) ?? 0) - (order.get(b.team) ?? 0));
}

async function safeChannelNotices(
  deps: Deps,
  installationId: number,
  config: StandcastConfig | null,
): Promise<TeamNotice[]> {
  if (!config) return [];
  return guarded(
    channelNotices(deps, installationId, config),
    [],
    TEAM_NOTICES_TIMEOUT_MS * 2,
    'setup channel check failed',
    { installationId: String(installationId) },
  );
}

export async function getSetupStatus(
  deps: Deps,
  isMember: MembershipCheck,
  member: MemberRow,
  installationId: number | undefined,
): Promise<SetupStatus> {
  const { member: current, installation } = await authorizeInstallation(
    deps,
    isMember,
    member,
    installationId,
  );
  const operational = operationalConfig(installation);
  const teamNoticesPromise = safeTeamNotices(
    deps,
    installation.id,
    installation.accountLogin,
    operational,
  );
  const channelNoticesPromise = safeChannelNotices(deps, installation.id, operational);
  const octokit = await deps.github.installationOctokit(installation.id);
  const [
    configRepo,
    connection,
    linearConnection,
    teamFailures,
    personFailures,
    admin,
    linked,
    googleChatSpaces,
  ] = await Promise.all([
    findConfigRepo(octokit, installation.accountLogin),
    getConnection(deps.db, installation.id, 'slack', deps.encryptionKey),
    getConnectionInfo(deps.db, installation.id, 'linear'),
    listFailedTeamDeliveries(deps.db, installation.id, TEAM_FAILURE_LIMIT),
    listFailedPersonDeliveryGroups(deps.db, installation.id, PERSON_FAILURE_GROUP_LIMIT),
    isInstallationAdmin(deps, installation.id, current).catch(() => false),
    listMemberInstallations(deps.db, current.id),
    listGoogleChatSpaces(deps.db, installation.id),
  ]);
  const [apiKeys, webhooks]: [SetupStatus['apiKeys'], SetupStatus['webhooks']] = admin
    ? await Promise.all([
        listApiKeys(deps.db, installation.id).then((keys) => ({ manage: true as const, keys })),
        loadWebhookOverview(deps.db, installation.id).then((overview) => ({
          manage: true as const,
          ...overview,
        })),
      ])
    : [{ manage: false }, { manage: false }];
  const config: SetupStatus['config'] =
    installation.status === 'configured'
      ? { status: 'configured' }
      : installation.status === 'invalid'
        ? {
            status: 'invalid',
            errors: installation.configErrors ?? [],
            lastValid: operationalConfig(installation) !== null,
          }
        : { status: 'unconfigured', reason: installation.unconfiguredReason ?? 'no_repo' };
  const linear: SetupStatus['linear'] = linearConnection
    ? {
        connected: true,
        workspace: linearConnection.externalName ?? linearConnection.externalId,
        urlKey: linearConnection.externalKey ?? '',
        invalid: linearConnection.invalidatedAt !== null || !linearConnection.externalKey,
      }
    : { connected: false };
  const teamNotices = [...(await teamNoticesPromise), ...(await channelNoticesPromise)];
  return {
    installationId: installation.id,
    owner: installation.accountLogin,
    installations: linked
      .map((i) => ({ id: i.installationId, owner: i.accountLogin }))
      .sort((a, b) => a.owner.localeCompare(b.owner, 'en', { sensitivity: 'base' })),
    login: current.login,
    admin,
    config,
    accessWarning: installation.accessWarning,
    configRepo,
    slack: connection
      ? { connected: true, workspace: connection.externalName ?? connection.externalId }
      : { connected: false },
    googleChat: { available: deps.googleChatAvailable === true, spaces: googleChatSpaces },
    linear,
    trackerNotices: trackerNotices(operational, linear),
    teamNotices,
    teams: setupTeams(operational),
    configFileUrl: configFileUrl(installation.accountLogin, configRepo, config),
    teamFailures,
    personFailures,
    apiKeys,
    webhooks,
    supportEmail: deps.env.supportEmail,
  };
}
