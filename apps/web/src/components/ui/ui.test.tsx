import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Badge } from './badge';
import { Button } from './button';
import { Card } from './card';
import { Select, SelectTrigger, SelectValue } from './select';

describe('ui primitives', () => {
  test('cards have no border', () => {
    const html = renderToStaticMarkup(<Card>x</Card>);
    expect(html).not.toContain('border-border');
    expect(html).toContain('bg-surface');
  });

  for (const variant of ['ok', 'warn', 'bad'] as const) {
    test(`${variant} badge is a colored dot with text, without a pastel fill`, () => {
      const html = renderToStaticMarkup(<Badge variant={variant}>Estado</Badge>);
      expect(html).toContain('before:rounded-full');
      expect(html).toContain('before:bg-current');
      expect(html).toContain('bg-transparent');
      expect(html).not.toMatch(/bg-(ok|warn|bad)-soft/);
      expect(html).toContain('Estado');
    });
  }

  test('destructive buttons use the control border', () => {
    const html = renderToStaticMarkup(<Button variant="destructive">Revogar</Button>);
    expect(html).toContain('border-border-strong');
    expect(html).toContain('text-bad-ink');
  });

  test('select text is 16px on phones to avoid zoom', () => {
    const html = renderToStaticMarkup(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="x" />
        </SelectTrigger>
      </Select>,
    );
    expect(html).toContain('text-base');
    expect(html).toContain('desk:text-sm');
  });
});
