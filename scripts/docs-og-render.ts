import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, rmdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { chromium } from '@playwright/test';
import {
  docPages,
  OG_HEIGHT,
  OG_TEMPLATE,
  OG_WIDTH,
  type OgCard,
  ogImageFor,
  templateDigest,
} from './docs-og';

const SITE = join(import.meta.dir, '../docs/site');
const PUBLIC = join(SITE, 'public');
const OG_ROOT = join(PUBLIC, 'og');

async function pruneEmptyDirs(dir: string): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) await pruneEmptyDirs(join(dir, entry.name));
  }
  if (dir !== OG_ROOT && (await readdir(dir)).length === 0) await rmdir(dir);
}

const digest = await templateDigest();
const wanted = new Map<string, OgCard>();
for (const page of await docPages(SITE)) {
  const { card, image } = await ogImageFor(SITE, page, digest);
  wanted.set(image, card);
}

const missing = [...wanted].filter(([image]) => !existsSync(join(PUBLIC, image)));
if (missing.length > 0) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: OG_WIDTH, height: OG_HEIGHT } });
    await page.goto(`file://${OG_TEMPLATE}`);
    for (const [image, card] of missing) {
      await page.evaluate((values) => {
        for (const [slot, text] of Object.entries(values)) {
          const element = document.querySelector(`[data-slot="${slot}"]`);
          if (element !== null) element.textContent = text;
        }
      }, card);
      await page.evaluate(() => document.fonts.ready);
      const output = join(PUBLIC, image);
      await mkdir(dirname(output), { recursive: true });
      await page.screenshot({
        path: output,
        clip: { x: 0, y: 0, width: OG_WIDTH, height: OG_HEIGHT },
      });
      console.log(image);
    }
  } finally {
    await browser.close();
  }
}

await mkdir(OG_ROOT, { recursive: true });
for (const file of await readdir(OG_ROOT, { recursive: true })) {
  const image = `og/${String(file).split('\\').join('/')}`;
  if (image.endsWith('.png') && !wanted.has(image)) {
    await rm(join(PUBLIC, image));
    console.log(`removed ${image}`);
  }
}
await pruneEmptyDirs(OG_ROOT);
console.log(`${missing.length} rendered, ${wanted.size - missing.length} unchanged`);
