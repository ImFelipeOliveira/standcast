import type { Language } from './config';
import type { Item } from './daily';
import { formatDate, t } from './i18n';
import { type Inline, type Message, type Person, personInline, toPlainText } from './message';

export type BlockerAlertInput = {
  lang: Language;
  team: string;
  managers: Person[];
  author: string;
  blocker: Item;
  ageDays: number;
  openedOn: string;
  routedTo: string[];
};

function age(lang: Language, days: number): string {
  return days === 1 ? t(lang, 'blockerAlert.age.one') : t(lang, 'blockerAlert.age.other', { days });
}

function managerMentions(managers: Person[]): Inline[] {
  return managers.flatMap((manager, index) =>
    index === 0 ? [personInline(manager)] : [', ', personInline(manager)],
  );
}

export function buildBlockerAlert(input: BlockerAlertInput): Message {
  const { lang, blocker } = input;
  const ageText = age(lang, input.ageDays);
  const body: Inline[] = [];
  t(lang, 'blockerAlert.body', { age: ageText })
    .split('{managers}')
    .forEach((part, index) => {
      if (index > 0) body.push(...managerMentions(input.managers));
      if (part) body.push(part);
    });
  const blocks: Message['blocks'] = [
    { type: 'heading', text: t(lang, 'blockerAlert.title', { age: ageText, team: input.team }) },
    { type: 'paragraph', content: body },
    { type: 'list', items: [[blocker.text]] },
  ];
  if (blocker.ref) {
    blocks.push({
      type: 'paragraph',
      content: [{ link: { text: blocker.ref.title ?? blocker.ref.url, url: blocker.ref.url } }],
    });
  }
  blocks.push({
    type: 'paragraph',
    content: [
      t(lang, 'blockerAlert.opened', {
        date: formatDate(lang, input.openedOn),
        author: `@${input.author}`,
      }),
    ],
  });
  if (input.routedTo.length > 0) {
    blocks.push({
      type: 'paragraph',
      content: [
        t(lang, 'blockerAlert.routed', {
          logins: input.routedTo.map((login) => `@${login}`).join(', '),
        }),
      ],
    });
  }
  return { fallbackText: toPlainText(blocks), blocks };
}
