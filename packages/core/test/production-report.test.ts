import { describe, expect, test } from 'bun:test';
import { toPlainText } from '../src/message';
import {
  buildProductionReport,
  buildProductionReportItem,
  REPORT_MESSAGE_BUDGET,
  type ReportItem,
  type ReportItemKind,
} from '../src/production-report';

describe('buildProductionReport', () => {
  const item = (kind: ReportItemKind, title: string): ReportItem => ({
    kind,
    title,
    liveSince: '2026-11-18T13:00:00Z',
    links: [{ label: 'api#412', url: 'https://github.com/acme/api/pull/412' }],
  });

  test('pt-BR report lists New, then Fixed, then Removed with links and no author', () => {
    const [chunk] = buildProductionReport({
      lang: 'pt-BR',
      team: 'Pagamentos',
      from: '2026-11-17',
      to: '2026-11-21',
      items: [
        item('fixed', 'Recibo duplicado'),
        item('new', 'Pix agendado'),
        item('removed', 'Boleto'),
      ],
    });
    const text = toPlainText(chunk?.message.blocks ?? []);
    expect(text).toContain('Em produção · Pagamentos · 17/11/2026 a 21/11/2026');
    expect(text.indexOf('Novidades')).toBeLessThan(text.indexOf('Correções'));
    expect(text.indexOf('Correções')).toBeLessThan(text.indexOf('Retirado do ar'));
    expect(text).toContain('api#412');
    expect(chunk?.items).toEqual([1, 0, 2]);
  });

  test('omits a section with no items', () => {
    const [chunk] = buildProductionReport({
      lang: 'en',
      team: 'T',
      from: '2026-11-17',
      to: '2026-11-21',
      items: [item('new', 'A')],
    });
    const text = toPlainText(chunk?.message.blocks ?? []);
    expect(text).not.toContain('Fixed');
    expect(text).not.toContain('Removed');
  });

  test('splits into messages under the budget and keeps every item exactly once', () => {
    const items = Array.from({ length: 120 }, (_, i) =>
      item(i % 2 ? 'fixed' : 'new', `Item ${i} ${'x'.repeat(40)}`),
    );
    const chunks = buildProductionReport({
      lang: 'en',
      team: 'T',
      from: '2026-11-17',
      to: '2026-11-21',
      items,
    });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks)
      expect(c.message.fallbackText.length).toBeLessThanOrEqual(REPORT_MESSAGE_BUDGET);
    expect(chunks.flatMap((c) => c.items).sort((a, b) => a - b)).toEqual(items.map((_, i) => i));
    expect(toPlainText(chunks[1]?.message.blocks ?? [])).toContain('(continued)');
  });
});

describe('buildProductionReportItem', () => {
  test('fix reply shows only the fields present, live since in team time zone, and links', () => {
    const text = toPlainText(
      buildProductionReportItem({
        lang: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        item: {
          kind: 'fixed',
          title: 'Recibo',
          liveSince: '2026-11-21T01:00:00Z',
          problem: 'Dois recibos',
          links: [
            { label: 'app#415', url: 'https://github.com/acme/app/pull/415' },
            { label: 'PAG-91', url: 'https://linear.app/acme/issue/PAG-91' },
          ],
        },
      }).blocks,
    );
    expect(text).toContain('Correção · Recibo');
    expect(text).toContain('Problema: Dois recibos');
    expect(text).not.toContain('Quem era afetado');
    expect(text).toContain('Em produção desde: 20/11/2026');
    expect(text).toContain('app#415');
  });

  test('removed reply says when it left production', () => {
    const text = toPlainText(
      buildProductionReportItem({
        lang: 'en',
        timezone: 'UTC',
        item: { kind: 'removed', title: 'Boleto', liveSince: '2026-11-20T10:00:00Z', links: [] },
      }).blocks,
    );
    expect(text).toContain('Removed · Boleto');
    expect(text).toContain('Removed since: 2026-11-20');
  });

  test('new item shows its ticket', () => {
    const text = toPlainText(
      buildProductionReportItem({
        lang: 'pt-BR',
        timezone: 'UTC',
        item: {
          kind: 'new',
          title: 'Pix',
          liveSince: '2026-11-20T10:00:00Z',
          ticket: 'PAG-1',
          links: [],
        },
      }).blocks,
    );
    expect(text).toContain('Chamado: PAG-1');
  });

  test('removed item ignores detail fields', () => {
    const text = toPlainText(
      buildProductionReportItem({
        lang: 'en',
        timezone: 'UTC',
        item: {
          kind: 'removed',
          title: 'Boleto',
          liveSince: '2026-11-20T10:00:00Z',
          problem: 'P',
          whatChanges: 'W',
          ticket: 'T-1',
          links: [],
        },
      }).blocks,
    );
    expect(text).not.toContain('Problem');
    expect(text).not.toContain('What changes');
    expect(text).not.toContain('Ticket');
  });
});
