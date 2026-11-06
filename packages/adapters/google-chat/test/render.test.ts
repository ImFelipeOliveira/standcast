import { describe, expect, test } from 'bun:test';
import { GOOGLE_CHAT_TEXT_LIMIT, MARKUP_BREAKER, renderGoogleChat } from '../src';

describe('renderGoogleChat', () => {
  test('renders heading, paragraph, list and divider as text', () => {
    const out = renderGoogleChat({
      fallbackText: 'fb',
      blocks: [
        { type: 'heading', text: 'Daily' },
        { type: 'paragraph', content: ['hello'] },
        { type: 'list', items: [['a'], ['b']] },
        { type: 'divider' },
        { type: 'paragraph', content: ['end'] },
      ],
    });
    expect(out).toEqual({ text: '*Daily*\nhello\n• a\n• b\n\nend' });
  });

  test('render keeps links and safe mentions only', () => {
    const out = renderGoogleChat({
      fallbackText: 'fb',
      blocks: [
        {
          type: 'paragraph',
          content: [
            { mention: 'users/123456789' },
            ' a & b * c ',
            { link: { text: 'PR #1', url: 'https://github.com/o/r/pull/1' } },
            ' ',
            { link: { text: 'bad', url: 'javascript:alert(1)' } },
            ' ',
            { mention: 'users/all' },
            ' ',
            { mention: 'ana' },
          ],
        },
      ],
    });
    expect(out.text).toBe(
      '<users/123456789> a & b * c <https://github.com/o/r/pull/1|PR #1> bad @users/all @ana',
    );
  });

  test('text and link text cannot inject markup', () => {
    const out = renderGoogleChat({
      fallbackText: 'fb',
      blocks: [
        {
          type: 'paragraph',
          content: [
            'ping <users/all> now',
            ' ',
            { link: { text: 'a|b>c', url: 'https://x.test/p?q=a|b&r=<s>' } },
          ],
        },
      ],
    });
    expect(out.text).not.toContain('<users/all>');
    expect(out.text).toContain(`ping <${MARKUP_BREAKER}users/all> now`);
    expect(MARKUP_BREAKER).toBe('\u200B');
    expect(out.text).toContain('<https://x.test/p?q=a%7Cb&r=%3Cs%3E|a¦b›c>');
  });

  test('falls back to the fallback text when blocks render empty', () => {
    expect(renderGoogleChat({ fallbackText: 'only <fb>', blocks: [] }).text).toBe(
      `only <${MARKUP_BREAKER}fb>`,
    );
  });

  test('long digest is cut with the tail', () => {
    const items = Array.from({ length: 400 }, (_, i) => [`item ${i} ${'x'.repeat(20)}`]);
    const out = renderGoogleChat({
      fallbackText: 'fb',
      blocks: [
        { type: 'heading', text: 'Digest' },
        { type: 'list', items },
      ],
    });
    expect(GOOGLE_CHAT_TEXT_LIMIT).toBe(4096);
    expect(out.text.length).toBeLessThanOrEqual(4096);
    expect(out.text.startsWith('*Digest*\n• item 0')).toBe(true);
    expect(out.text.endsWith('\n… see Standcast')).toBe(true);
    const lines = out.text.split('\n');
    expect(lines.at(-2)).toMatch(/^• item \d+ x{20}$/);
  });

  test('a single long line is cut with the tail', () => {
    const out = renderGoogleChat({
      fallbackText: 'fb',
      blocks: [{ type: 'paragraph', content: ['y'.repeat(5000)] }],
    });
    expect(out.text.length).toBeLessThanOrEqual(4096);
    expect(out.text.endsWith('… see Standcast')).toBe(true);
  });
});
