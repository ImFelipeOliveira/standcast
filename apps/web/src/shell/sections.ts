import type { MessageKey } from '../i18n';

export const SECTIONS = ['today', 'blockers', 'history', 'settings'] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_PATHS = {
  today: '/orgs/$installationId/today',
  blockers: '/orgs/$installationId/blockers',
  history: '/orgs/$installationId/history',
  settings: '/orgs/$installationId/settings',
} as const satisfies Record<Section, string>;

export const SECTION_LABELS = {
  today: 'nav.today',
  blockers: 'nav.blockers',
  history: 'nav.history',
  settings: 'nav.setup',
} as const satisfies Record<Section, MessageKey>;

export const SOON_SECTIONS: ReadonlySet<Section> = new Set<Section>(['history']);

export function sectionOf(pathname: string): Section {
  const last = pathname.replace(/\/+$/, '').split('/').pop() ?? '';
  return (SECTIONS as readonly string[]).includes(last) ? (last as Section) : 'settings';
}
