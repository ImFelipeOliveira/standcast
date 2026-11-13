import { copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { artboardToSvg } from './html-to-svg';

const ROOT = join(import.meta.dir, '../..');
const BRAND = join(ROOT, 'docs/marketplace/brand');
const HTML = join(BRAND, 'html');
const MOCK = join(ROOT, 'docs/marketplace/mock');
const SCREENSHOTS = join(ROOT, 'docs/marketplace/screenshots');
const PUBLIC = join(ROOT, 'apps/landing/public');
const PUBLIC_BRAND = join(PUBLIC, 'brand');

type Render = { png: string; width: number; height: number };

const ARTBOARDS: {
  name: string;
  width: number;
  height: number;
  label: string;
  renders: Render[];
}[] = [
  {
    name: 'banner',
    width: 220,
    height: 140,
    label: 'Standcast',
    renders: [{ png: 'banner-220x140.png', width: 220, height: 140 }],
  },
  {
    name: 'feature-card',
    width: 965,
    height: 482,
    label: 'Standcast: daily standups, drafted by your AI agent',
    renders: [{ png: 'feature-card-965x482.png', width: 965, height: 482 }],
  },
  {
    name: 'social-preview',
    width: 1280,
    height: 640,
    label: 'Standcast: the daily standup, written in your AI agent',
    renders: [{ png: 'social-preview-1280x640.png', width: 1280, height: 640 }],
  },
  {
    name: 'og-landing',
    width: 1200,
    height: 630,
    label: 'Standcast: a daily do seu time, escrita no seu agente de IA',
    renders: [{ png: 'og-landing-1200x630.png', width: 1200, height: 630 }],
  },
  {
    name: 'og-landing-en',
    width: 1200,
    height: 630,
    label: 'Standcast: your daily standup, written in your AI agent',
    renders: [{ png: 'og-landing-en-1200x630.png', width: 1200, height: 630 }],
  },
  {
    name: 'og-docs',
    width: 1200,
    height: 630,
    label: 'Standcast documentation',
    renders: [],
  },
  {
    name: 'readme-light',
    width: 1600,
    height: 400,
    label: 'Standcast: the daily standup, written in your AI agent',
    renders: [],
  },
  {
    name: 'readme-dark',
    width: 1600,
    height: 400,
    label: 'Standcast: the daily standup, written in your AI agent',
    renders: [],
  },
];

const ICONS: { svg: string; renders: Render[] }[] = [
  {
    svg: 'logo-square.svg',
    renders: [32, 48, 96, 128].map((size) => ({
      png: `logo-${size}.png`,
      width: size,
      height: size,
    })),
  },
  { svg: 'logo-avatar.svg', renders: [{ png: 'logo-256.png', width: 256, height: 256 }] },
  {
    svg: 'apple-touch-icon.svg',
    renders: [{ png: 'apple-touch-icon-180.png', width: 180, height: 180 }],
  },
  {
    svg: 'github-marketplace-logo.svg',
    renders: [{ png: 'github-marketplace-logo-512.png', width: 512, height: 512 }],
  },
  { svg: 'favicon.svg', renders: [{ png: 'favicon-32.png', width: 32, height: 32 }] },
  { svg: 'favicon-16.svg', renders: [{ png: 'favicon-16.png', width: 16, height: 16 }] },
];

const SCREENSHOT_MOCKS = [
  '1-draft-in-agent',
  '2-digest-in-slack',
  '3-digest-in-google-chat',
  '4-blocker-routing',
  '5-team-panel',
];

function rasterize(svg: string, render: Render) {
  const result = Bun.spawnSync([
    'rsvg-convert',
    '-w',
    String(render.width),
    '-h',
    String(render.height),
    svg,
    '-o',
    join(PUBLIC_BRAND, render.png),
  ]);
  if (result.exitCode !== 0) throw new Error(`rsvg-convert failed: ${result.stderr.toString()}`);
  console.log(`  ${render.png}`);
}

const browser = await chromium.launch();
try {
  for (const artboard of ARTBOARDS) {
    const svgPath = join(BRAND, `${artboard.name}.svg`);
    const svg = await artboardToSvg(browser, {
      file: join(HTML, `${artboard.name}.html`),
      width: artboard.width,
      height: artboard.height,
      label: artboard.label,
    });
    writeFileSync(svgPath, svg);
    console.log(`${artboard.name}.svg`);
    for (const render of artboard.renders) rasterize(svgPath, render);
  }
  for (const icon of ICONS) {
    console.log(icon.svg);
    for (const render of icon.renders) rasterize(join(BRAND, icon.svg), render);
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  for (const mock of SCREENSHOT_MOCKS) {
    await page.goto(`file://${join(MOCK, `${mock}.html`)}`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(SCREENSHOTS, `${mock}.png`) });
    console.log(`${mock}.png`);
  }
  await page.close();
} finally {
  await browser.close();
}

copyFileSync(join(BRAND, 'favicon.svg'), join(PUBLIC, 'favicon.svg'));
copyFileSync(join(PUBLIC_BRAND, 'logo-96.png'), join(PUBLIC, 'favicon.png'));
