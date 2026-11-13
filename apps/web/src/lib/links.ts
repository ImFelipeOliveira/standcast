import type { Lang } from '../i18n';

export const DOCS_URL = 'https://docs.standcast.app';
export const INSTALL_URL = 'https://github.com/apps/standcast/installations/new';

export function docsUrl(lang: Lang): string {
  return lang === 'pt-BR' ? `${DOCS_URL}/pt-BR/` : `${DOCS_URL}/`;
}

export const LANDING_URL = 'https://standcast.app';
export const SUPPORT_EMAIL = 'support@standcast.app';

export function termsUrl(lang: Lang): string {
  return lang === 'pt-BR' ? `${LANDING_URL}/pt-BR/termos/` : `${LANDING_URL}/terms/`;
}

export function privacyUrl(lang: Lang): string {
  return lang === 'pt-BR' ? `${LANDING_URL}/pt-BR/privacidade/` : `${LANDING_URL}/privacy/`;
}
