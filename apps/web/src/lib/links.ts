import type { Lang } from '../i18n';

export const DOCS_URL = 'https://docs-standcast.usefachada.dev';
export const INSTALL_URL = 'https://github.com/apps/standcast/installations/new';

export function docsUrl(lang: Lang): string {
  return lang === 'pt-BR' ? `${DOCS_URL}/pt-BR/` : `${DOCS_URL}/`;
}
