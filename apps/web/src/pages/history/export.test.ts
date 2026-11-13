import { describe, expect, test } from 'bun:test';
import type { TeamShipped } from '@standcast/orchestrator';
import { shippedCsv, shippedMarkdown } from './export';

const shipped: TeamShipped = {
  from: '2026-10-26',
  to: '2026-11-01',
  days: [
    {
      date: '2026-10-27',
      items: [
        {
          author: 'ana',
          text: 'Cache, "fast" path',
          ref: { kind: 'pull_request', url: 'https://github.com/acme/api/pull/8366' },
        },
      ],
    },
    {
      date: '2026-10-26',
      items: [
        {
          author: 'bruno',
          text: 'Batch\ninvoices',
          ref: { kind: 'card', url: 'https://linear.app/acme/issue/BE-412', title: 'BE-412' },
        },
      ],
    },
  ],
};

describe('shipped export', () => {
  test('markdown groups by day with links', () => {
    expect(shippedMarkdown(shipped, 'backend', 'en')).toBe(
      [
        '## backend · shipped 2026-10-26 to 2026-11-01',
        '',
        '### 2026-10-27',
        '- Cache, "fast" path ([api#8366](https://github.com/acme/api/pull/8366)) — @ana',
        '',
        '### 2026-10-26',
        '- Batch invoices ([BE-412](https://linear.app/acme/issue/BE-412)) — @bruno',
        '',
      ].join('\n'),
    );
  });

  test('markdown heading follows the language', () => {
    expect(shippedMarkdown(shipped, 'backend', 'pt-BR').split('\n')[0]).toBe(
      '## backend · entregas de 2026-10-26 a 2026-11-01',
    );
  });

  test('markdown escapes daily text so it renders as written', () => {
    const md = shippedMarkdown(
      {
        from: '2026-10-26',
        to: '2026-11-01',
        days: [
          {
            date: '2026-10-27',
            items: [
              {
                author: 'ana',
                text: 'Use <Widget> in *the* [dashboard] with `x` \\ y_z',
                ref: null,
              },
            ],
          },
        ],
      },
      'backend',
      'en',
    );
    expect(md).toContain(
      '- Use \\<Widget\\> in \\*the\\* \\[dashboard\\] with \\`x\\` \\\\ y\\_z — @ana',
    );
  });

  test('csv neutralizes spreadsheet formulas', () => {
    const csv = shippedCsv({
      from: '2026-10-26',
      to: '2026-11-01',
      days: [
        {
          date: '2026-10-27',
          items: [{ author: 'ana', text: '=HYPERLINK("x")', ref: null }],
        },
      ],
    });
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });

  test('csv escapes quotes, commas and newlines', () => {
    expect(shippedCsv(shipped)).toBe(
      [
        'date,author,kind,text,url',
        '2026-10-27,ana,pull_request,"Cache, ""fast"" path",https://github.com/acme/api/pull/8366',
        '2026-10-26,bruno,card,"Batch\ninvoices",https://linear.app/acme/issue/BE-412',
        '',
      ].join('\r\n'),
    );
  });
});
