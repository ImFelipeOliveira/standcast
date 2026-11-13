import type { TeamShipped } from '@standcast/orchestrator';
import { type Lang, translate } from '../../i18n';
import { refLabel } from '../hoje/refLabel';

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

const escapeMarkdown = (text: string) => text.replace(/[\\`*_[\]<>]/g, '\\$&');

const escapeBlockStart = (text: string) =>
  text.replace(/^(\d+)([.)])/, '$1\\$2').replace(/^[#+\-~]/, '\\$&');

export function shippedMarkdown(shipped: TeamShipped, team: string, lang: Lang): string {
  const title = translate(lang, 'history.exportTitle', {
    team: escapeMarkdown(team),
    from: shipped.from,
    to: shipped.to,
  });
  const lines = [`## ${title}`, ''];
  for (const day of shipped.days) {
    lines.push(`### ${day.date}`);
    for (const item of day.items) {
      const link = item.ref ? ` ([${refLabel(item.ref)}](${item.ref.url}))` : '';
      lines.push(`- ${escapeBlockStart(escapeMarkdown(oneLine(item.text)))}${link} — @${item.author}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

const csvField = (raw: string) => {
  const value = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
};

export function shippedCsv(shipped: TeamShipped): string {
  const rows = [['date', 'author', 'kind', 'text', 'url']];
  for (const day of shipped.days) {
    for (const item of day.items) {
      rows.push([day.date, item.author, item.ref?.kind ?? '', item.text, item.ref?.url ?? '']);
    }
  }
  return `${rows.map((row) => row.map(csvField).join(',')).join('\r\n')}\r\n`;
}
