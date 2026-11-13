import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { PageHeader } from './PageHeader';
import { nextScrolled } from './scroll';

describe('nextScrolled', () => {
  test('shrinks past 64px and grows back only near the top', () => {
    expect(nextScrolled(false, 10)).toBe(false);
    expect(nextScrolled(false, 64)).toBe(false);
    expect(nextScrolled(false, 65)).toBe(true);
    expect(nextScrolled(true, 10)).toBe(true);
    expect(nextScrolled(true, 3)).toBe(true);
    expect(nextScrolled(true, 2)).toBe(false);
  });
});

describe('PageHeader', () => {
  test('is sticky, starts expanded and owns the only heading', () => {
    const html = renderToStaticMarkup(
      <PageHeader
        context="backend · America/Sao_Paulo"
        title="Terça"
        actions={<button type="button">x</button>}
      />,
    );
    expect(html).toContain('sticky');
    expect(html).toContain('top-0');
    expect(html).toContain('data-scrolled="false"');
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('backend · America/Sao_Paulo');
    expect(html).toContain('motion-reduce:transition-none');
  });

  test('title and context stay on one line so shrinking never changes the page height by more than the threshold', () => {
    const html = renderToStaticMarkup(
      <PageHeader context="ctx" title="Quinta-feira, 12 de novembro" />,
    );
    expect(html.match(/<h1[^>]*>/)?.[0]).toContain('truncate');
    expect(html.match(/<p[^>]*>ctx/)?.[0]).toContain('truncate');
  });
});
