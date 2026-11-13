import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  codeBackgrounds,
  contrast,
  cssVariables,
  ensureContrast,
  shikiContrastTransformer,
} from './docs-contrast';

const CSS = readFileSync(join(import.meta.dir, '../docs/site/.vitepress/theme/brand.css'), 'utf8');
const light = cssVariables(CSS, ':root');
const dark = { ...light, ...cssVariables(CSS, '.dark') };

const GITHUB_LIGHT = [
  '#24292E',
  '#032F62',
  '#005CC5',
  '#D73A49',
  '#22863A',
  '#6F42C1',
  '#E36209',
  '#6A737D',
  '#B31D28',
];
const GITHUB_DARK = [
  '#E1E4E8',
  '#9ECBFF',
  '#79B8FF',
  '#F97583',
  '#85E89D',
  '#B392F0',
  '#FFAB70',
  '#6A737D',
  '#FDAEB7',
];

function token(vars: Record<string, string>, name: string): string {
  const value = vars[name];
  if (value === undefined) throw new Error(`${name} is not set`);
  return value;
}

function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = CSS.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (match === null) throw new Error(`${selector} not found in brand.css`);
  return match[1] ?? '';
}

describe('contrast math', () => {
  test('black on white is 21:1 and a color on itself is 1:1', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#3446C2', '#3446C2')).toBeCloseTo(1, 5);
  });

  test('ensureContrast keeps colors that already pass', () => {
    expect(ensureContrast('#24292E', '#F4F4F5', 4.5)).toBe('#24292E');
  });

  test('ensureContrast darkens on light and lightens on dark backgrounds', () => {
    const onLight = ensureContrast('#E36209', '#F4F4F5', 4.5);
    const onDark = ensureContrast('#6A737D', '#161618', 4.5);
    expect(contrast(onLight, '#F4F4F5')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(onDark, '#161618')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(onLight, '#000000')).toBeLessThan(contrast('#E36209', '#000000'));
    expect(contrast(onDark, '#FFFFFF')).toBeLessThan(contrast('#6A737D', '#FFFFFF'));
  });
});

describe('brand tokens', () => {
  test('brand colors are the measured palette', () => {
    expect(token(light, '--vp-c-brand-1').toUpperCase()).toBe('#3446C2');
    expect(token(light, '--vp-c-brand-2').toUpperCase()).toBe('#2F3CA8');
    expect(token(dark, '--vp-c-brand-1').toUpperCase()).toBe('#8B98F0');
    expect(token(light, '--vp-c-text-1').toUpperCase()).toBe('#18181B');
    expect(token(light, '--vp-c-text-3').toUpperCase()).toBe('#5B5B66');
    expect(token(dark, '--vp-c-text-1').toUpperCase()).toBe('#EDEDEF');
    expect(token(dark, '--vp-c-text-3').toUpperCase()).toBe('#A1A1AA');
  });

  test('the dark brand color reaches 4.5:1 on the VitePress dark background', () => {
    expect(token(dark, '--vp-c-bg').toUpperCase()).toBe('#1B1B1F');
    expect(contrast('#8B98F0', '#1B1B1F')).toBeGreaterThanOrEqual(4.5);
  });

  for (const [theme, vars] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    test(`${theme}: text and links reach 4.5:1 on every background`, () => {
      const backgrounds = ['--vp-c-bg', '--vp-c-bg-alt', '--vp-c-bg-soft', '--vp-code-block-bg'];
      const foregrounds = [
        '--vp-c-text-1',
        '--vp-c-text-2',
        '--vp-c-text-3',
        '--vp-c-brand-1',
        '--vp-c-brand-2',
      ];
      for (const bg of backgrounds) {
        for (const fg of foregrounds) {
          const ratio = contrast(token(vars, fg), token(vars, bg));
          expect({ fg, bg, pass: ratio >= 4.5 }).toEqual({ fg, bg, pass: true });
        }
      }
    });

    test(`${theme}: inline code reaches 4.5:1`, () => {
      expect(
        contrast(token(vars, '--vp-code-color'), token(vars, '--vp-code-bg')),
      ).toBeGreaterThanOrEqual(4.5);
    });

    test(`${theme}: brand buttons keep white text at 4.5:1`, () => {
      expect(contrast('#FFFFFF', token(vars, '--vp-button-brand-bg'))).toBeGreaterThanOrEqual(4.5);
      expect(contrast('#FFFFFF', token(vars, '--vp-button-brand-hover-bg'))).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(
        contrast('#FFFFFF', token(vars, '--vp-button-brand-active-bg')),
      ).toBeGreaterThanOrEqual(4.5);
    });

    test(`${theme}: focus ring reaches 3:1 on the page and code backgrounds`, () => {
      const ring = token(vars, '--sc-focus-ring');
      for (const bg of ['--vp-c-bg', '--vp-c-bg-alt', '--vp-code-block-bg']) {
        expect(contrast(ring, token(vars, bg))).toBeGreaterThanOrEqual(3);
      }
    });
  }
});

describe('code highlighting', () => {
  const backgrounds = codeBackgrounds(CSS);

  test('code backgrounds come from brand.css', () => {
    expect(backgrounds.light).toBe(token(light, '--vp-code-block-bg'));
    expect(backgrounds.dark).toBe(token(dark, '--vp-code-block-bg'));
  });

  test('every GitHub theme token, comments included, reaches 4.5:1 after adjusting', () => {
    for (const color of GITHUB_LIGHT) {
      expect(
        contrast(ensureContrast(color, backgrounds.light, 4.5), backgrounds.light),
      ).toBeGreaterThanOrEqual(4.5);
    }
    for (const color of GITHUB_DARK) {
      expect(
        contrast(ensureContrast(color, backgrounds.dark, 4.5), backgrounds.dark),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('the transformer rewrites the dual theme colors of a token', () => {
    const transformer = shikiContrastTransformer(backgrounds);
    const node = { properties: { style: '--shiki-light:#E36209;--shiki-dark:#6A737D' } };
    transformer.span(node);
    const style = String(node.properties.style);
    const lightColor = style.match(/--shiki-light:(#[0-9A-F]{6})/)?.[1] ?? '';
    const darkColor = style.match(/--shiki-dark:(#[0-9A-F]{6})/)?.[1] ?? '';
    expect(contrast(lightColor, backgrounds.light)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(darkColor, backgrounds.dark)).toBeGreaterThanOrEqual(4.5);
  });

  test('the transformer leaves passing colors and other properties alone', () => {
    const transformer = shikiContrastTransformer(backgrounds);
    const style = '--shiki-light:#24292E;--shiki-dark:#E1E4E8;--shiki-light-font-style:italic';
    const node = { properties: { style } };
    transformer.span(node);
    expect(node.properties.style).toBe(style);
  });
});

describe('theme rules', () => {
  test('links in running content are underlined', () => {
    const rule = declarations('.vp-doc a:not(.header-anchor)');
    expect(rule).toMatch(/text-decoration-line:\s*underline/);
  });

  test('focus is a visible 2px ring in the brand color', () => {
    const rule = declarations(':focus-visible');
    expect(rule).toMatch(/outline:\s*2px solid var\(--sc-focus-ring\)/);
  });

  test('a focused code group tab shows the ring on its label', () => {
    const rule = declarations('.vp-code-group .tabs input:focus-visible + label');
    expect(rule).toMatch(/outline:\s*2px solid var\(--sc-focus-ring\)/);
  });

  test('code group tabs and copy buttons are at least 24px', () => {
    for (const selector of [
      '.vp-code-group .tabs label',
      ".vp-doc [class*='language-'] > button.copy",
    ]) {
      const rule = declarations(selector);
      const height = Number(rule.match(/min-height:\s*(\d+)px/)?.[1] ?? 0);
      const width = Number(rule.match(/min-width:\s*(\d+)px/)?.[1] ?? 0);
      expect({ selector, height: height >= 24, width: width >= 24 }).toEqual({
        selector,
        height: true,
        width: true,
      });
    }
  });
});
