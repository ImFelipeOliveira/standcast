import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PUBLIC = join(import.meta.dir, '../public');
const SITE = 'https://standcast.app';
const API = 'https://api.standcast.app';
const DOCS = 'https://docs.standcast.app';

const PAIRS = [
  { key: 'home', en: '/', 'pt-BR': '/pt-BR/' },
  { key: 'how', en: '/how-it-works/', 'pt-BR': '/pt-BR/como-funciona/' },
  { key: 'privacy', en: '/privacy/', 'pt-BR': '/pt-BR/privacidade/' },
  { key: 'pricing', en: '/pricing/', 'pt-BR': '/pt-BR/precos/' },
  { key: 'faq', en: '/faq/', 'pt-BR': '/pt-BR/perguntas-frequentes/' },
  { key: 'beta', en: '/beta/', 'pt-BR': '/pt-BR/beta/' },
  { key: 'terms', en: '/terms/', 'pt-BR': '/pt-BR/termos/' },
] as const;

const FOOTER_ONLY: readonly Pair['key'][] = ['terms'];

const BRAND_IMAGES = [
  { file: 'brand/logo-32.png', width: 32, height: 32 },
  { file: 'brand/logo-48.png', width: 48, height: 48 },
  { file: 'brand/logo-96.png', width: 96, height: 96 },
  { file: 'brand/logo-128.png', width: 128, height: 128 },
  { file: 'brand/logo-256.png', width: 256, height: 256 },
  { file: 'brand/banner-220x140.png', width: 220, height: 140 },
] as const;

type Locale = 'en' | 'pt-BR';
type Pair = (typeof PAIRS)[number];

interface Page {
  key: Pair['key'];
  locale: Locale;
  path: string;
  file: string;
  url: string;
  pair: Pair;
}

const PAGES: Page[] = PAIRS.flatMap((pair) =>
  (['en', 'pt-BR'] as const).map((locale) => ({
    key: pair.key,
    locale,
    path: pair[locale],
    file: `${pair[locale].slice(1)}index.html`,
    url: `${SITE}${pair[locale]}`,
    pair,
  })),
);

const other = (locale: Locale): Locale => (locale === 'en' ? 'pt-BR' : 'en');

function pagesOf(key: Pair['key']): Page[] {
  return PAGES.filter((page) => page.key === key);
}

function read(path: string): string {
  return readFileSync(join(PUBLIC, path), 'utf8');
}

function htmlFiles(): string[] {
  return readdirSync(PUBLIC, { recursive: true, encoding: 'utf8' }).filter((path) =>
    path.endsWith('.html'),
  );
}

function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
}

function tags(html: string, name: string): string[] {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((match) => match[0]);
}

function metaContent(html: string, key: string): string | undefined {
  const tag = tags(html, 'meta').find(
    (meta) => attr(meta, 'name') === key || attr(meta, 'property') === key,
  );
  return tag ? attr(tag, 'content') : undefined;
}

function jsonLd(html: string): Record<string, unknown>[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap(
    (match) => {
      const parsed = JSON.parse(match[1] ?? '') as
        | Record<string, unknown>
        | Record<string, unknown>[];
      return Array.isArray(parsed) ? parsed : [parsed];
    },
  );
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&lt;': '<',
  '&gt;': '>',
};

function elementIds(html: string): string[] {
  const ids: string[] = [];
  new HTMLRewriter()
    .on('[id]', {
      element(element) {
        ids.push(element.getAttribute('id') ?? '');
      },
    })
    .transform(html);
  return ids;
}

function decode(text: string): string {
  return text
    .split(/<[^>]*>/)
    .join('')
    .replace(/&(?:amp|quot|#39|lt|gt);/g, (entity) => ENTITIES[entity] ?? entity)
    .trim();
}

function block(html: string, open: RegExp, close: string): string {
  const start = html.search(open);
  if (start === -1) return '';
  return html.slice(start, html.indexOf(close, start) + close.length);
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/\shref="([^"]*)"/g)].map((match) => match[1] ?? '');
}

describe('landing', () => {
  test('no inline scripts or style attributes', () => {
    const files = htmlFiles();
    expect(files.length).toBeGreaterThanOrEqual(PAGES.length + 1);
    for (const file of files) {
      const html = read(file);
      expect(html).not.toMatch(/\sstyle=/);
      expect(html).not.toMatch(/<style\b/);
      expect(html).not.toMatch(/\son[a-z]+=/);
      for (const script of tags(html, 'script')) {
        const isData = attr(script, 'type') === 'application/ld+json';
        expect(isData || attr(script, 'src') !== undefined).toBe(true);
      }
    }
  });

  test('every page pair exists in both locales', () => {
    for (const page of PAGES) {
      expect(existsSync(join(PUBLIC, page.file)), page.file).toBe(true);
    }
  });

  test('head tags present on every page', () => {
    for (const page of PAGES) {
      const html = read(page.file);
      expect(html).toMatch(new RegExp(`<html lang="${page.locale}"`));
      const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '';
      expect(title.length).toBeGreaterThan(0);
      if (page.key !== 'home') expect(title).toEndWith(' · Standcast');
      const description = metaContent(html, 'description') ?? '';
      expect(description.length, page.file).toBeGreaterThan(50);
      expect(description.length, page.file).toBeLessThanOrEqual(155);
      const links = tags(html, 'link');
      const canonical = links.find((link) => attr(link, 'rel') === 'canonical');
      expect(canonical && attr(canonical, 'href')).toBe(page.url);
      expect(metaContent(html, 'og:url')).toBe(page.url);
      expect(metaContent(html, 'og:title')).toBe(title);
      expect(metaContent(html, 'twitter:title')).toBe(title);
      expect(metaContent(html, 'og:description')).toBeDefined();
      expect(metaContent(html, 'twitter:description')).toBeDefined();
      expect(metaContent(html, 'og:locale')).toBe(page.locale === 'en' ? 'en_US' : 'pt_BR');
      expect(metaContent(html, 'og:image')).toBe(`${SITE}/og.png`);
      expect(metaContent(html, 'twitter:image')).toBe(`${SITE}/og.png`);
      expect(metaContent(html, 'twitter:card')).toBe('summary_large_image');
      expect(metaContent(html, 'og:image:width')).toBe('1280');
      expect(metaContent(html, 'og:image:height')).toBe('640');
      expect(metaContent(html, 'og:image:alt')?.length, page.file).toBeGreaterThan(0);
      expect(metaContent(html, 'robots'), page.file).toBe('max-image-preview:large');
      expect(metaContent(html, 'theme-color')).toBeDefined();
      const icon = links.find((link) => attr(link, 'rel') === 'icon');
      expect(icon && attr(icon, 'type'), page.file).toBe('image/png');
      expect(icon && attr(icon, 'href'), page.file).toBe('/favicon.png');
      expect(icon && attr(icon, 'sizes'), page.file).toBe('96x96');
      expect(links.some((link) => attr(link, 'rel') === 'stylesheet')).toBe(true);
    }
  });

  test('hreflang pairs are symmetric and point to the counterpart', () => {
    for (const page of PAGES) {
      const html = read(page.file);
      const alternates = Object.fromEntries(
        tags(html, 'link')
          .filter((link) => attr(link, 'rel') === 'alternate' && attr(link, 'hreflang'))
          .map((link) => [attr(link, 'hreflang'), attr(link, 'href')]),
      );
      expect(alternates).toEqual({
        en: `${SITE}${page.pair.en}`,
        'pt-BR': `${SITE}${page.pair['pt-BR']}`,
        'x-default': `${SITE}${page.pair.en}`,
      });
      const counterpart = PAGES.find(
        (candidate) => candidate.key === page.key && candidate.locale === other(page.locale),
      );
      expect(alternates[other(page.locale)]).toBe(counterpart?.url);
    }
  });

  test('titles and descriptions are unique', () => {
    const titles = PAGES.map((page) => read(page.file).match(/<title>([^<]+)<\/title>/)?.[1]);
    expect(new Set(titles).size).toBe(PAGES.length);
    const descriptions = PAGES.map((page) => metaContent(read(page.file), 'description'));
    expect(new Set(descriptions).size).toBe(PAGES.length);
  });

  test('home keeps its title and site json-ld', () => {
    expect(read('index.html')).toContain(
      '<title>Standcast: your daily standup, written in your AI agent</title>',
    );
    expect(read('pt-BR/index.html')).toContain(
      '<title>Standcast: a daily do seu time, escrita no seu agente de IA</title>',
    );
    for (const page of pagesOf('home')) {
      const entries = jsonLd(read(page.file));
      const types = entries.map((entry) => entry['@type']);
      expect(types).toContain('Organization');
      expect(types).toContain('SoftwareApplication');
      const site = entries.find((entry) => entry['@type'] === 'WebSite');
      expect(site).toMatchObject({
        name: 'Standcast',
        url: `${SITE}/`,
        inLanguage: page.locale,
        publisher: { '@id': `${SITE}/#organization` },
      });
    }
  });

  test('every page has breadcrumb json-ld ending at itself', () => {
    for (const page of PAGES) {
      const crumbs = jsonLd(read(page.file)).find((entry) => entry['@type'] === 'BreadcrumbList') as
        | { itemListElement: { position: number; item: string; name: string }[] }
        | undefined;
      expect(crumbs, page.file).toBeDefined();
      const items = crumbs?.itemListElement ?? [];
      expect(items[0]?.item).toBe(`${SITE}${page.locale === 'en' ? '/' : '/pt-BR/'}`);
      expect(items.at(-1)?.item).toBe(page.url);
      expect(items.map((item) => item.position)).toEqual(items.map((_, index) => index + 1));
      expect(items.length).toBe(page.key === 'home' ? 1 : 2);
    }
  });

  test('markdown alternates exist for every page', () => {
    for (const page of PAGES) {
      const markdown = tags(read(page.file), 'link').find(
        (link) => attr(link, 'type') === 'text/markdown',
      );
      const href = (markdown && attr(markdown, 'href')) ?? '';
      expect(href).toBe(`${page.path}index.md`);
      const text = read(href.slice(1));
      expect(text).toStartWith('# ');
      const counterpart = page.pair[other(page.locale)];
      expect(text).toContain(`${SITE}${counterpart}index.md`);
    }
  });

  test('header and footer link every page, docs, github and the counterpart', () => {
    for (const page of PAGES) {
      const html = read(page.file);
      const header = block(html, /<header class="nav">/, '</header>');
      const footer = block(html, /<footer class="site-footer">/, '</footer>');
      const docs = page.locale === 'en' ? `${DOCS}/` : `${DOCS}/pt-BR/`;
      const local = PAGES.filter((candidate) => candidate.locale === page.locale);
      for (const area of [header, footer]) {
        const links = hrefs(area);
        for (const target of local) {
          if (area === header && FOOTER_ONLY.includes(target.key)) continue;
          expect(links, `${page.file} ${target.path}`).toContain(target.path);
        }
        expect(links).toContain(docs);
        expect(links).toContain('https://github.com/ImFelipeOliveira/standcast');
        expect(links).toContain(page.pair[other(page.locale)]);
      }
      const lang = tags(header, 'a').find((tag) => attr(tag, 'class') === 'lang') ?? '';
      expect(attr(lang, 'href')).toBe(page.pair[other(page.locale)]);
      expect(attr(lang, 'hreflang')).toBe(other(page.locale));
      expect(hrefs(footer)).toContain('/llms.txt');
      if (page.key !== 'home') {
        const current = tags(header, 'a').find((tag) => attr(tag, 'aria-current') === 'page');
        expect(current === undefined || attr(current, 'href') === page.path).toBe(true);
      }
    }
  });

  test('every footer, not found pages included, links the terms of use', () => {
    for (const file of htmlFiles()) {
      const footer = block(read(file), /<footer class="site-footer">/, '</footer>');
      const terms = file.startsWith('pt-BR/') ? '/pt-BR/termos/' : '/terms/';
      expect(hrefs(footer), file).toContain(terms);
    }
  });

  test('terms of use name the operator, the date, privacy and support', () => {
    for (const page of pagesOf('terms')) {
      const html = read(page.file);
      const main = block(html, /<main\b/, '</main>');
      const markdown = read(`${page.path.slice(1)}index.md`);
      const privacy = pagesOf('privacy').find((candidate) => candidate.locale === page.locale);
      expect(main).toContain('<time datetime="2026-11-06">');
      expect(hrefs(main)).toContain(privacy?.path ?? '');
      expect(hrefs(main)).toContain('mailto:support@standcast.app');
      expect(markdown).toContain(`${privacy?.url}index.md`);
      for (const text of [decode(main), markdown]) {
        expect(text).toContain('Felipe Oliveira');
        expect(text).toContain('MIT');
        expect(text).toContain('Google Chat');
        expect(text).toContain('support@standcast.app');
      }
    }
  });

  test('brand images are same-origin pngs of the expected size', () => {
    for (const image of BRAND_IMAGES) {
      const bytes = readFileSync(join(PUBLIC, image.file));
      expect(bytes.subarray(1, 4).toString('ascii'), image.file).toBe('PNG');
      expect(bytes.readUInt32BE(16), image.file).toBe(image.width);
      expect(bytes.readUInt32BE(20), image.file).toBe(image.height);
      expect(bytes.length, image.file).toBeLessThan(40_000);
    }
    const favicon = readFileSync(join(PUBLIC, 'favicon.png'));
    expect(favicon.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(favicon.readUInt32BE(16)).toBe(96);
    expect(favicon.readUInt32BE(20)).toBe(96);
    expect(favicon.equals(readFileSync(join(PUBLIC, 'brand/logo-96.png')))).toBe(true);
    for (const file of htmlFiles()) {
      const icon = tags(read(file), 'link').find((link) => attr(link, 'rel') === 'icon');
      expect(icon && attr(icon, 'href'), file).toBe('/favicon.png');
    }
    expect(read('_headers')).toContain("img-src 'self' data:;");
  });

  test('install.sh is the repository install script', () => {
    const script = readFileSync(join(PUBLIC, 'install.sh'), 'utf8');
    expect(script).toBe(readFileSync(join(PUBLIC, '../../../scripts/install.sh'), 'utf8'));
    expect(script.startsWith('#!/bin/sh\n')).toBe(true);
    expect(read('_headers')).toContain('Content-Type: text/x-shellscript; charset=utf-8');
  });

  test('home keeps the hero, the install command and the old anchors', () => {
    for (const page of pagesOf('home')) {
      const html = read(page.file);
      expect(html).toContain('data-copy="curl -fsSL https://standcast.app/install.sh | sh"');
      expect(html).toContain('<script src="/app.js" defer></script>');
      for (const id of ['top', 'how', 'privacy', 'pricing', 'faq', 'beta', 'beta-invalid']) {
        expect(html, `${page.file} #${id}`).toContain(` id="${id}"`);
      }
      const betaPath =
        page.pair.key === 'home' ? pagesOf('beta').find((p) => p.locale === page.locale)?.path : '';
      expect(hrefs(html)).toContain(betaPath ?? '');
      for (const key of ['how', 'privacy', 'pricing', 'faq'] as const) {
        const target = pagesOf(key).find((candidate) => candidate.locale === page.locale);
        expect(hrefs(block(html, /<main\b/, '</main>'))).toContain(target?.path ?? '');
      }
    }
  });

  test('faq json-ld lives on the faq pages and matches them', () => {
    for (const page of PAGES) {
      const html = read(page.file);
      const types = jsonLd(html).map((entry) => entry['@type']);
      expect(types.includes('FAQPage'), page.file).toBe(page.key === 'faq');
    }
    for (const page of pagesOf('faq')) {
      const html = read(page.file);
      const summaries = [...html.matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map((match) =>
        decode(match[1] ?? ''),
      );
      expect(summaries.length).toBeGreaterThanOrEqual(5);
      const faq = jsonLd(html).find((entry) => entry['@type'] === 'FAQPage') as {
        inLanguage: string;
        mainEntity: { name: string; acceptedAnswer: { text: string } }[];
      };
      expect(faq.inLanguage).toBe(page.locale);
      expect(faq.mainEntity.map((entry) => entry.name)).toEqual(summaries);
      const answers = [...html.matchAll(/<summary>[\s\S]*?<\/summary><p>([\s\S]*?)<\/p>/g)].map(
        (match) => decode(match[1] ?? ''),
      );
      expect(faq.mainEntity.map((entry) => entry.acceptedAnswer.text)).toEqual(answers);
    }
  });

  test('form posts to the api from the beta pages only', () => {
    for (const page of PAGES) {
      expect(tags(read(page.file), 'form'), page.file).toHaveLength(page.key === 'beta' ? 1 : 0);
    }
    for (const page of pagesOf('beta')) {
      const html = read(page.file);
      const form = tags(html, 'form')[0] ?? '';
      expect(attr(form, 'action')).toBe(`${API}/beta`);
      expect(attr(form, 'method')).toBe('post');
      expect(html).toContain(' id="beta"');
      const names = [...tags(html, 'input'), ...tags(html, 'select')].map((tag) =>
        attr(tag, 'name'),
      );
      for (const name of [
        'name',
        'email',
        'team_size',
        'chat',
        'tracker',
        'locale',
        'company_website',
      ]) {
        expect(names).toContain(name);
      }
      const locale = tags(html, 'input').find((tag) => attr(tag, 'name') === 'locale') ?? '';
      expect(attr(locale, 'type')).toBe('hidden');
      expect(attr(locale, 'value')).toBe(page.locale);
      const email = tags(html, 'input').find((tag) => attr(tag, 'name') === 'email') ?? '';
      expect(attr(email, 'type')).toBe('email');
      expect(email).toMatch(/\srequired[\s>]/);
      const honeypot = tags(html, 'input').find((tag) => attr(tag, 'name') === 'company_website');
      expect(honeypot && attr(honeypot, 'tabindex')).toBe('-1');
      expect(honeypot && attr(honeypot, 'autocomplete')).toBe('off');
      const options = tags(html, 'option').map((tag) => attr(tag, 'value'));
      for (const value of [
        '3-5',
        '6-15',
        '16+',
        'slack',
        'google_chat',
        'linear',
        'jira',
        'github',
        'other',
      ]) {
        expect(options).toContain(value);
      }
      expect(html).toMatch(/id="beta-invalid"/);
      expect(html).not.toMatch(/\svalue="[^"]*@/);
      const name = tags(html, 'input').find((tag) => attr(tag, 'name') === 'name') ?? '';
      expect(attr(name, 'maxlength')).toBe('120');
      expect(attr(email, 'maxlength')).toBe('254');
      for (const select of tags(html, 'select')) expect(select).toMatch(/\srequired[\s>]/);
      const honeypotAt = html.indexOf('name="company_website"');
      const wrapperAt = html.lastIndexOf('<div', honeypotAt);
      const wrapper = html.slice(wrapperAt, honeypotAt);
      expect(wrapper).toMatch(/^<div\b[^>]*\saria-hidden="true"/);
      expect(wrapper).not.toContain('</div>');
    }
  });

  test('invalid box is shown only as the target', () => {
    const css = read('styles.css').replace(/\s+/g, ' ');
    expect(css).toMatch(/\.invalid \{[^}]*display: none/);
    expect(css).toMatch(/(\.invalid|#beta-invalid):target \{[^}]*display: block/);
  });

  test('pt-BR pages link the pt-BR docs', () => {
    for (const page of PAGES.filter((candidate) => candidate.locale === 'pt-BR')) {
      const docsLinks = [
        ...read(page.file).matchAll(/href="(https:\/\/docs\.standcast\.app[^"]*)"/g),
      ].map((match) => match[1] ?? '');
      expect(docsLinks.length).toBeGreaterThan(0);
      for (const link of docsLinks) expect(link).toStartWith(`${DOCS}/pt-BR/`);
    }
  });

  test('csp allows the form and its redirect targets', () => {
    expect(read('_headers')).toContain(
      `form-action ${API} ${DOCS} ${SITE}; base-uri 'none'; frame-ancestors 'none'`,
    );
  });

  test('csp is self-only for styles, fonts and robots fetches', () => {
    const headers = read('_headers');
    expect(headers).toContain("style-src 'self';");
    expect(headers).toContain("font-src 'self';");
    expect(headers).toContain("connect-src 'self';");
    expect(headers).toContain('/fonts/*\n  Cache-Control: public, max-age=31536000, immutable');
    expect(headers).toContain('/*.md\n  Content-Type: text/markdown; charset=utf-8');
  });

  test('fonts are self-hosted and the preloaded file exists', () => {
    for (const file of htmlFiles()) {
      const html = read(file);
      expect(html).not.toContain('fonts.googleapis.com');
      expect(html).not.toContain('fonts.gstatic.com');
      const preload = tags(html, 'link').find((tag) => attr(tag, 'rel') === 'preload');
      expect(preload).toBeDefined();
      expect(attr(preload ?? '', 'as')).toBe('font');
      expect(attr(preload ?? '', 'type')).toBe('font/woff2');
      expect(preload).toContain('crossorigin');
      const href = attr(preload ?? '', 'href') ?? '';
      expect(href).toMatch(/^\/fonts\/[\w.-]+\.woff2$/);
      expect(statSync(join(PUBLIC, href)).isFile()).toBe(true);
    }
    const css = read('styles.css');
    expect(css).not.toContain('googleapis');
    const fontUrls = [...css.matchAll(/url\(["']([^"']+\.woff2)["']\)/g)].map(
      (match) => match[1] ?? '',
    );
    expect(fontUrls.length).toBeGreaterThanOrEqual(4);
    for (const path of fontUrls) {
      expect(existsSync(join(PUBLIC, path))).toBe(true);
    }
    expect(existsSync(join(PUBLIC, 'fonts/LICENSE-OFL.txt'))).toBe(true);
  });

  test('font files carry their content hash, so the immutable cache is safe', () => {
    const fonts = readdirSync(join(PUBLIC, 'fonts')).filter((name) => name.endsWith('.woff2'));
    expect(fonts.length).toBeGreaterThanOrEqual(4);
    for (const name of fonts) {
      const hash = createHash('sha256')
        .update(readFileSync(join(PUBLIC, 'fonts', name)))
        .digest('hex')
        .slice(0, 8);
      expect(name.endsWith(`.${hash}.woff2`)).toBe(true);
    }
  });

  test('copy makes no undecided promises and links the self-hosting readme', () => {
    const files = [
      ...PAGES.flatMap((page) => [page.file, `${page.path.slice(1)}index.md`]),
      'llms.txt',
    ];
    for (const file of files) {
      const text = read(file);
      for (const phrase of [
        'special terms',
        'condições especiais',
        'two working days',
        'dois dias úteis',
        '20-minute',
        '20 minutos',
        'self-hosting guide',
        'guia de self-hosting',
      ]) {
        expect(text).not.toContain(phrase);
      }
    }
    for (const page of [...pagesOf('faq'), ...pagesOf('pricing')]) {
      expect(read(page.file)).toContain(
        'href="https://github.com/ImFelipeOliveira/standcast#self-hosting"',
      );
    }
  });

  test('pricing names no price before it is announced', () => {
    for (const page of pagesOf('pricing')) {
      const main = block(read(page.file), /<main\b/, '</main>');
      const betaAt = main.indexOf('<div class="beta">');
      expect(betaAt).toBeGreaterThan(0);
      const html = main.slice(0, betaAt);
      expect(html).toMatch(/<h1\b/);
      const markdown = read(`${page.path.slice(1)}index.md`).split(/\n## (?:More|Mais)/)[0] ?? '';
      for (const text of [decode(html), markdown]) {
        expect(text.length).toBeGreaterThan(100);
        expect(text).not.toMatch(/\d/);
        expect(text).not.toMatch(/[$€£]|USD|BRL|per month|por mês|\/mo/);
      }
    }
  });

  test('no hidden-at-rest content', () => {
    const css = read('styles.css').replace(/\s+/g, '');
    const blocks: { start: number; end: number }[] = [];
    let index = css.indexOf('@media(prefers-reduced-motion:no-preference){');
    while (index !== -1) {
      let depth = 0;
      let end = index;
      for (let i = css.indexOf('{', index); i < css.length; i++) {
        if (css[i] === '{') depth++;
        if (css[i] === '}') depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
      blocks.push({ start: index, end });
      index = css.indexOf('@media(prefers-reduced-motion:no-preference){', end);
    }
    for (const match of css.matchAll(/opacity:0(?![.\d])/g)) {
      const at = match.index ?? 0;
      expect(blocks.some((block) => at > block.start && at < block.end)).toBe(true);
      const ruleStart = css.lastIndexOf('}', at);
      const open = css.lastIndexOf('{', at);
      const selector = css.slice(Math.max(ruleStart, css.lastIndexOf('{', open - 1)) + 1, open);
      expect(selector).toContain('.play');
    }
  });

  test('robots allows ai crawlers and points to the sitemap', () => {
    const robots = read('robots.txt');
    expect(robots).toMatch(/User-agent: \*\nAllow: \//);
    for (const bot of [
      'GPTBot',
      'ClaudeBot',
      'Claude-SearchBot',
      'PerplexityBot',
      'Google-Extended',
      'OAI-SearchBot',
    ]) {
      expect(robots).toMatch(new RegExp(`User-agent: ${bot}\\nAllow: /`));
    }
    expect(robots).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  });

  test('sitemap lists every page with its alternates', () => {
    const sitemap = read('sitemap.xml');
    const entries = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((match) => match[1] ?? '');
    expect(entries).toHaveLength(PAGES.length);
    for (const page of PAGES) {
      const entry = entries.find((candidate) => candidate.includes(`<loc>${page.url}</loc>`));
      expect(entry, page.url).toBeDefined();
      const alternates = Object.fromEntries(
        [
          ...(entry ?? '').matchAll(
            /<xhtml:link rel="alternate" hreflang="([^"]+)" href="([^"]+)"\/>/g,
          ),
        ].map((match) => [match[1], match[2]]),
      );
      expect(alternates).toEqual({
        en: `${SITE}${page.pair.en}`,
        'pt-BR': `${SITE}${page.pair['pt-BR']}`,
        'x-default': `${SITE}${page.pair.en}`,
      });
    }
  });

  test('llms.txt links every markdown page, docs llms and openapi', () => {
    const llms = read('llms.txt');
    expect(llms).toMatch(/^# Standcast\n\n> /);
    for (const url of [
      ...PAGES.map((page) => `${page.url}index.md`),
      `${DOCS}/llms.txt`,
      `${DOCS}/llms-full.txt`,
      `${DOCS}/pt-BR/llms.txt`,
      `${DOCS}/pt-BR/llms-full.txt`,
      `${API}/llms.txt`,
      `${API}/openapi.json`,
      `${DOCS}/admin/install`,
      `${DOCS}/admin/configuration`,
      `${DOCS}/members/mcp`,
      `${DOCS}/api/overview`,
      'https://github.com/ImFelipeOliveira/standcast/blob/main/llms.txt',
    ]) {
      expect(llms).toContain(`](${url})`);
    }
  });

  test('not found pages exist in both languages', () => {
    for (const [file, lang, home] of [
      ['404.html', 'en', '/'],
      ['pt-BR/404.html', 'pt-BR', '/pt-BR/'],
    ] as const) {
      const html = read(file);
      expect(html).toMatch(new RegExp(`<html lang="${lang}"`));
      expect(metaContent(html, 'robots')).toBe('noindex');
      expect(tags(html, 'a').some((link) => attr(link, 'href') === home)).toBe(true);
    }
    expect(decode(read('pt-BR/404.html'))).not.toMatch(/Page not found|How it works|Join the beta/);
  });

  test('internal links resolve to files and anchors', () => {
    const resolve = (ref: string) => join(PUBLIC, ref.endsWith('/') ? `${ref}index.html` : ref);
    for (const file of htmlFiles()) {
      const html = read(file);
      const refs = [...html.matchAll(/\s(?:href|src)="(\/[^"]*)"/g)].map((match) => match[1] ?? '');
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) {
        const [path = '', fragment] = ref.split('#');
        const target = resolve(path.split('?')[0] ?? '');
        expect(existsSync(target) && statSync(target).isFile(), `${file} -> ${ref}`).toBe(true);
        if (fragment)
          expect(elementIds(readFileSync(target, 'utf8')), `${file} -> ${ref}`).toContain(fragment);
      }
      const ids = elementIds(html);
      for (const match of html.matchAll(/\shref="#([^"]+)"/g)) {
        expect(ids, `${file} -> #${match[1]}`).toContain(match[1] ?? '');
      }
    }
  });

  test('markdown links to the site resolve', () => {
    const files = [...PAGES.map((page) => `${page.path.slice(1)}index.md`), 'llms.txt'];
    for (const file of files) {
      for (const match of read(file).matchAll(/\]\((https:\/\/standcast\.app[^)]*)\)/g)) {
        const path = (match[1] ?? '').slice(SITE.length).split('#')[0] ?? '';
        const target = join(PUBLIC, path.endsWith('/') ? `${path}index.html` : path);
        expect(existsSync(target), `${file} -> ${match[1]}`).toBe(true);
      }
    }
  });
});

const HOME_SECTIONS = [
  'how',
  'features',
  'ways',
  'integrations',
  'privacy',
  'config',
  'pricing',
  'faq',
  'beta',
] as const;

const LIGHT = {
  '--bg': '#ffffff',
  '--surface': '#f4f4f5',
  '--text': '#18181b',
  '--text2': '#3f3f46',
  '--muted': '#5b5b66',
  '--divider': '#e7e7ea',
  '--control': '#8a8a96',
  '--ink': '#18181b',
  '--accent-text': '#3446c2',
  '--mark': '#3b4bc8',
};

const DARK = {
  '--bg': '#0e0e10',
  '--surface': '#18181b',
  '--text': '#ededef',
  '--text2': '#c9c9cf',
  '--muted': '#a1a1aa',
  '--divider': '#2a2a30',
  '--control': '#6e6e78',
  '--ink': '#ededef',
  '--accent-text': '#a5aff7',
  '--mark': '#8e9af5',
};

function headingLevels(html: string): number[] {
  return [...html.matchAll(/<h([1-6])\b/g)].map((match) => Number(match[1]));
}

function sectionIds(html: string): string[] {
  const main = block(html, /<main\b/, '</main>');
  return [...main.matchAll(/<section\b[^>]*\sid="([^"]+)"/g)].map((match) => match[1] ?? '');
}

function cssBlock(css: string, selector: string): string {
  const at = css.indexOf(`${selector} {`);
  if (at === -1) return '';
  return css.slice(at, css.indexOf('}', at));
}

function mediaBlock(css: string, query: string): string {
  const start = css.indexOf(`@media ${query} {`);
  if (start === -1) return '';
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1);
  }
  return '';
}

describe('landing v2', () => {
  test('every page opens with a skip link to the main landmark', () => {
    for (const file of htmlFiles()) {
      const html = read(file);
      const body = html.slice(html.indexOf('<body>'));
      const first = tags(body, 'a')[0] ?? '';
      expect(attr(first, 'class'), file).toBe('skip');
      expect(attr(first, 'href'), file).toBe('#top');
      expect(
        tags(html, 'main').some((tag) => attr(tag, 'id') === 'top'),
        file,
      ).toBe(true);
      expect(html, file).toContain('<header class="nav">');
      expect(html, file).toContain('<footer class="site-footer">');
      const label = decode(block(body, /<a class="skip"/, '</a>'));
      expect(label, file).toBe(
        file.startsWith('pt-BR/') ? 'Pular para o conteúdo' : 'Skip to content',
      );
    }
  });

  test('every page has one h1 and headings never skip a level', () => {
    for (const file of htmlFiles()) {
      const levels = headingLevels(read(file));
      expect(
        levels.filter((level) => level === 1),
        file,
      ).toHaveLength(1);
      expect(levels[0], file).toBe(1);
      for (let i = 1; i < levels.length; i++) {
        expect((levels[i] ?? 0) - (levels[i - 1] ?? 0), `${file} heading ${i}`).toBeLessThanOrEqual(
          1,
        );
      }
    }
  });

  test('both home pages have the same sections in the same order', () => {
    for (const page of pagesOf('home')) {
      expect(sectionIds(read(page.file)), page.file).toEqual([...HOME_SECTIONS]);
    }
  });

  test('home faq uses details and links the faq page', () => {
    for (const page of pagesOf('home')) {
      const faq = block(read(page.file), /<section\b[^>]*\sid="faq"/, '</section>');
      const summaries = [...faq.matchAll(/<details\b[^>]*><summary>([\s\S]*?)<\/summary>/g)];
      expect(summaries.length, page.file).toBeGreaterThanOrEqual(5);
      const target = pagesOf('faq').find((candidate) => candidate.locale === page.locale);
      expect(hrefs(faq)).toContain(target?.path ?? '');
    }
  });

  test('home hero has a decorative pixel field and a hidden pause button', () => {
    for (const page of pagesOf('home')) {
      const html = read(page.file);
      const canvases = tags(html, 'canvas');
      expect(canvases, page.file).toHaveLength(1);
      expect(attr(canvases[0] ?? '', 'class')).toBe('field');
      expect(attr(canvases[0] ?? '', 'aria-hidden')).toBe('true');
      const toggle =
        tags(html, 'button').find((tag) => attr(tag, 'class') === 'field-toggle') ?? '';
      expect(attr(toggle, 'type')).toBe('button');
      expect(attr(toggle, 'aria-pressed')).toBe('false');
      expect(toggle).toMatch(/\shidden[\s>]/);
      const label = decode(block(html, /<button class="field-toggle"/, '</button>'));
      expect(label).toBe(page.locale === 'en' ? 'Pause animation' : 'Pausar animação');
    }
  });

  test('no page loads the webgl wave', () => {
    for (const file of htmlFiles()) {
      expect(read(file), file).not.toContain('hero-field');
    }
    const script = read('app.js');
    for (const word of ['webgl', 'gl_FragColor', 'precision mediump']) {
      expect(script).not.toContain(word);
    }
  });

  test('pixel field is capped at 30 fps and stops when it cannot be seen', () => {
    const script = read('app.js');
    for (const piece of [
      "getContext('2d')",
      '1000 / 30',
      'IntersectionObserver',
      'visibilitychange',
      'document.hidden',
      'prefers-reduced-motion: reduce',
      'aria-pressed',
      'cancelAnimationFrame',
    ]) {
      expect(script).toContain(piece);
    }
  });

  test('styles define the measured palette in both themes', () => {
    const css = read('styles.css').toLowerCase();
    const light = cssBlock(css, ':root');
    const dark = cssBlock(css, ':root[data-theme="dark"]');
    const media = cssBlock(css, '  :root:not([data-theme="light"])');
    for (const [name, value] of Object.entries(LIGHT)) {
      expect(light, name).toContain(`${name}: ${value};`);
    }
    for (const [name, value] of Object.entries(DARK)) {
      expect(dark, name).toContain(`${name}: ${value};`);
      expect(media, name).toContain(`${name}: ${value};`);
    }
    expect(cssBlock(css, ':focus-visible')).toContain('outline: 2px solid');
    expect(css).toContain('@media (forced-colors: active)');
  });

  test('theme color follows the new background', () => {
    for (const file of htmlFiles()) {
      const metas = tags(read(file), 'meta').filter((tag) => attr(tag, 'name') === 'theme-color');
      expect(
        metas.map((tag) => attr(tag, 'content')),
        file,
      ).toEqual(['#FFFFFF', '#0E0E10']);
    }
  });

  test('ways to write read without javascript and enhance into tabs', () => {
    for (const page of pagesOf('home')) {
      const ways = block(read(page.file), /<section\b[^>]*\sid="ways"/, '</section>');
      const list = tags(ways, 'div').find((tag) => attr(tag, 'role') === 'tablist') ?? '';
      expect(list, page.file).toMatch(/\shidden[\s>]/);
      const tabs = tags(ways, 'button').filter((tag) => attr(tag, 'role') === 'tab');
      const panels = tags(ways, 'div').filter((tag) => attr(tag, 'role') === 'tabpanel');
      expect(tabs).toHaveLength(3);
      expect(panels).toHaveLength(3);
      tabs.forEach((tab, index) => {
        const panel = panels[index] ?? '';
        expect(attr(tab, 'aria-controls')).toBe(attr(panel, 'id'));
        expect(attr(panel, 'aria-labelledby')).toBe(attr(tab, 'id'));
        expect(attr(tab, 'aria-selected')).toBe(index === 0 ? 'true' : 'false');
        expect(panel).not.toMatch(/\shidden[\s>]/);
      });
      expect(headingLevels(ways).filter((level) => level === 3)).toHaveLength(3);
    }
  });

  test('wordmark font is self-hosted', () => {
    const css = read('styles.css');
    expect(css).toContain('font-family: "Saira"');
    expect(css).toContain('url("/fonts/saira-700-latin.3ea7fb14.woff2")');
  });

  test('home illustration is one labelled image without a replay button', () => {
    for (const page of pagesOf('home')) {
      const html = read(page.file);
      const stage = tags(html, 'div').find((tag) => attr(tag, 'class') === 'stage') ?? '';
      expect(attr(stage, 'role')).toBe('img');
      expect(attr(stage, 'aria-label')?.length).toBeGreaterThan(40);
      expect(html).not.toContain('id="replay"');
    }
  });

  test('configuration names .github-private first and .github as the fallback', () => {
    for (const page of [...pagesOf('home'), ...pagesOf('how')]) {
      const markdown = read(`${page.path.slice(1)}index.md`);
      const config =
        markdown.split(/\n## /).find((part) => /^Configura(?:tion|ção)/.test(part)) ?? '';
      const html = decode(block(read(page.file), /<section\b[^>]*\sid="config"/, '</section>'));
      for (const text of [html, config]) {
        const privateAt = text.indexOf('.github-private');
        expect(privateAt, page.file).toBeGreaterThanOrEqual(0);
        expect(text.indexOf('.github'), page.file).toBe(privateAt);
        expect(text.slice(privateAt + 1), page.file).toMatch(/\.github(?!-private)/);
      }
    }
  });

  test('footer columns shrink to a phone instead of widening the page', () => {
    const css = read('styles.css');
    const footer = cssBlock(css, '.foot-nav');
    expect(footer).toContain('min-width: 0;');
    expect(footer).toContain('minmax(min(160px, 100%), 1fr)');
  });

  test('header keeps the beta button inside a 320px phone', () => {
    const css = read('styles.css');
    const tablet = mediaBlock(css, '(max-width: 960px)');
    expect(cssBlock(tablet, '  .nav nav')).toContain('display: none;');
    const phone = mediaBlock(css, '(max-width: 640px)');
    const wrap = cssBlock(phone, '  .nav .wrap');
    expect(wrap).toContain('gap: 12px;');
    expect(wrap).toContain('max(16px, env(safe-area-inset-left, 0px))');
    expect(cssBlock(phone, '  .nav-end')).toContain('gap: 4px;');
    expect(cssBlock(phone, '  .nav .wordmark')).toContain('font-size: 17px;');
    const narrow = mediaBlock(css, '(max-width: 359px)');
    expect(cssBlock(narrow, '  .nav .wordmark')).toContain('display: none;');
  });
});
