import {
  type ChannelCheck,
  type ChatProvider,
  GOOGLE_CHAT_SPACE,
  LLM_PROVIDERS,
  type LlmProvider,
  managesTeam,
  type Weekday,
} from '@standcast/core';
import {
  deleteLlmSettings,
  deleteTeamReport,
  getLlmSettings,
  getTeamReport,
  listTeamReports,
  type MemberRow,
  operationalConfig,
  type TeamReportRow,
  upsertLlmSettings,
  upsertTeamReport,
} from '@standcast/db';
import type { Deps } from '../../deps';
import { guarded } from '../../guarded';
import { resolveTeams } from '../../teams';
import { authorizeInstallation } from '../access/authorize-installation';
import { DomainError } from '../access/errors';
import { isInstallationAdmin } from '../access/is-installation-admin';
import type { MembershipCheck } from '../access/org-context';
import { requireAdmin } from '../access/require-admin';
import { loadTeamAccess } from '../access/team-access';
import { isChannelLinked } from '../chat/chat';

const ADMIN_CHECK_TIMEOUT_MS = 3000;
const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export type LlmSettingsView =
  | { manage: false }
  | {
      manage: true;
      settings: {
        provider: LlmProvider;
        model: string;
        keyLast4: string;
        rejected: boolean;
      } | null;
    };

export type TeamReportView = {
  team: string;
  provider: ChatProvider;
  editable: boolean;
  report: Omit<TeamReportRow, 'installationId' | 'teamName' | 'cutoffAt'> | null;
};

export type ReportSettings = {
  llm: LlmSettingsView;
  teams: TeamReportView[];
  orphans: string[];
};

export type SaveLlmSettingsInput = {
  installationId: number;
  provider: LlmProvider;
  model: string;
  apiKey?: string;
};

export type SaveTeamReportInput = {
  installationId: number;
  team: string;
  enabled: boolean;
  channel: string;
  weekday: Weekday;
  time: string;
  productionBranch: string;
};

const invalid = (message: string) => new DomainError('invalid_request', message);

function reportView(row: TeamReportRow | undefined | null): TeamReportView['report'] {
  if (!row) return null;
  const { enabled, channel, weekday, time, productionBranch } = row;
  return { enabled, channel, weekday, time, productionBranch };
}

async function llmView(deps: Deps, installationId: number): Promise<LlmSettingsView> {
  const row = await getLlmSettings(deps.db, installationId);
  return {
    manage: true,
    settings: row
      ? {
          provider: row.provider,
          model: row.model,
          keyLast4: row.keyLast4,
          rejected: row.rejectedAt !== null,
        }
      : null,
  };
}

export async function getReportSettings(
  deps: Deps,
  isMember: MembershipCheck,
  member: MemberRow,
  installationId: number,
): Promise<ReportSettings> {
  const { member: current, installation } = await authorizeInstallation(
    deps,
    isMember,
    member,
    installationId,
  );
  const admin = await guarded(
    isInstallationAdmin(deps, installation.id, current),
    false,
    ADMIN_CHECK_TIMEOUT_MS,
    'report settings admin check failed',
    { installationId: String(installation.id) },
  );
  const config = operationalConfig(installation);
  const rows = await listTeamReports(deps.db, installation.id);
  const resolved = config
    ? await resolveTeams(deps, installation.id, installation.accountLogin, config)
    : [];
  const login = current.login.toLowerCase();
  const teams = (config?.teams ?? []).map((team) => ({
    team: team.name,
    provider: team.chat.provider,
    editable: admin || resolved.some((r) => r.name === team.name && managesTeam(login, r)),
    report: reportView(rows.find((r) => r.teamName === team.name)),
  }));
  const names = new Set(teams.map((t) => t.team));
  return {
    llm: admin ? await llmView(deps, installation.id) : { manage: false },
    teams,
    orphans: admin ? rows.filter((r) => !names.has(r.teamName)).map((r) => r.teamName) : [],
  };
}

export async function saveLlmSettings(
  deps: Deps,
  isMember: MembershipCheck,
  member: MemberRow,
  input: SaveLlmSettingsInput,
): Promise<LlmSettingsView> {
  await requireAdmin(deps, isMember, member, input.installationId);
  if (!LLM_PROVIDERS.includes(input.provider)) throw invalid('provider is not supported');
  if (input.model.length < 1 || input.model.length > 100) {
    throw invalid('model must have between 1 and 100 characters');
  }
  if (input.apiKey !== undefined && !/^\S{8,200}$/.test(input.apiKey)) {
    throw invalid('api key must have between 8 and 200 characters and no whitespace');
  }
  const existing = await getLlmSettings(deps.db, input.installationId);
  if (input.apiKey === undefined && !existing) throw invalid('api key is required');
  await upsertLlmSettings(
    deps.db,
    {
      installationId: input.installationId,
      provider: input.provider,
      model: input.model,
      apiKey: input.apiKey,
    },
    deps.encryptionKey,
  );
  return llmView(deps, input.installationId);
}

export async function removeLlmSettings(
  deps: Deps,
  isMember: MembershipCheck,
  member: MemberRow,
  installationId: number,
): Promise<void> {
  await requireAdmin(deps, isMember, member, installationId);
  await deleteLlmSettings(deps.db, installationId);
}

function validateTeamReport(input: SaveTeamReportInput, provider: ChatProvider): void {
  if (input.channel.length < 1 || input.channel.length > 200) {
    throw invalid('channel must have between 1 and 200 characters');
  }
  if (provider === 'google-chat' && !GOOGLE_CHAT_SPACE.test(input.channel)) {
    throw invalid('channel must be a Google Chat space name');
  }
  if (!WEEKDAYS.includes(input.weekday)) throw invalid('weekday is not valid');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw invalid('time must be HH:MM');
  const branch = input.productionBranch;
  if (branch.length < 1 || branch.length > 200 || /\s/.test(branch) || branch.startsWith('refs/')) {
    throw invalid('production branch is not valid');
  }
}

export async function saveTeamReport(
  deps: Deps,
  isMember: MembershipCheck,
  member: MemberRow,
  input: SaveTeamReportInput,
): Promise<{ report: TeamReportView['report']; channel: ChannelCheck | 'not_linked' }> {
  const access = await loadTeamAccess(deps, isMember, member, input);
  if (!access.elevated) {
    throw new DomainError('forbidden', 'only a team manager or an organization admin can do this');
  }
  const provider = access.team.chat.provider;
  validateTeamReport(input, provider);
  const row = await upsertTeamReport(
    deps.db,
    {
      installationId: input.installationId,
      teamName: input.team,
      enabled: input.enabled,
      channel: input.channel,
      weekday: input.weekday,
      time: input.time,
      productionBranch: input.productionBranch,
    },
    deps.now(),
  );
  let channel: ChannelCheck | 'not_linked';
  if (!(await isChannelLinked(deps, input.installationId, provider, input.channel))) {
    channel = 'not_linked';
  } else {
    const chat = await deps.chatFor(input.installationId, provider);
    channel = chat ? await chat.checkChannel(input.channel) : 'not_found';
  }
  return { report: reportView(row), channel };
}

export async function removeTeamReport(
  deps: Deps,
  isMember: MembershipCheck,
  member: MemberRow,
  input: { installationId: number; team: string },
): Promise<void> {
  const { installation } = await authorizeInstallation(
    deps,
    isMember,
    member,
    input.installationId,
  );
  const configured = operationalConfig(installation)?.teams.some((t) => t.name === input.team);
  if (configured) {
    const access = await loadTeamAccess(deps, isMember, member, input);
    if (!access.elevated) {
      throw new DomainError(
        'forbidden',
        'only a team manager or an organization admin can do this',
      );
    }
  } else {
    await requireAdmin(deps, isMember, member, input.installationId);
  }
  if (!(await getTeamReport(deps.db, input.installationId, input.team))) {
    throw new DomainError('not_found', 'team report not found');
  }
  await deleteTeamReport(deps.db, input.installationId, input.team);
}
