import { localDate } from './calendar';
import type { Language } from './config';
import { formatDate, type MessageKey, t } from './i18n';
import { type Block, type Inline, type Message, toPlainText } from './message';

export type ReportItemKind = 'new' | 'fixed' | 'removed';

export type ReportLink = { label: string; url: string };

export type ReportItem = {
  kind: ReportItemKind;
  title: string;
  liveSince: string;
  links: ReportLink[];
  whatChanges?: string;
  whoFor?: string;
  whereToFind?: string;
  problem?: string;
  whoWasAffected?: string;
  customerAction?: string;
  ticket?: string;
};

export const REPORT_MESSAGE_BUDGET = 2800;

const KINDS: ReportItemKind[] = ['new', 'fixed', 'removed'];

const FIELDS = {
  new: ['whatChanges', 'whoFor', 'whereToFind'],
  fixed: ['problem', 'whoWasAffected', 'customerAction', 'ticket'],
  removed: ['whatChanges', 'whoWasAffected', 'customerAction', 'ticket'],
} as const satisfies Record<ReportItemKind, readonly (keyof ReportItem)[]>;

const linkInlines = (links: ReportLink[]): Inline[] =>
  links.flatMap((l, i): Inline[] => [
    ...(i > 0 ? [' · '] : []),
    { link: { text: l.label, url: l.url } },
  ]);

function line(item: ReportItem): Inline[] {
  if (item.links.length === 0) return [item.title];
  return [`${item.title} (`, ...linkInlines(item.links), ')'];
}

type Section = { kind: ReportItemKind; lines: Inline[][]; indexes: number[] };

export function buildProductionReport(input: {
  lang: Language;
  team: string;
  from: string;
  to: string;
  items: ReportItem[];
}): { message: Message; items: number[] }[] {
  const { lang, team } = input;
  const first = t(lang, 'report.title', {
    team,
    from: formatDate(lang, input.from),
    to: formatDate(lang, input.to),
  });
  const continued = t(lang, 'report.titleContinued', { team });

  const render = (heading: string, sections: Section[]): Block[] => [
    { type: 'heading', text: heading },
    ...sections.flatMap((s): Block[] => [
      { type: 'heading', text: t(lang, `report.section.${s.kind}`) },
      { type: 'list', items: s.lines },
    ]),
  ];

  const chunks: { message: Message; items: number[] }[] = [];
  let sections: Section[] = [];
  const flush = () => {
    if (sections.length === 0) return;
    const blocks = render(chunks.length === 0 ? first : continued, sections);
    chunks.push({
      message: { fallbackText: toPlainText(blocks), blocks },
      items: sections.flatMap((s) => s.indexes),
    });
    sections = [];
  };

  for (const kind of KINDS) {
    input.items.forEach((item, index) => {
      if (item.kind !== kind) return;
      const heading = chunks.length === 0 ? first : continued;
      const add = (): Section[] => {
        const last = sections[sections.length - 1];
        if (last?.kind === kind) {
          return [
            ...sections.slice(0, -1),
            { ...last, lines: [...last.lines, line(item)], indexes: [...last.indexes, index] },
          ];
        }
        return [...sections, { kind, lines: [line(item)], indexes: [index] }];
      };
      const next = add();
      if (
        sections.length > 0 &&
        toPlainText(render(heading, next)).length > REPORT_MESSAGE_BUDGET
      ) {
        flush();
        sections = [{ kind, lines: [line(item)], indexes: [index] }];
        return;
      }
      sections = next;
    });
  }
  flush();
  return chunks;
}

export function buildProductionReportItem(input: {
  lang: Language;
  timezone: string;
  item: ReportItem;
}): Message {
  const { lang, item } = input;
  const label = (key: MessageKey) => t(lang, key);
  const blocks: Block[] = [
    { type: 'heading', text: `${label(`report.item.${item.kind}`)} · ${item.title}` },
  ];
  for (const field of FIELDS[item.kind]) {
    const value = item[field];
    if (value) {
      blocks.push({
        type: 'paragraph',
        content: [`${label(`report.field.${field}`)}: ${value}`],
      });
    }
  }
  const since = item.kind === 'removed' ? 'report.field.removedSince' : 'report.field.liveSince';
  blocks.push({
    type: 'paragraph',
    content: [
      `${label(since)}: ${formatDate(lang, localDate(new Date(item.liveSince), input.timezone))}`,
    ],
  });
  if (item.links.length > 0) {
    blocks.push({
      type: 'paragraph',
      content: [`${label('report.field.links')}: `, ...linkInlines(item.links)],
    });
  }
  return { fallbackText: toPlainText(blocks), blocks };
}
