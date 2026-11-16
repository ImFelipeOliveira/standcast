import { addCalendarDays, previousWorkday } from './calendar';
import type { Language, TeamConfig } from './config';
import type { DailyContent, Item } from './daily';
import { githubRefLabel } from './github-ref';
import { formatDate, formatShortDate, t } from './i18n';
import { parseLinearIssueUrl } from './linear-ref';
import {
  type Block,
  type Inline,
  LINK_CHAT_ACCOUNT_ACTION,
  type Message,
  type MessageAction,
  type Person,
  personInline,
  toPlainText,
} from './message';

export type DigestEntry = Person & { daily: DailyContent };

function refLabel(ref: NonNullable<Item['ref']>, fallback: string): string {
  return (
    githubRefLabel(ref.url) ?? parseLinearIssueUrl(ref.url)?.identifier ?? ref.title ?? fallback
  );
}

function itemInlines(item: Item): Inline[] {
  if (!item.ref) return [item.text];
  return [item.text, ' ', { link: { text: refLabel(item.ref, item.text), url: item.ref.url } }];
}

function orderEntries(team: TeamConfig, entries: DigestEntry[]): DigestEntry[] {
  const order = 'memberLogins' in team ? (team.memberLogins as string[]) : team.members;
  const remaining = [...entries];
  const ordered: DigestEntry[] = [];
  for (const member of order) {
    const wanted = member.toLowerCase();
    const idx = remaining.findIndex((e) => e.login.toLowerCase() === wanted);
    if (idx !== -1) ordered.push(...remaining.splice(idx, 1));
  }
  return [...ordered, ...remaining];
}

function yesterdaySpan(team: TeamConfig, date: string): string {
  const lang = team.language;
  const from = formatShortDate(lang, previousWorkday(date, team));
  const to = formatShortDate(lang, addCalendarDays(date, -1));
  return from === to ? to : t(lang, 'dateRange', { from, to });
}

function topic(label: string, items: Item[], empty: string): Block[] {
  return [
    { type: 'paragraph', content: [`${label}:`] },
    { type: 'list', items: items.length > 0 ? items.map(itemInlines) : empty ? [[empty]] : [] },
  ];
}

function personSection(entry: DigestEntry, team: TeamConfig, date: string): Block[] {
  const lang = team.language;
  const { yesterday, today, blockers, support = [] } = entry.daily;
  return [
    { type: 'paragraph', content: [personInline(entry)] },
    ...(yesterday.length > 0
      ? topic(`${t(lang, 'yesterday')} (${yesterdaySpan(team, date)})`, yesterday, '')
      : []),
    ...topic(`${t(lang, 'today')} (${formatShortDate(lang, date)})`, today, ''),
    ...topic(t(lang, 'blockers'), blockers, t(lang, 'noBlockers')),
    ...topic(t(lang, 'support'), support, t(lang, 'noSupport')),
  ];
}

function attributedSection(
  entries: DigestEntry[],
  heading: string,
  pick: (daily: DailyContent) => Item[],
): Block[] {
  const items: Inline[][] = entries.flatMap((e) =>
    pick(e.daily).map((item) => [personInline(e), ': ', ...itemInlines(item)]),
  );
  if (items.length === 0) return [];
  return [
    { type: 'heading', text: heading },
    { type: 'list', items },
  ];
}

function blockersSection(entries: DigestEntry[], lang: Language): Block[] {
  return attributedSection(entries, t(lang, 'blockers'), (daily) => daily.blockers);
}

function supportSection(entries: DigestEntry[], lang: Language): Block[] {
  return attributedSection(entries, t(lang, 'support'), (daily) => daily.support ?? []);
}

function message(blocks: Block[]): Message {
  return { fallbackText: toPlainText(blocks), blocks };
}

type DigestInput = {
  team: TeamConfig;
  date: string;
  entries: DigestEntry[];
  missing: Person[];
};

function missingSection(missing: Person[], lang: Language): Block[] {
  if (missing.length === 0) return [];
  const content: Inline[] = [t(lang, 'missing')];
  missing.forEach((p, i) => {
    content.push(i === 0 ? ' ' : ', ', personInline(p));
  });
  return [{ type: 'paragraph', content }];
}

function linkAccountAction(lang: Language): MessageAction {
  return {
    type: LINK_CHAT_ACCOUNT_ACTION,
    text: t(lang, 'googleChat.linkPrompt'),
    label: t(lang, 'googleChat.linkButton'),
  };
}

function withLinkAction(team: TeamConfig, people: Person[], blocks: Block[]): Message {
  if (team.chat?.provider !== 'google-chat' || people.every((p) => p.chatUserId)) {
    return message(blocks);
  }
  return { ...message(blocks), actions: [linkAccountAction(team.language)] };
}

function digestTitle(team: TeamConfig, date: string): Block {
  return {
    type: 'heading',
    text: t(team.language, 'digestTitle', {
      team: team.name,
      date: formatDate(team.language, date),
    }),
  };
}

export function buildDigest(input: DigestInput): Message {
  const { team, date, missing } = input;
  const lang = team.language;
  const entries = orderEntries(team, input.entries);
  const blocks: Block[] = [
    digestTitle(team, date),
    ...entries.flatMap((e) => personSection(e, team, date)),
    ...missingSection(missing, lang),
  ];
  return withLinkAction(team, [...entries, ...missing], blocks);
}

export function buildDigestSummary(input: DigestInput): Message {
  const { team, date, missing } = input;
  const lang = team.language;
  const entries = orderEntries(team, input.entries);
  const open = [
    ...blockersSection(entries, lang),
    ...supportSection(entries, lang),
    ...missingSection(missing, lang),
  ];
  const body: Block[] =
    open.length > 0 ? open : [{ type: 'paragraph', content: [t(lang, 'allSent')] }];
  return withLinkAction(team, [...entries, ...missing], [digestTitle(team, date), ...body]);
}

export function buildDailyPost(
  entry: DigestEntry,
  team: TeamConfig,
  date: string,
  late: boolean,
): Message {
  const lang = team.language;
  return message([
    ...(late ? [{ type: 'paragraph' as const, content: [t(lang, 'lateDaily')] }] : []),
    ...personSection(entry, team, date),
  ]);
}
