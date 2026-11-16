import { type Block, blockGap, type Inline, isSlackUserId, type Message } from '@standcast/core';

const HEADER_LIMIT = 150;
const SECTION_LIMIT = 3000;

function escapeText(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function renderInline(i: Inline): string {
  if (typeof i === 'string') return escapeText(i);
  if ('mention' in i) {
    return isSlackUserId(i.mention) ? `<@${i.mention}>` : escapeText(`@${i.mention}`);
  }
  const url = safeUrl(i.link.url);
  return url ? `<${url}|${escapeText(i.link.text)}>` : escapeText(i.link.text);
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

function section(text: string): object | null {
  if (text.length === 0) return null;
  const clipped = text.length > SECTION_LIMIT ? `${text.slice(0, SECTION_LIMIT - 1)}…` : text;
  return { type: 'section', text: { type: 'mrkdwn', text: clipped } };
}

function blockText(b: Block): string {
  if (b.type === 'paragraph') return b.content.map(renderInline).join('');
  if (b.type === 'list')
    return b.items.map((item) => `• ${item.map(renderInline).join('')}`).join('\n');
  return '';
}

function renderBlocks(blocks: Block[]): object[] {
  const out: object[] = [];
  let text = '';
  let prev: Block | null = null;
  const flush = () => {
    const done = section(text);
    if (done) out.push(done);
    text = '';
    prev = null;
  };
  for (const block of blocks) {
    if (block.type === 'heading' || block.type === 'divider') {
      flush();
      if (block.type === 'divider') out.push({ type: 'divider' });
      else if (block.text.length > 0) {
        out.push({
          type: 'header',
          text: { type: 'plain_text', text: block.text.slice(0, HEADER_LIMIT) },
        });
      }
      continue;
    }
    const next = blockText(block);
    if (next.length === 0) continue;
    const joined = prev ? text + blockGap(prev, block) + next : next;
    if (prev && joined.length > SECTION_LIMIT) {
      flush();
      text = next;
    } else {
      text = joined;
    }
    prev = block;
  }
  flush();
  return out;
}

export function renderSlack(msg: Message): { text: string; blocks: object[] } {
  return { text: escapeText(msg.fallbackText), blocks: renderBlocks(msg.blocks) };
}
