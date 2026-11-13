import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { textLayerFromCairoSvg } from './brand/html-to-svg';

const ROOT = join(import.meta.dir, '..');
const BRAND = 'docs/marketplace/brand';
const PUBLIC_BRAND = 'apps/landing/public/brand';
const SCREENSHOTS = 'docs/marketplace/screenshots';

const RENDERED = [
  { png: 'logo-32.png', svg: 'logo-square.svg', width: 32, height: 32 },
  { png: 'logo-48.png', svg: 'logo-square.svg', width: 48, height: 48 },
  { png: 'logo-96.png', svg: 'logo-square.svg', width: 96, height: 96 },
  { png: 'logo-128.png', svg: 'logo-square.svg', width: 128, height: 128 },
  { png: 'logo-256.png', svg: 'logo-avatar.svg', width: 256, height: 256 },
  { png: 'apple-touch-icon-180.png', svg: 'apple-touch-icon.svg', width: 180, height: 180 },
  { png: 'favicon-32.png', svg: 'favicon.svg', width: 32, height: 32 },
  { png: 'favicon-16.png', svg: 'favicon-16.svg', width: 16, height: 16 },
  { png: 'banner-220x140.png', svg: 'banner.svg', width: 220, height: 140 },
  {
    png: 'github-marketplace-logo-512.png',
    svg: 'github-marketplace-logo.svg',
    width: 512,
    height: 512,
  },
  { png: 'feature-card-965x482.png', svg: 'feature-card.svg', width: 965, height: 482 },
  { png: 'social-preview-1280x640.png', svg: 'social-preview.svg', width: 1280, height: 640 },
  { png: 'og-landing-1200x630.png', svg: 'og-landing.svg', width: 1200, height: 630 },
  { png: 'og-landing-en-1200x630.png', svg: 'og-landing-en.svg', width: 1200, height: 630 },
] as const;

const SVG_ONLY = [
  { svg: 'og-docs.svg', width: 1200, height: 630 },
  { svg: 'readme-light.svg', width: 1600, height: 400 },
  { svg: 'readme-dark.svg', width: 1600, height: 400 },
] as const;

const SCREENSHOT_FILES = [
  '1-draft-in-agent.png',
  '2-digest-in-slack.png',
  '3-digest-in-google-chat.png',
  '4-blocker-routing.png',
  '5-team-panel.png',
] as const;

function bytes(path: string): Buffer {
  return readFileSync(join(ROOT, path));
}

function text(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

function pngSize(path: string): { width: number; height: number } {
  const data = bytes(path);
  expect(data.subarray(1, 4).toString('ascii'), path).toBe('PNG');
  expect(data.subarray(12, 16).toString('ascii'), path).toBe('IHDR');
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

function svgRoot(path: string): string {
  return text(path).match(/<svg\b[^>]*>/)?.[0] ?? '';
}

function attribute(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
}

function expectSelfContainedSvg(path: string, width: number, height: number) {
  expect(existsSync(join(ROOT, path)), path).toBe(true);
  const source = text(path);
  const root = svgRoot(path);
  expect(attribute(root, 'width'), path).toBe(String(width));
  expect(attribute(root, 'height'), path).toBe(String(height));
  expect(attribute(root, 'viewBox'), path).toBe(`0 0 ${width} ${height}`);
  expect(source, path).not.toMatch(/<text\b/);
  expect(source, path).not.toMatch(/<(image|foreignObject)\b/);
  expect(source, path).not.toMatch(/url\(\s*['"]?(https?:|\/\/|data:)/);
  expect(source, path).not.toMatch(/\shref="(?!#)/);
  expect(source, path).not.toMatch(/@import|@font-face/);
}

function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`\n${heading}\n`);
  expect(start, heading).toBeGreaterThan(-1);
  const rest = markdown.slice(start + heading.length + 2);
  return rest.match(/```text\n([\s\S]*?)\n```/)?.[1] ?? '';
}

describe('brand assets', () => {
  test('every rendered png has the size of its destination and an svg source', () => {
    for (const asset of RENDERED) {
      expect(pngSize(`${PUBLIC_BRAND}/${asset.png}`), asset.png).toEqual({
        width: asset.width,
        height: asset.height,
      });
    }
    const sources = new Map<string, { width: number; height: number }>();
    for (const asset of RENDERED) {
      if (asset.svg === 'logo-square.svg' || asset.svg === 'favicon.svg') continue;
      sources.set(asset.svg, { width: asset.width, height: asset.height });
    }
    for (const [svg, size] of sources) {
      expectSelfContainedSvg(`${BRAND}/${svg}`, size.width, size.height);
    }
  });

  test('the scalable icon sources are self-contained squares', () => {
    for (const svg of ['logo-square.svg', 'favicon.svg']) {
      const root = svgRoot(`${BRAND}/${svg}`);
      const width = Number(attribute(root, 'width'));
      expect(width, svg).toBeGreaterThan(0);
      expectSelfContainedSvg(`${BRAND}/${svg}`, width, width);
    }
  });

  test('templates and readme banners are self-contained svgs', () => {
    for (const asset of SVG_ONLY) {
      expectSelfContainedSvg(`${BRAND}/${asset.svg}`, asset.width, asset.height);
    }
  });

  test('favicon switches color in dark mode and the landing serves the same file', () => {
    const favicon = text(`${BRAND}/favicon.svg`);
    expect(favicon).toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)/);
    expect(bytes('apps/landing/public/favicon.svg').equals(bytes(`${BRAND}/favicon.svg`))).toBe(
      true,
    );
  });

  test('the github marketplace logo is white bars on a transparent background', () => {
    const logo = text(`${BRAND}/github-marketplace-logo.svg`);
    const fills = [...logo.matchAll(/fill="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(fills)).toEqual(new Set(['#FFFFFF']));
    const png = bytes(`${PUBLIC_BRAND}/github-marketplace-logo-512.png`);
    expect(png[25], 'color type RGBA').toBe(6);
  });

  test('the social preview stays under one megabyte', () => {
    expect(bytes(`${PUBLIC_BRAND}/social-preview-1280x640.png`).length).toBeLessThan(1_000_000);
  });

  test('marketplace screenshots are 1280x800', () => {
    for (const file of SCREENSHOT_FILES) {
      expect(pngSize(`${SCREENSHOTS}/${file}`), file).toEqual({ width: 1280, height: 800 });
    }
  });
});

describe('readme', () => {
  const readme = text('README.md');

  test('opens with a light and dark banner in a picture element', () => {
    const picture = readme.match(/<picture>([\s\S]*?)<\/picture>/)?.[1] ?? '';
    expect(picture).not.toBe('');
    const sources = [...picture.matchAll(/<source\b[^>]*>/g)].map((match) => match[0]);
    const media = sources.map((source) => attribute(source, 'media'));
    expect(media).toContain('(prefers-color-scheme: dark)');
    expect(media).toContain('(prefers-color-scheme: light)');
    for (const source of sources) {
      expect(attribute(source, 'srcset'), source).toMatch(
        /^docs\/marketplace\/brand\/readme-(light|dark)\.svg$/,
      );
    }
    const img = picture.match(/<img\b[^>]*>/)?.[0] ?? '';
    expect(attribute(img, 'width')).toBe('700');
    expect(attribute(img, 'src')).toMatch(/^docs\/marketplace\/brand\/readme-light\.svg$/);
    expect((attribute(img, 'alt') ?? '').length).toBeGreaterThan(20);
    expect(readme.indexOf('<picture>')).toBeLessThan(readme.indexOf('\n## '));
  });

  test('has at most four neutral badges', () => {
    const badges = [...readme.matchAll(/<img\b[^>]*src="([^"]*(?:shields\.io|badge\.svg)[^"]*)"/g)];
    expect(badges.length).toBeGreaterThan(0);
    expect(badges.length).toBeLessThanOrEqual(4);
    for (const badge of badges) {
      expect(badge[1], badge[1]).toContain('labelColor=18181b');
    }
  });

  test('puts the quick start before the features', () => {
    const quickStart = readme.indexOf('\n## Quick start\n');
    const features = readme.indexOf('\n## Features\n');
    expect(quickStart).toBeGreaterThan(-1);
    expect(features).toBeGreaterThan(quickStart);
  });

  test('makes the slack step of the admin quick start conditional', () => {
    const admins = readme.slice(readme.indexOf('\n### For admins\n'));
    const step = admins.match(/\n2\. [^\n]*/)?.[0] ?? '';
    expect(step).toContain('If your teams post to Slack, click **Connect Slack**');
    expect(step).toContain('If they post to Google Chat');
  });
});

describe('github marketplace copy', () => {
  const listing = text('docs/marketplace/listing.md');

  test('fits the github marketplace limits', () => {
    const veryShort = section(listing, '### Very short description');
    const intro = section(listing, '### Introductory description');
    const detailed = section(listing, '### Detailed description (GitHub)');
    expect(veryShort.length).toBeGreaterThanOrEqual(40);
    expect(veryShort.length).toBeLessThanOrEqual(80);
    expect(intro.length).toBeGreaterThanOrEqual(150);
    expect(intro.length).toBeLessThanOrEqual(250);
    expect(detailed.length).toBeGreaterThan(0);
    expect(detailed.length).toBeLessThanOrEqual(1000);
  });

  test('states what the github app reads and writes', () => {
    const manifest = JSON.parse(text('docs/github-app-manifest.json')) as {
      default_permissions: Record<string, string>;
    };
    const writes = Object.entries(manifest.default_permissions)
      .filter(([, access]) => access === 'write')
      .map(([name]) => name);
    expect(writes).toEqual(['checks']);
    const detailed = section(listing, '### Detailed description (GitHub)');
    expect(detailed).toContain('Standcast config check run');
    expect(detailed).toMatch(/reads[^.]*standcast\.yml and CODEOWNERS/);
    expect(detailed).toMatch(/team membership/);
  });

  test('does not show history as shipped in the team panel screenshot', () => {
    const row = listing.split('\n').find((line) => line.includes('5-team-panel.png')) ?? '';
    expect(row).not.toBe('');
    expect(row).not.toMatch(/blockers and history in one panel/);
    expect(row).toContain('History is coming soon');
  });

  test('names the badge color', () => {
    expect(listing).toContain('#3B4BC8');
  });
});

describe('cairo text layer', () => {
  const defs = '<defs><g><g id="glyph-0-1"><path d="M 1 2 L 3 4 Z"/></g></g></defs>';

  test('reads glyph groups that use fill attributes', () => {
    const layer = textLayerFromCairoSvg(
      `<svg>${defs}<g fill="rgb(100%, 0%, 0%)" fill-opacity="1"><use xlink:href="#glyph-0-1" x="3" y="6"/></g></svg>`,
    );
    expect(layer.defs).toContain('<path id="g1"');
    expect(layer.body).toContain('<use href="#g1" x="4" y="8"/>');
  });

  test('reads glyph groups that use a fill style', () => {
    const layer = textLayerFromCairoSvg(
      `<svg>${defs}<g style="fill:rgb(100%,0%,0%);fill-opacity:0.5;"><use xlink:href="#glyph-0-1" x="3" y="6"/></g></svg>`,
    );
    expect(layer.body).toContain('<use href="#g1" x="4" y="8"/>');
    expect(layer.body).toMatch(/fill="#FF0000" fill-opacity="0\.5"/);
  });

  test('keeps every painted group inside an unpainted surface group', () => {
    for (const [first, second] of [
      ['fill="rgb(100%, 0%, 0%)" fill-opacity="1"', 'fill="rgb(0%, 0%, 100%)" fill-opacity="1"'],
      [
        'style="fill:rgb(100%,0%,0%);fill-opacity:1;"',
        'style="fill:rgb(0%,0%,100%);fill-opacity:1;"',
      ],
    ]) {
      const layer = textLayerFromCairoSvg(
        `<svg>${defs}<g id="surface1"><g ${first}><use xlink:href="#glyph-0-1" x="3" y="6"/></g><g ${second}><use xlink:href="#glyph-0-1" x="6" y="9"/></g></g></svg>`,
      );
      expect(layer.body).toContain('<g fill="#FF0000"><use href="#g1" x="4" y="8"/></g>');
      expect(layer.body).toContain('<g fill="#0000FF"><use href="#g1" x="8" y="12"/></g>');
    }
  });

  test('fails when the converter output has no text layer', () => {
    expect(() => textLayerFromCairoSvg('<svg><defs></defs><g><path d="M 0 0"/></g></svg>')).toThrow(
      /no text layer/,
    );
  });
});
