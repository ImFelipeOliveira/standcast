import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type DefaultTheme, defineConfigWithTheme } from 'vitepress';
import llmstxt from 'vitepress-plugin-llms';
import { codeBackgrounds, shikiContrastTransformer } from '../../../scripts/docs-contrast';
import { fullGitHistory, gitRunner } from '../../../scripts/docs-git';
import { writeSiteHeaders } from '../../../scripts/docs-headers';
import { writeLocaleLlms } from '../../../scripts/docs-llms';
import { OG_HEIGHT, OG_WIDTH, requireOgImage, templateDigest } from '../../../scripts/docs-og';
import { publicUrlPlugin, resolvePublicUrl } from '../../../scripts/docs-public-url';
import { localeThemeConfig, sharedThemeConfig } from '../../../scripts/docs-theme-config';

const supportEmail = process.env.SUPPORT_EMAIL?.trim();
if (!supportEmail) {
  throw new Error('SUPPORT_EMAIL must be set to build the documentation site');
}

const publicUrl = resolvePublicUrl(process.env.STANDCAST_PUBLIC_URL?.trim());

type ThemeConfig = DefaultTheme.Config & { supportEmail: string };

const DOCS_DOMAIN = 'https://docs.standcast.app';

function pageUrl(relativePath: string): string {
  const path = relativePath.replace(/\.md$/, '').replace(/(^|\/)index$/, '$1');
  return `${DOCS_DOMAIN}/${path}`;
}

const API_REFERENCE = `${publicUrl}/reference`;

const codeContrast = shikiContrastTransformer(
  codeBackgrounds(readFileSync(fileURLToPath(new URL('./theme/brand.css', import.meta.url)), 'utf8')),
);

const ogDigest = await templateDigest();

const lastUpdated = fullGitHistory(gitRunner(fileURLToPath(new URL('.', import.meta.url))), {
  fetch: process.env.DOCS_FETCH_HISTORY !== 'false',
});
if (!lastUpdated) {
  console.warn('docs: the git history is shallow or missing, so pages leave out the last updated date');
}

export default defineConfigWithTheme<ThemeConfig>({
  title: 'Standcast',
  base: '/',
  srcExclude: ['README.md'],
  lastUpdated,
  cleanUrls: true,
  sitemap: { hostname: DOCS_DOMAIN },
  ignoreDeadLinks: false,
  buildEnd: async (siteConfig) => {
    await writeLocaleLlms(siteConfig.outDir, DOCS_DOMAIN);
    await writeSiteHeaders(siteConfig.outDir);
  },
  vite: {
    plugins: [
      llmstxt({
        domain: DOCS_DOMAIN,
        injectLLMHint: false,
        ignoreFiles: ['pt-BR/index.md'],
        ignoreFilesPerOutput: { llmsTxt: ['pt-BR/**'], llmsFullTxt: ['pt-BR/**'] },
        customLLMsTxtTemplate: `# {title}\n\n> Standcast orchestrates your team's daily standup: each person writes it with their AI agent (Claude Code, Cursor, MCP or CLI) from GitHub and Linear activity, confirms it, and Standcast posts one digest per team to Slack or Google Chat. Jira, ClickUp, Asana, GitHub Projects, Microsoft Teams and Discord are not connected yet.\n\n## Table of Contents\n\n{toc}\n\n## Optional\n\n- [Português (Brasil)](${DOCS_DOMAIN}/pt-BR/llms.txt): the documentation in Portuguese\n`,
      }),
    ],
  },
  markdown: {
    codeTransformers: [codeContrast],
    config: (md) => {
      publicUrlPlugin(publicUrl)(md);
    },
  },
  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/favicon.png', sizes: '96x96' }],
    ['meta', { name: 'robots', content: 'max-image-preview:large' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'Standcast' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
  ],
  transformHead: async ({ pageData, siteConfig }) => {
    if (!existsSync(join(siteConfig.srcDir, pageData.relativePath))) return [];
    const { card, image } = await requireOgImage(
      siteConfig.srcDir,
      pageData.relativePath,
      ogDigest,
    );
    const url = `${DOCS_DOMAIN}/${image}`;
    return [
      ['meta', { property: 'og:image', content: url }],
      ['meta', { property: 'og:image:width', content: String(OG_WIDTH) }],
      ['meta', { property: 'og:image:height', content: String(OG_HEIGHT) }],
      ['meta', { property: 'og:image:alt', content: `${card.title} | Standcast` }],
      ['meta', { name: 'twitter:image', content: url }],
    ];
  },
  transformPageData: (pageData, { siteConfig }) => {
    const locale = pageData.relativePath.startsWith('pt-BR/') ? 'pt-BR' : 'root';
    const localeConfig = siteConfig.site.locales[locale];
    const title = pageData.frontmatter.layout === 'home' || !pageData.title
      ? 'Standcast'
      : `${pageData.title} | Standcast`;
    const description = pageData.description || localeConfig?.description || '';
    const head = (pageData.frontmatter.head ??= []);
    head.push(
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { property: 'og:url', content: pageUrl(pageData.relativePath) }],
      ['meta', { property: 'og:locale', content: locale === 'pt-BR' ? 'pt_BR' : 'en_US' }],
    );
  },
  locales: {
    root: {
      label: 'English',
      lang: 'en',
      description: 'Standcast orchestrates your team daily standup from GitHub to Slack or Google Chat.',
      themeConfig: localeThemeConfig('en', API_REFERENCE),
    },
    'pt-BR': {
      label: 'Português (Brasil)',
      lang: 'pt-BR',
      link: '/pt-BR/',
      description: 'O Standcast orquestra a daily do seu time, do GitHub ao Slack ou ao Google Chat.',
      themeConfig: localeThemeConfig('pt-BR', API_REFERENCE),
    },
  },
  themeConfig: {
    supportEmail,
    ...sharedThemeConfig(),
  },
});
