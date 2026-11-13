import type { MessageKey } from '../i18n';

export type PaletteGroup = 'screens' | 'teams' | 'search';

export type PaletteItem = {
  id: string;
  group: PaletteGroup;
  label: string;
  to: string;
  search?: Record<string, string>;
};

type Translate = (key: MessageKey, vars?: Record<string, string>) => string;

const SCREENS: { id: string; label: MessageKey; to: string; adminOnly?: boolean }[] = [
  { id: 'today', label: 'nav.today', to: '/orgs/$installationId/today' },
  { id: 'blockers', label: 'nav.blockers', to: '/orgs/$installationId/blockers' },
  { id: 'history', label: 'nav.history', to: '/orgs/$installationId/history' },
  { id: 'settings', label: 'nav.setup', to: '/orgs/$installationId/settings' },
  {
    id: 'people',
    label: 'settings.tab.people',
    to: '/orgs/$installationId/settings/people',
    adminOnly: true,
  },
  {
    id: 'config',
    label: 'settings.tab.config',
    to: '/orgs/$installationId/settings/config',
    adminOnly: true,
  },
  {
    id: 'api',
    label: 'settings.tab.api',
    to: '/orgs/$installationId/settings/api',
    adminOnly: true,
  },
];

const MIN_SEARCH_LENGTH = 2;

export type ShortcutKey = {
  key: string | undefined;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

export function isPaletteShortcut(event: ShortcutKey, mac: boolean): boolean {
  if (event.key?.toLowerCase() !== 'k' || event.altKey || event.shiftKey) return false;
  return mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

export const paletteOptionId = (item: PaletteItem, items: PaletteItem[]) =>
  `palette-option-${items.indexOf(item)}`;

const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export function paletteItems({
  query,
  teams,
  currentTeam,
  admin,
  t,
}: {
  query: string;
  installationId: number;
  teams: string[];
  currentTeam: string | null;
  admin: boolean;
  t: Translate;
}): PaletteItem[] {
  const text = query.trim();
  const wanted = fold(text);
  const matches = (label: string) => wanted === '' || fold(label).includes(wanted);
  const screens: PaletteItem[] = SCREENS.filter((screen) => admin || !screen.adminOnly)
    .map((screen) => ({
      id: `screen:${screen.id}`,
      group: 'screens' as const,
      label: t(screen.label),
      to: screen.to,
    }))
    .filter((item) => matches(item.label));
  const teamItems: PaletteItem[] = teams
    .filter((team) => matches(team))
    .map((team) => ({
      id: `team:${team}`,
      group: 'teams',
      label: team,
      to: '/orgs/$installationId/today',
      search: { team },
    }));
  const ordered =
    currentTeam && teams.includes(currentTeam)
      ? [currentTeam, ...teams.filter((team) => team !== currentTeam)]
      : teams;
  const searches: PaletteItem[] =
    text.length < MIN_SEARCH_LENGTH
      ? []
      : ordered.map((team) => ({
          id: `search:${team}`,
          group: 'search',
          label: t('palette.searchIn', { query: text, team }),
          to: '/orgs/$installationId/history',
          search: { team, tab: 'search', q: text },
        }));
  return [...screens, ...teamItems, ...searches];
}
