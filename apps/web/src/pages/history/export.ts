import type { TeamShipped } from '@standcast/orchestrator';
import type { Lang } from '../../i18n';
import { refLabel } from '../hoje/refLabel';

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

export function shippedMarkdown(shipped: TeamShipped, team: string, lang: Lang): string {
  const title =
    lang === 'pt-BR'
      ? `## ${team} · entregas de ${shipped.from} a ${shipped.to}`
      : `## ${team} · shipped ${shipped.from} to ${shipped.to}`;
  const lines = [title, ''];
  for (const day of shipped.days) {
    lines.push(`### ${day.date}`);
    for (const item of day.items) {
      const link = item.ref ? ` ([${refLabel(item.ref)}](${item.ref.url}))` : '';
      lines.push(`- ${oneLine(item.text)}${link} — @${item.author}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

const csvField = (value: string) =>
  /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

export function shippedCsv(shipped: TeamShipped): string {
  const rows = [['date', 'author', 'kind', 'text', 'url']];
  for (const day of shipped.days) {
    for (const item of day.items) {
      rows.push([day.date, item.author, item.ref?.kind ?? '', item.text, item.ref?.url ?? '']);
    }
  }
  return `${rows.map((row) => row.map(csvField).join(',')).join('\r\n')}\r\n`;
}
