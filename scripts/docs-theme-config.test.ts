import { describe, expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  EDIT_LINK_PATTERN,
  localeThemeConfig,
  pageSection,
  searchConfig,
  sharedThemeConfig,
  sidebar,
} from './docs-theme-config';

const SITE = join(import.meta.dir, '../docs/site');
const API_REFERENCE = 'https://api.standcast.app/reference';

type Item = { text?: string; link?: string; items?: Item[] };

function englishPages(): string[] {
  return readdirSync(SITE, { recursive: true })
    .map((entry) => String(entry).split('\\').join('/'))
    .filter((entry) => entry.endsWith('.md'))
    .filter((entry) => !entry.startsWith('pt-BR/') && !entry.startsWith('.vitepress/'))
    .filter((entry) => !entry.startsWith('public/'))
    .sort();
}

function links(groups: Item[], prefix: string): string[] {
  return groups
    .flatMap((group) => group.items ?? [])
    .map((item) => item.link ?? '')
    .filter((link) => link.startsWith(prefix || '/'))
    .map((link) => link.slice(prefix.length));
}

describe('sidebar', () => {
  const en = sidebar('en', API_REFERENCE) as Item[];
  const pt = sidebar('pt-BR', API_REFERENCE) as Item[];

  test('groups are Getting started, Members, Admin, API and Reference', () => {
    expect(en.map((group) => group.text)).toEqual([
      'Getting started',
      'Members',
      'Admin',
      'API',
      'Reference',
    ]);
    expect(pt.map((group) => group.text)).toEqual([
      'Primeiros passos',
      'Membros',
      'Admin',
      'API',
      'Referência',
    ]);
  });

  test('both languages have the same structure and pages', () => {
    expect(pt.map((group) => group.items?.length)).toEqual(en.map((group) => group.items?.length));
    expect(links(pt, '/pt-BR')).toEqual(links(en, ''));
  });

  test('every page is in exactly one group and every link has a page', () => {
    const pages = englishPages().map((page) =>
      `/${page.replace(/\.md$/, '')}`.replace(/(^|\/)index$/, '$1'),
    );
    const listed = links(en, '');
    expect([...listed].sort()).toEqual([...pages].sort());
    expect(new Set(listed).size).toBe(listed.length);
  });

  test('the API reference stays an external link in both languages', () => {
    for (const groups of [en, pt]) {
      const api = groups.find((group) => group.text === 'API');
      expect(api?.items?.some((item) => item.link === API_REFERENCE)).toBe(true);
    }
  });
});

describe('page section', () => {
  test('maps pages to the OG section label of their group', () => {
    expect(pageSection('index.md')).toBe('DOCS');
    expect(pageSection('how-it-works.md')).toBe('DOCS');
    expect(pageSection('faq.md')).toBe('DOCS');
    expect(pageSection('members/cli.md')).toBe('MEMBERS');
    expect(pageSection('pt-BR/members/cli.md')).toBe('MEMBROS');
    expect(pageSection('admin/install.md')).toBe('ADMIN');
    expect(pageSection('pt-BR/admin/install.md')).toBe('ADMIN');
    expect(pageSection('api/webhooks.md')).toBe('API');
    expect(pageSection('changelog.md')).toBe('CHANGELOG');
    expect(pageSection('pt-BR/changelog.md')).toBe('CHANGELOG');
  });

  test('an unknown page throws', () => {
    expect(() => pageSection('nope.md')).toThrow();
  });
});

describe('theme config', () => {
  test('local search with Portuguese translations', () => {
    const search = searchConfig();
    expect(search.provider).toBe('local');
    const pt = search.options?.locales?.['pt-BR']?.translations;
    expect(pt?.button?.buttonText).toBe('Buscar');
    expect(pt?.modal?.noResultsText).toBeTruthy();
    expect(pt?.modal?.footer?.closeKeyAriaLabel).toBeTruthy();
    expect(pt?.modal?.footer?.navigateUpKeyAriaLabel).toBeTruthy();
  });

  test('edit link points at the docs source on GitHub', () => {
    expect(EDIT_LINK_PATTERN).toBe(
      'https://github.com/ImFelipeOliveira/standcast/edit/main/docs/site/:path',
    );
    expect(localeThemeConfig('en', API_REFERENCE).editLink?.pattern).toBe(EDIT_LINK_PATTERN);
    expect(localeThemeConfig('pt-BR', API_REFERENCE).editLink?.text).toBe(
      'Editar esta página no GitHub',
    );
  });

  test('both languages show last updated, an h2 and h3 outline and the same footer keys', () => {
    for (const locale of ['en', 'pt-BR'] as const) {
      const config = localeThemeConfig(locale, API_REFERENCE);
      expect(config.lastUpdated?.text).toBeTruthy();
      const outline = config.outline;
      expect(typeof outline === 'object' && !Array.isArray(outline) ? outline.level : null).toEqual(
        [2, 3],
      );
    }
    expect(localeThemeConfig('pt-BR', API_REFERENCE).lastUpdated?.text).toBe('Atualizado em');
  });

  test('Portuguese labels the skip link, theme switch and menus', () => {
    const pt = localeThemeConfig('pt-BR', API_REFERENCE);
    expect(pt.skipToContentLabel).toBe('Pular para o conteúdo');
    expect(pt.darkModeSwitchTitle).toBeTruthy();
    expect(pt.lightModeSwitchTitle).toBeTruthy();
    expect(pt.sidebarMenuLabel).toBeTruthy();
  });

  test('shared config marks external links and keeps local search', () => {
    const shared = sharedThemeConfig();
    expect(shared.externalLinkIcon).toBe(true);
    expect(shared.search?.provider).toBe('local');
  });
});
