import {
  type Block,
  GOOGLE_CHAT_USER_ID,
  type Inline,
  LINK_CHAT_ACCOUNT_ACTION,
  type Message,
  type MessageAction,
} from '@standcast/core';

export const GOOGLE_CHAT_TEXT_LIMIT = 4096;
export const TRUNCATION_TAIL = '… see Standcast';
export const MARKUP_BREAKER = String.fromCharCode(0x200b);

function escapeText(text: string): string {
  return text.replaceAll('<', `<${MARKUP_BREAKER}`);
}

function escapeLinkText(text: string): string {
  return escapeText(text).replaceAll('|', '¦').replaceAll('>', '›');
}

function safeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href
      .replaceAll('|', '%7C')
      .replaceAll('<', '%3C')
      .replaceAll('>', '%3E')
      .replace(/\s/g, (c) => encodeURIComponent(c));
  } catch {
    return null;
  }
}

function renderInline(i: Inline): string {
  if (typeof i === 'string') return escapeText(i);
  if ('mention' in i) {
    return GOOGLE_CHAT_USER_ID.test(i.mention) ? `<${i.mention}>` : escapeText(`@${i.mention}`);
  }
  const url = safeUrl(i.link.url);
  return url ? `<${url}|${escapeLinkText(i.link.text)}>` : escapeText(i.link.text);
}

function renderBlock(b: Block): string | null {
  switch (b.type) {
    case 'heading':
      return b.text.length === 0 ? null : `*${escapeText(b.text)}*`;
    case 'paragraph':
      return b.content.map(renderInline).join('');
    case 'list':
      return b.items.length === 0
        ? null
        : b.items.map((item) => `• ${item.map(renderInline).join('')}`).join('\n');
    case 'divider':
      return '';
  }
}

function truncate(text: string): string {
  if (text.length <= GOOGLE_CHAT_TEXT_LIMIT) return text;
  const budget = GOOGLE_CHAT_TEXT_LIMIT - TRUNCATION_TAIL.length - 1;
  const head = text.slice(0, budget);
  const lineEnd = head.lastIndexOf('\n');
  const open = head.lastIndexOf('<');
  const cutsMarkup = open > head.lastIndexOf('>') && head[open + 1] !== MARKUP_BREAKER;
  const hard = cutsMarkup ? head.slice(0, open) : head.replace(/[\uD800-\uDBFF]$/, '');
  const kept = lineEnd > 0 ? head.slice(0, lineEnd) : hard;
  return `${kept}\n${TRUNCATION_TAIL}`;
}

function escapeCardText(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function actionCard(action: MessageAction, interactionUrl: string) {
  return {
    cardId: action.type,
    card: {
      sections: [
        {
          widgets: [
            { textParagraph: { text: escapeCardText(action.text) } },
            {
              buttonList: {
                buttons: [
                  {
                    text: action.label,
                    onClick: {
                      action: {
                        function: interactionUrl,
                        parameters: [{ key: 'action', value: action.type }],
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  };
}

export type GoogleChatRenderOptions = { interactionUrl?: string };

export type GoogleChatPayload = { text: string; cardsV2?: ReturnType<typeof actionCard>[] };

export function renderGoogleChat(
  msg: Message,
  options: GoogleChatRenderOptions = {},
): GoogleChatPayload {
  const text = msg.blocks
    .map(renderBlock)
    .filter((b): b is string => b !== null)
    .join('\n');
  const payload = { text: truncate(text.trim().length > 0 ? text : escapeText(msg.fallbackText)) };
  const { interactionUrl } = options;
  const actions = (msg.actions ?? []).filter((a) => a.type === LINK_CHAT_ACCOUNT_ACTION);
  if (!interactionUrl || actions.length === 0) return payload;
  return { ...payload, cardsV2: actions.map((action) => actionCard(action, interactionUrl)) };
}
