import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageLocale, pageSection } from './docs-theme-config';

export type OgCard = { section: string; title: string; path: string };

export const DOCS_HOST = 'docs.standcast.app';

export const OG_WIDTH = 1200;

export const OG_HEIGHT = 630;

const RENDER_VERSION = '1';

export const OG_TEMPLATE = fileURLToPath(
  new URL('../docs/marketplace/brand/html/og-docs.html', import.meta.url),
);

const OG_FONTS = fileURLToPath(
  new URL('../docs/marketplace/brand/html/fonts.css', import.meta.url),
);

const HOME_TITLES = { en: 'Standcast documentation', 'pt-BR': 'Documentação do Standcast' };

const IGNORED = new Set(['.vitepress', 'public', 'node_modules']);

function plain(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function pageTitle(markdown: string): string {
  const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  const title = frontmatter.match(/^title:\s*(.+)$/m)?.[1]?.replace(/^['"]|['"]$/g, '');
  if (title !== undefined) return plain(title);
  const body = markdown.slice(frontmatter === '' ? 0 : frontmatter.length + 8);
  const heading = body.match(/^# (.+)$/m)?.[1];
  if (heading === undefined) throw new Error('page has no title or h1');
  return plain(heading);
}

export function displayPath(relativePath: string): string {
  const path = relativePath.replace(/\.md$/, '').replace(/(^|\/)index$/, '');
  return path === '' ? DOCS_HOST : `${DOCS_HOST}/${path}`;
}

export function ogCard(relativePath: string, markdown: string): OgCard {
  const home = relativePath === 'index.md' || relativePath === 'pt-BR/index.md';
  return {
    section: pageSection(relativePath),
    title: home ? HOME_TITLES[pageLocale(relativePath)] : pageTitle(markdown),
    path: displayPath(relativePath),
  };
}

export function ogHash(card: OgCard, digest: string): string {
  return createHash('sha256')
    .update(JSON.stringify([digest, card.section, card.title, card.path]))
    .digest('hex')
    .slice(0, 10);
}

export function ogImagePath(relativePath: string, card: OgCard, digest: string): string {
  return `og/${relativePath.replace(/\.md$/, '')}.${ogHash(card, digest)}.png`;
}

export async function templateDigest(): Promise<string> {
  const [template, fonts] = await Promise.all([
    readFile(OG_TEMPLATE, 'utf8'),
    readFile(OG_FONTS, 'utf8'),
  ]);
  return createHash('sha256').update(RENDER_VERSION).update(template).update(fonts).digest('hex');
}

export async function docPages(siteDir: string): Promise<string[]> {
  const entries = await readdir(siteDir, { recursive: true });
  return entries
    .map((entry) => String(entry).split('\\').join('/'))
    .filter((entry) => entry.endsWith('.md') && !entry.endsWith('README.md'))
    .filter((entry) => !entry.split('/').some((part) => IGNORED.has(part)))
    .sort();
}

export async function ogImageFor(siteDir: string, relativePath: string, digest: string) {
  const markdown = await readFile(join(siteDir, relativePath), 'utf8');
  const card = ogCard(relativePath, markdown);
  return { card, image: ogImagePath(relativePath, card, digest) };
}
