import {
  GOOGLE_CHAT_SPACE,
  GOOGLE_CHAT_USER_ID,
  type Language,
  type MessageKey,
  memberOverrides,
  type StandcastConfig,
  t,
} from '@standcast/core';
import {
  deleteGoogleChatConnectionIfUnused,
  findMembersByEmail,
  getConnectionExternalId,
  getInstallation,
  issueGoogleChatLinkCode,
  listMemberInstallations,
  type MemberRow,
  operationalConfig,
  removeGoogleChatSpace,
  writeIdentityIfConnected,
} from '@standcast/db';
import { chatOverrideFor } from '../chat-identity';
import type { Deps } from '../deps';
import { logError } from '../log-error';
import { generateLinkCode, hashLinkCode, LINK_CODE_TTL_MS } from './link-google-chat-space';

export type GoogleChatEvent = {
  type: string;
  space: {
    name: string;
    type?: string;
    spaceType?: string;
    displayName?: string;
    singleUserBotDm?: boolean;
  };
  user?: { name: string; email?: string };
};

export type GoogleChatReply = { text: string };

type EventDeps = Pick<Deps, 'db' | 'now'>;

const DISPLAY_NAME_LIMIT = 200;

function isDirectMessage(space: GoogleChatEvent['space']): boolean {
  return (
    space.singleUserBotDm === true || space.type === 'DM' || space.spaceType === 'DIRECT_MESSAGE'
  );
}

function bilingual(key: MessageKey, vars: Record<string, string> = {}): GoogleChatReply {
  return { text: `${t('en', key, vars)}\n\n${t('pt-BR', key, vars)}` };
}

function reply(
  language: Language | null,
  key: MessageKey,
  vars: Record<string, string> = {},
): GoogleChatReply {
  return language ? { text: t(language, key, vars) } : bilingual(key, vars);
}

async function issueLinkCode(
  deps: EventDeps,
  space: GoogleChatEvent['space'],
): Promise<GoogleChatReply> {
  const code = generateLinkCode();
  const displayName = (space.displayName?.trim() || space.name).slice(0, DISPLAY_NAME_LIMIT);
  await issueGoogleChatLinkCode(deps.db, {
    spaceName: space.name,
    displayName,
    codeHash: hashLinkCode(code),
    expiresAt: new Date(deps.now().getTime() + LINK_CODE_TTL_MS),
  });
  return bilingual('googleChat.linkCode', { code });
}

async function removeSpace(deps: EventDeps, spaceName: string): Promise<null> {
  const installationId = await removeGoogleChatSpace(deps.db, spaceName);
  if (installationId !== null) {
    await deleteGoogleChatConnectionIfUnused(deps.db, installationId);
  }
  return null;
}

function teamLanguages(config: StandcastConfig, login: string): Language[] {
  return config.teams
    .filter((team) => team.members.some((m) => m.toLowerCase() === login))
    .map((team) => team.language);
}

type LinkOutcome = { linked: boolean; languages: Language[] };

async function linkMember(
  deps: EventDeps,
  member: MemberRow,
  userName: string,
): Promise<LinkOutcome> {
  const login = member.login.toLowerCase();
  const outcome: LinkOutcome = { linked: false, languages: [] };
  for (const { installationId } of await listMemberInstallations(deps.db, member.id)) {
    try {
      const connectionExternalId = await getConnectionExternalId(
        deps.db,
        installationId,
        'google-chat',
      );
      if (!connectionExternalId) continue;
      const config = operationalConfig(await getInstallation(deps.db, installationId));
      const override = config
        ? chatOverrideFor(memberOverrides(config, login), 'google-chat')
        : undefined;
      const written = await writeIdentityIfConnected(deps.db, {
        installationId,
        memberId: member.id,
        provider: 'google-chat',
        connectionExternalId,
        externalId: override ?? userName,
      });
      if (!written) continue;
      outcome.linked = true;
      if (config) outcome.languages.push(...teamLanguages(config, login));
    } catch (error) {
      logError('google chat identity link failed', error, {
        installationId: String(installationId),
        memberId: member.id,
      });
    }
  }
  return outcome;
}

async function linkIdentities(
  deps: EventDeps,
  user: GoogleChatEvent['user'],
): Promise<GoogleChatReply> {
  const email = user?.email?.trim();
  if (!user || !email || !GOOGLE_CHAT_USER_ID.test(user.name)) {
    return bilingual('googleChat.notFound');
  }
  const members = await findMembersByEmail(deps.db, email);
  if (members.length === 0) return bilingual('googleChat.notFound');
  const linked: string[] = [];
  const languages = new Set<Language>();
  for (const member of members) {
    const outcome = await linkMember(deps, member, user.name);
    if (!outcome.linked) continue;
    linked.push(`@${member.login}`);
    for (const language of outcome.languages) languages.add(language);
  }
  const [only] = languages;
  const language = languages.size === 1 && only ? only : null;
  if (linked.length === 0) return reply(language, 'googleChat.notConnected');
  return reply(language, 'googleChat.linked', { logins: linked.join(', ') });
}

export async function handleGoogleChatEvent(
  deps: EventDeps,
  event: GoogleChatEvent,
): Promise<GoogleChatReply | null> {
  const space = event.space;
  if (!space || typeof space.name !== 'string' || !GOOGLE_CHAT_SPACE.test(space.name)) return null;
  if (event.type === 'REMOVED_FROM_SPACE') return removeSpace(deps, space.name);
  if (isDirectMessage(space)) {
    if (event.type !== 'MESSAGE' && event.type !== 'ADDED_TO_SPACE') return null;
    return linkIdentities(deps, event.user);
  }
  if (event.type === 'ADDED_TO_SPACE') return issueLinkCode(deps, space);
  return null;
}
