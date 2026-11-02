import type { MessageKey } from '../i18n';

export const SECTIONS = ['hoje', 'historico', 'configuracao'] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_PATHS = {
  hoje: '/orgs/$installationId/hoje',
  historico: '/orgs/$installationId/historico',
  configuracao: '/orgs/$installationId/configuracao',
} as const satisfies Record<Section, string>;

export const SECTION_LABELS = {
  hoje: 'nav.today',
  historico: 'nav.history',
  configuracao: 'nav.setup',
} as const satisfies Record<Section, MessageKey>;

export const SOON_SECTIONS: ReadonlySet<Section> = new Set<Section>(['historico']);

export function sectionOf(pathname: string): Section {
  const last = pathname.replace(/\/+$/, '').split('/').pop() ?? '';
  return (SECTIONS as readonly string[]).includes(last) ? (last as Section) : 'configuracao';
}
