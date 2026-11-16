import type { Language, TeamConfig } from './config';
import type { DailyContent, Item } from './daily';
import { githubRefLabel } from './github-ref';
import { formatDate, t } from './i18n';
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

function personSection(entry: DigestEntry, lang: Language): Block[] {
  const blocks: Block[] = [{ type: 'paragraph', content: [personInline(entry)] }];
  const { yesterday, today } = entry.daily;
  if (yesterday.length > 0) {
    blocks.push({ type: 'paragraph', content: [`${t(lang, 'yesterday')}:`] });
    blocks.push({ type: 'list', items: yesterday.map(itemInlines) });
  }
  blocks.push({ type: 'paragraph', content: [`${t(lang, 'today')}:`] });
  blocks.push({ type: 'list', items: today.map(itemInlines) });
  return blocks;
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
    ...blockersSection(entries, lang),
    ...supportSection(entries, lang),
    ...entries.flatMap((e) => personSection(e, lang)),
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

export function buildDailyPost(entry: DigestEntry, lang: Language, late: boolean): Message {
  return message([
    ...(late ? [{ type: 'paragraph' as const, content: [t(lang, 'lateDaily')] }] : []),
    ...personSection(entry, lang),
    ...blockersSection([entry], lang),
    ...supportSection([entry], lang),
  ]);
}
