import type { DefaultTheme } from 'vitepress';

export type DocsLocale = 'en' | 'pt-BR';

type Localized = Record<DocsLocale, string>;

type Entry = { page: string; text: Localized } | { external: 'apiReference'; text: Localized };

type Section = { text: Localized; og: Localized; items: Entry[] };

export const EDIT_LINK_PATTERN =
  'https://github.com/ImFelipeOliveira/standcast/edit/main/docs/site/:path';

const same = (text: string): Localized => ({ en: text, 'pt-BR': text });

const SECTIONS: Section[] = [
  {
    text: { en: 'Getting started', 'pt-BR': 'Primeiros passos' },
    og: same('DOCS'),
    items: [
      { page: 'index', text: { en: 'Overview', 'pt-BR': 'Visão geral' } },
      { page: 'how-it-works', text: { en: 'How it works', 'pt-BR': 'Como funciona' } },
      { page: 'concepts', text: { en: 'Concepts', 'pt-BR': 'Conceitos' } },
      { page: 'integrations', text: { en: 'Integrations', 'pt-BR': 'Integrações' } },
    ],
  },
  {
    text: { en: 'Members', 'pt-BR': 'Membros' },
    og: { en: 'MEMBERS', 'pt-BR': 'MEMBROS' },
    items: [
      {
        page: 'members/getting-started',
        text: { en: 'Write your first daily', 'pt-BR': 'Escreva sua primeira daily' },
      },
      {
        page: 'members/claude-code',
        text: { en: 'Claude Code skill', 'pt-BR': 'Skill do Claude Code' },
      },
      { page: 'members/mcp', text: { en: 'MCP server', 'pt-BR': 'Servidor MCP' } },
      { page: 'members/cli', text: same('CLI') },
    ],
  },
  {
    text: same('Admin'),
    og: same('ADMIN'),
    items: [
      { page: 'admin/install', text: { en: 'Install', 'pt-BR': 'Instalação' } },
      { page: 'admin/web-app', text: { en: 'Web app', 'pt-BR': 'App web' } },
      {
        page: 'admin/configuration',
        text: { en: 'standcast.yml reference', 'pt-BR': 'Referência do standcast.yml' },
      },
      { page: 'admin/slack', text: same('Slack') },
      { page: 'admin/google-chat', text: same('Google Chat') },
      { page: 'admin/api-keys', text: same('API keys') },
      { page: 'admin/webhooks', text: same('Webhooks') },
    ],
  },
  {
    text: same('API'),
    og: same('API'),
    items: [
      { page: 'api/overview', text: { en: 'Overview', 'pt-BR': 'Visão geral' } },
      { page: 'api/webhooks', text: same('Webhooks') },
      { external: 'apiReference', text: { en: 'API reference', 'pt-BR': 'Referência da API' } },
    ],
  },
  {
    text: { en: 'Reference', 'pt-BR': 'Referência' },
    og: same('DOCS'),
    items: [
      { page: 'faq', text: same('FAQ') },
      { page: 'troubleshooting', text: { en: 'Troubleshooting', 'pt-BR': 'Solução de problemas' } },
      { page: 'privacy', text: { en: 'Privacy', 'pt-BR': 'Privacidade' } },
      { page: 'changelog', text: same('Changelog') },
    ],
  },
];

const OG_OVERRIDES: Record<string, string> = { changelog: 'CHANGELOG' };

function prefix(locale: DocsLocale): string {
  return locale === 'pt-BR' ? '/pt-BR' : '';
}

function pageLink(locale: DocsLocale, page: string): string {
  return `${prefix(locale)}/${page === 'index' ? '' : page}`;
}

export function sidebar(locale: DocsLocale, apiReference: string): DefaultTheme.SidebarItem[] {
  return SECTIONS.map((section) => ({
    text: section.text[locale],
    items: section.items.map((entry) =>
      'page' in entry
        ? { text: entry.text[locale], link: pageLink(locale, entry.page) }
        : { text: entry.text[locale], link: apiReference, target: '_self' },
    ),
  }));
}

export function pageLocale(relativePath: string): DocsLocale {
  return relativePath.startsWith('pt-BR/') ? 'pt-BR' : 'en';
}

export function pageSection(relativePath: string): string {
  const locale = pageLocale(relativePath);
  const page = relativePath.replace(/^pt-BR\//, '').replace(/\.md$/, '');
  const override = OG_OVERRIDES[page];
  if (override !== undefined) return override;
  const section = SECTIONS.find((s) => s.items.some((e) => 'page' in e && e.page === page));
  if (section === undefined) throw new Error(`${relativePath} is not in the docs sidebar`);
  return section.og[locale];
}

export function searchConfig(): DefaultTheme.Config['search'] & { provider: 'local' } {
  return {
    provider: 'local',
    options: {
      locales: {
        'pt-BR': {
          translations: {
            button: { buttonText: 'Buscar', buttonAriaLabel: 'Buscar na documentação' },
            modal: {
              displayDetails: 'Mostrar detalhes',
              resetButtonTitle: 'Limpar busca',
              backButtonTitle: 'Fechar busca',
              noResultsText: 'Nenhum resultado para',
              footer: {
                selectText: 'selecionar',
                selectKeyAriaLabel: 'Enter',
                navigateText: 'navegar',
                navigateUpKeyAriaLabel: 'Seta para cima',
                navigateDownKeyAriaLabel: 'Seta para baixo',
                closeText: 'fechar',
                closeKeyAriaLabel: 'Esc',
              },
            },
          },
        },
      },
    },
  };
}

const LABELS = {
  en: {
    apiReference: 'API reference',
    outline: 'On this page',
    prev: 'Previous',
    next: 'Next',
    editLink: 'Edit this page on GitHub',
    lastUpdated: 'Last updated',
  },
  'pt-BR': {
    apiReference: 'Referência da API',
    outline: 'Nesta página',
    prev: 'Anterior',
    next: 'Próxima',
    editLink: 'Editar esta página no GitHub',
    lastUpdated: 'Atualizado em',
  },
} as const;

const PT_BR_ONLY: DefaultTheme.Config = {
  darkModeSwitchLabel: 'Aparência',
  darkModeSwitchTitle: 'Mudar para o tema escuro',
  lightModeSwitchTitle: 'Mudar para o tema claro',
  sidebarMenuLabel: 'Menu',
  returnToTopLabel: 'Voltar ao topo',
  langMenuLabel: 'Idioma',
  skipToContentLabel: 'Pular para o conteúdo',
  notFound: {
    title: 'PÁGINA NÃO ENCONTRADA',
    quote: 'Esta página não existe.',
    linkLabel: 'Ir para o início',
    linkText: 'Voltar ao início',
  },
};

export function localeThemeConfig(locale: DocsLocale, apiReference: string): DefaultTheme.Config {
  const labels = LABELS[locale];
  return {
    nav: [
      { text: 'Docs', link: pageLink(locale, 'index') },
      { text: labels.apiReference, link: apiReference, target: '_self' },
    ],
    sidebar: sidebar(locale, apiReference),
    outline: { level: [2, 3], label: labels.outline },
    docFooter: { prev: labels.prev, next: labels.next },
    editLink: { pattern: EDIT_LINK_PATTERN, text: labels.editLink },
    lastUpdated: {
      text: labels.lastUpdated,
      formatOptions: { dateStyle: 'medium', forceLocale: true },
    },
    ...(locale === 'pt-BR' ? PT_BR_ONLY : {}),
  };
}

export function sharedThemeConfig(): DefaultTheme.Config {
  return {
    logo: '/logo.svg',
    siteTitle: 'Standcast',
    externalLinkIcon: true,
    socialLinks: [{ icon: 'github', link: 'https://github.com/ImFelipeOliveira/standcast' }],
    search: searchConfig(),
  };
}
