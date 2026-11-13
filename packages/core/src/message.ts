export type Inline = string | { mention: string } | { link: { text: string; url: string } };

export type Block =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; content: Inline[] }
  | { type: 'list'; items: Inline[][] }
  | { type: 'divider' };

export const LINK_CHAT_ACCOUNT_ACTION = 'link-chat-account';

export type MessageAction = { type: typeof LINK_CHAT_ACCOUNT_ACTION; text: string; label: string };

export type Message = { fallbackText: string; blocks: Block[]; actions?: MessageAction[] };

export type Person = { login: string; chatUserId?: string };

export function personInline(p: Person): Inline {
  return p.chatUserId ? { mention: p.chatUserId } : `@${p.login}`;
}

function inlineToText(i: Inline): string {
  if (typeof i === 'string') return i;
  if ('mention' in i) return `@${i.mention}`;
  return `${i.link.text} (${i.link.url})`;
}

export function toPlainText(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case 'heading':
          return b.text;
        case 'paragraph':
          return b.content.map(inlineToText).join('');
        case 'list':
          return b.items.map((item) => `- ${item.map(inlineToText).join('')}`).join('\n');
        case 'divider':
          return '---';
        default:
          return '';
      }
    })
    .join('\n');
}
