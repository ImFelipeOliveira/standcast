import {
  GOOGLE_CHAT_SPACE,
  GOOGLE_CHAT_USER_ID,
  type Language,
  LINK_CHAT_ACCOUNT_ACTION,
  type MessageKey,
  type StandcastConfig,
  t,
} from '@standcast/core';
import {
  deleteGoogleChatConnectionIfUnused,
  deleteInstallationIdentities,
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
import type { Deps } from '../../deps';
import { logError } from '../../log-error';
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
  action?: string;
};

export type GoogleChatReply = { text: string; privateTo?: string };

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

function bilingualWithMapHint(key: MessageKey, userId: string): GoogleChatReply {
  const texts = (['en', 'pt-BR'] as const).map(
    (lang) => `${t(lang, key)}\n${t(lang, 'googleChat.mapHint', { userId })}`,
  );
  return { text: texts.join('\n\n') };
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
    now: deps.now(),
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
      const written = await writeIdentityIfConnected(deps.db, {
        installationId,
        memberId: member.id,
        provider: 'google-chat',
        connectionExternalId,
        externalId: userName,
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

async function membersWithEmail(deps: EventDeps, email: string): Promise<MemberRow[]> {
  try {
    return await findMembersByEmail(deps.db, email);
  } catch {
    throw new Error('google chat member lookup failed');
  }
}

async function quarantineLinks(
  deps: EventDeps,
  members: MemberRow[],
  userName: string,
): Promise<void> {
  const memberIds = members.map((member) => member.id);
  const installations = new Set<number>();
  for (const member of members) {
    for (const { installationId } of await listMemberInstallations(deps.db, member.id)) {
      installations.add(installationId);
    }
  }
  for (const installationId of installations) {
    if (!(await getConnectionExternalId(deps.db, installationId, 'google-chat'))) continue;
    await deleteInstallationIdentities(deps.db, installationId, 'google-chat', {
      memberIds,
      externalId: userName,
    });
  }
}

async function linkIdentities(
  deps: EventDeps,
  user: GoogleChatEvent['user'],
): Promise<GoogleChatReply> {
  const email = user?.email?.trim();
  if (!user || !email || !GOOGLE_CHAT_USER_ID.test(user.name)) {
    return bilingual('googleChat.notFound');
  }
  const members = await membersWithEmail(deps, email);
  if (members.length === 0) return bilingualWithMapHint('googleChat.notFound', user.name);
  if (new Set(members.map((member) => member.id)).size > 1) {
    await quarantineLinks(deps, members, user.name);
    return bilingualWithMapHint('googleChat.ambiguous', user.name);
  }
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

async function linkFromSpace(
  deps: EventDeps,
  user: GoogleChatEvent['user'],
): Promise<GoogleChatReply | null> {
  if (!user || !GOOGLE_CHAT_USER_ID.test(user.name)) return null;
  return { ...(await linkIdentities(deps, user)), privateTo: user.name };
}

function asksToLink(event: GoogleChatEvent): boolean {
  if (event.type === 'MESSAGE') return true;
  return event.type === 'CARD_CLICKED' && event.action === LINK_CHAT_ACCOUNT_ACTION;
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
  if (asksToLink(event)) return linkFromSpace(deps, event.user);
  return null;
}
