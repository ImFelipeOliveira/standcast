import type { MessageKey } from '../i18n';

export const SECTIONS = ['today', 'blockers', 'history', 'settings'] as const;
export type Section = (typeof SECTIONS)[number];
export type ShellPage = Section | 'account';

export const SECTION_PATHS = {
  today: '/orgs/$installationId/today',
  blockers: '/orgs/$installationId/blockers',
  history: '/orgs/$installationId/history',
  settings: '/orgs/$installationId/settings',
} as const satisfies Record<Section, string>;

export const PAGE_PATHS = {
  ...SECTION_PATHS,
  account: '/orgs/$installationId/account',
} as const satisfies Record<ShellPage, string>;

export const SECTION_LABELS = {
  today: 'nav.today',
  blockers: 'nav.blockers',
  history: 'nav.history',
  settings: 'nav.setup',
} as const satisfies Record<Section, MessageKey>;

export const PAGE_LABELS = {
  ...SECTION_LABELS,
  account: 'account.title',
} as const satisfies Record<ShellPage, MessageKey>;

export const SOON_SECTIONS: ReadonlySet<Section> = new Set<Section>([]);

export function sectionOf(pathname: string): ShellPage {
  const last = pathname.replace(/\/+$/, '').split('/').pop() ?? '';
  if (last === 'account') return 'account';
  return (SECTIONS as readonly string[]).includes(last) ? (last as Section) : 'settings';
}
