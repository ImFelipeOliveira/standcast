import { beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contrast } from './docs-contrast';
import { fullGitHistory, gitRunner } from './docs-git';
import {
  displayPath,
  docPages,
  ogCard,
  ogHash,
  ogImagePath,
  pageTitle,
  requireOgImage,
  templateDigest,
  textDigest,
} from './docs-og';

const ROOT = join(import.meta.dir, '..');
const SITE = join(ROOT, 'docs/site');
const PUBLIC = join(SITE, 'public');

function pngSize(buffer: Buffer): { width: number; height: number } {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true });
  return entries
    .map((entry) => String(entry).split('\\').join('/'))
    .filter((e) => e.endsWith('.png'));
}

describe('og card', () => {
  test('title comes from frontmatter, then the first h1, without markdown', () => {
    expect(pageTitle('---\ntitle: API overview\n---\n\n# Something else\n')).toBe('API overview');
    expect(pageTitle('Intro\n\n# `standcast.yml` [reference](/x)\n')).toBe(
      'standcast.yml reference',
    );
    expect(pageTitle('---\noutline: [2, 3]\n---\n\n# Changelog\n')).toBe('Changelog');
  });

  test('Windows line endings give the same title', () => {
    expect(pageTitle('---\r\ntitle: API overview\r\n---\r\n\r\n# Something else\r\n')).toBe(
      'API overview',
    );
    expect(pageTitle('# Changelog\r\n\r\nText\r\n')).toBe('Changelog');
  });

  test('display path drops index and the md extension', () => {
    expect(displayPath('index.md')).toBe('docs.standcast.app');
    expect(displayPath('pt-BR/index.md')).toBe('docs.standcast.app/pt-BR');
    expect(displayPath('pt-BR/admin/install.md')).toBe('docs.standcast.app/pt-BR/admin/install');
  });

  test('home pages are titled as the documentation', () => {
    expect(ogCard('index.md', '# Standcast\n').title).toBe('Standcast documentation');
    expect(ogCard('pt-BR/index.md', '# Standcast\n').title).toBe('Documentação do Standcast');
  });

  test('card carries section, title and path', () => {
    expect(ogCard('pt-BR/members/cli.md', '# CLI\n')).toEqual({
      section: 'MEMBROS',
      title: 'CLI',
      path: 'docs.standcast.app/pt-BR/members/cli',
    });
  });

  test('hash is stable and changes with the card or the template', () => {
    const card = { section: 'ADMIN', title: 'Install', path: 'docs.standcast.app/admin/install' };
    expect(ogHash(card, 'a')).toBe(ogHash({ ...card }, 'a'));
    expect(ogHash(card, 'a')).not.toBe(ogHash({ ...card, title: 'Setup' }, 'a'));
    expect(ogHash(card, 'a')).not.toBe(ogHash(card, 'b'));
    expect(ogHash(card, 'a')).toMatch(/^[0-9a-f]{10}$/);
  });

  test('image path mirrors the page path', () => {
    const card = { section: 'ADMIN', title: 'Install', path: 'docs.standcast.app/admin/install' };
    expect(ogImagePath('pt-BR/admin/install.md', card, 'a')).toBe(
      `og/pt-BR/admin/install.${ogHash(card, 'a')}.png`,
    );
    expect(ogImagePath('index.md', card, 'a')).toBe(`og/index.${ogHash(card, 'a')}.png`);
  });
});

describe('template digest', () => {
  test('is the same for a checkout with Windows line endings', () => {
    const template = '<h1 data-slot="title">x</h1>\n<p>y</p>\n';
    const fonts = '@font-face {\n  font-family: Inter;\n}\n';
    expect(textDigest(template.replaceAll('\n', '\r\n'), fonts.replaceAll('\n', '\r\n'))).toBe(
      textDigest(template, fonts),
    );
    expect(textDigest(`${template}<b>z</b>`, fonts)).not.toBe(textDigest(template, fonts));
  });
});

describe('missing og image', () => {
  test('fails with the commands that render and commit it', async () => {
    const site = await mkdtemp(join(tmpdir(), 'standcast-og-site-'));
    try {
      await mkdir(join(site, 'admin'), { recursive: true });
      await writeFile(join(site, 'admin/install.md'), '# Install\n');
      const error = await requireOgImage(site, 'admin/install.md', 'digest').catch((e) => e);
      expect(error).toBeInstanceOf(Error);
      const message = String(error.message);
      expect(message).toContain('admin/install.md');
      expect(message).toMatch(/og\/admin\/install\.[0-9a-f]{10}\.png/);
      expect(message).toContain('bunx playwright install chromium');
      expect(message).toContain('bun run docs:og');
      expect(message).toContain('docs/site/public/og');
    } finally {
      await rm(site, { recursive: true, force: true });
    }
  });

  test('returns the card and image when the image is committed', async () => {
    const site = await mkdtemp(join(tmpdir(), 'standcast-og-site-'));
    try {
      await mkdir(join(site, 'admin'), { recursive: true });
      await writeFile(join(site, 'admin/install.md'), '# Install\n');
      const card = ogCard('admin/install.md', '# Install\n');
      const image = ogImagePath('admin/install.md', card, 'digest');
      await mkdir(join(site, 'public/og/admin'), { recursive: true });
      await writeFile(join(site, 'public', image), '');
      expect(await requireOgImage(site, 'admin/install.md', 'digest')).toEqual({ card, image });
    } finally {
      await rm(site, { recursive: true, force: true });
    }
  });
});

describe('committed og images', () => {
  test('every page has a fresh 1200x630 image and no stale image is left', async () => {
    const digest = await templateDigest();
    const expected: string[] = [];
    for (const page of await docPages(SITE)) {
      const markdown = await readFile(join(SITE, page), 'utf8');
      const image = ogImagePath(page, ogCard(page, markdown), digest);
      expected.push(image);
      const buffer = await readFile(join(PUBLIC, image)).catch(() => null);
      expect({ page, image, exists: buffer !== null }).toEqual({ page, image, exists: true });
      if (buffer !== null) expect(pngSize(buffer)).toEqual({ width: 1200, height: 630 });
    }
    const committed = (await listFiles(join(PUBLIC, 'og'))).map((file) => `og/${file}`);
    expect(committed.sort()).toEqual(expected.sort());
  });
});

describe('built site', () => {
  let outDir = '';

  beforeAll(async () => {
    outDir = join(await mkdtemp(join(tmpdir(), 'standcast-og-')), 'dist');
    const build = Bun.spawnSync(['bun', 'run', 'docs:build', '--outDir', outDir], {
      cwd: ROOT,
      env: { ...process.env, SUPPORT_EMAIL: 'test@example.com', DOCS_FETCH_HISTORY: 'false' },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (build.exitCode !== 0) throw new Error(build.stderr.toString() + build.stdout.toString());
  }, 120_000);

  test('every page points og:image and twitter:image at its own image', async () => {
    const digest = await templateDigest();
    for (const page of await docPages(SITE)) {
      const markdown = await readFile(join(SITE, page), 'utf8');
      const image = `https://docs.standcast.app/${ogImagePath(page, ogCard(page, markdown), digest)}`;
      const html = await readFile(join(outDir, page.replace(/\.md$/, '.html')), 'utf8');
      expect({ page, og: html.includes(`property="og:image" content="${image}"`) }).toEqual({
        page,
        og: true,
      });
      expect({ page, twitter: html.includes(`name="twitter:image" content="${image}"`) }).toEqual({
        page,
        twitter: true,
      });
      expect(html.match(/property="og:image"/g)?.length).toBe(1);
      expect(html).toContain('property="og:image:width" content="1200"');
      expect(html).toContain('property="og:image:height" content="630"');
    }
  });

  test('pages show the edit link, last updated and local search', async () => {
    const html = await readFile(join(outDir, 'pt-BR/admin/install.html'), 'utf8');
    expect(html).toContain('Pular para o conteúdo');
    expect(html).toContain('Buscar');
    expect(html).toContain(
      'href="https://github.com/ImFelipeOliveira/standcast/edit/main/docs/site/pt-BR/admin/install.md"',
    );
    expect(html).toContain('Editar esta página no GitHub');
    if (fullGitHistory(gitRunner(ROOT), { fetch: false })) {
      expect(html).toMatch(/class="VPLastUpdated"[^>]*>Atualizado em: <time datetime="\d{4}-/);
    } else {
      expect(html).not.toContain('class="VPLastUpdated"');
    }
  });

  test('every highlighted token reaches 4.5:1 on the code background', async () => {
    const css = await readFile(join(SITE, '.vitepress/theme/brand.css'), 'utf8');
    const light = css.match(/:root\s*\{[^}]*--vp-code-block-bg:\s*(#[0-9A-Fa-f]{6})/)?.[1] ?? '';
    const dark = css.match(/\.dark\s*\{[^}]*--vp-code-block-bg:\s*(#[0-9A-Fa-f]{6})/)?.[1] ?? '';
    const files = (await readdir(outDir, { recursive: true }))
      .map(String)
      .filter((file) => file.endsWith('.html'));
    const failures = new Set<string>();
    const checked = { light: 0, dark: 0 };
    for (const file of files) {
      const html = await readFile(join(outDir, file), 'utf8');
      for (const match of html.matchAll(/--shiki-(light|dark):(#[0-9A-Fa-f]{6})/g)) {
        const theme = match[1] === 'light' ? 'light' : 'dark';
        checked[theme] += 1;
        const bg = theme === 'light' ? light : dark;
        if (contrast(match[2] ?? '', bg) < 4.5) failures.add(`${theme} ${match[2]}`);
      }
    }
    expect(checked.light).toBeGreaterThan(0);
    expect(checked.dark).toBeGreaterThan(0);
    expect([...failures]).toEqual([]);
  });
});
