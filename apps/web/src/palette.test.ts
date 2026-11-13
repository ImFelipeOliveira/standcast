import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`missing ${selector}`);
  const body = css.slice(start, css.indexOf('}', start));
  const tokens: Record<string, string> = {};
  for (const match of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)) {
    tokens[match[1] as string] = (match[2] as string).toLowerCase();
  }
  return tokens;
}

function luminance(hex: string): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const light = block(':root');
const dark = { ...light, ...block(':root[data-theme="dark"]') };

const TEXT_PAIRS: [string, string][] = [
  ['text', 'surface'],
  ['text', 'bg'],
  ['text2', 'surface'],
  ['muted', 'surface'],
  ['muted', 'bg'],
  ['muted', 'hover'],
  ['accent-text', 'surface'],
  ['on-accent', 'accent'],
  ['amber-ink', 'surface'],
  ['warn-ink', 'surface'],
  ['bad-ink', 'surface'],
  ['ok-ink', 'surface'],
];

const UI_PAIRS: [string, string][] = [
  ['border-strong', 'surface'],
  ['border-strong', 'bg'],
  ['mark', 'surface'],
  ['mark', 'bg'],
];

for (const [name, theme] of [
  ['light', light],
  ['dark', dark],
] as const) {
  describe(`${name} palette`, () => {
    for (const [fg, bg] of TEXT_PAIRS) {
      test(`${fg} on ${bg} is at least 4.5:1`, () => {
        expect(contrast(theme[fg] as string, theme[bg] as string)).toBeGreaterThanOrEqual(4.5);
      });
    }
    for (const [fg, bg] of UI_PAIRS) {
      test(`${fg} on ${bg} is at least 3:1`, () => {
        expect(contrast(theme[fg] as string, theme[bg] as string)).toBeGreaterThanOrEqual(3);
      });
    }
  });
}

test('focus ring uses the mark color', () => {
  const focus = css.slice(css.indexOf(':focus-visible {'));
  expect(focus.slice(0, focus.indexOf('}'))).toContain('var(--mark)');
});
