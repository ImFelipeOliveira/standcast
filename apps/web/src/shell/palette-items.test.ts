import { beforeEach, describe, expect, test } from 'bun:test';
import { applyLang, translate } from '../i18n';
import {
  isPaletteShortcut,
  paletteCloseFocus,
  paletteItems,
  paletteOptionId,
} from './palette-items';

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string>) =>
  translate('pt-BR', key, vars);

const base = {
  installationId: 11,
  teams: ['backend', 'plataforma'],
  currentTeam: 'backend',
  admin: true,
  t,
};

beforeEach(() => applyLang('pt-BR'));

describe('command palette items', () => {
  test('an empty query lists the screens and the teams', () => {
    const items = paletteItems({ ...base, query: '' });
    expect(items.filter((item) => item.group === 'screens').map((item) => item.label)).toEqual([
      'Hoje',
      'Impedimentos',
      'Histórico',
      'Configuração',
      'Pessoas e vínculos',
      'standcast.yml',
      'API e webhooks',
    ]);
    expect(items.filter((item) => item.group === 'teams')).toEqual([
      expect.objectContaining({
        label: 'backend',
        to: '/orgs/$installationId/today',
        search: { team: 'backend' },
      }),
      expect.objectContaining({ label: 'plataforma', search: { team: 'plataforma' } }),
    ]);
    expect(items.some((item) => item.group === 'search')).toBe(false);
  });

  test('matching ignores case and accents', () => {
    const labels = paletteItems({ ...base, query: 'historico' }).map((item) => item.label);
    expect(labels).toContain('Histórico');
    expect(labels).not.toContain('Hoje');
  });

  test('a query of two or more letters offers to search the dailies of each team, current first', () => {
    const search = paletteItems({ ...base, query: 'api#83', currentTeam: 'plataforma' }).filter(
      (item) => item.group === 'search',
    );
    expect(search.map((item) => item.search)).toEqual([
      { team: 'plataforma', tab: 'search', q: 'api#83' },
      { team: 'backend', tab: 'search', q: 'api#83' },
    ]);
    expect(search[0]?.label).toBe('Buscar “api#83” nas dailies de plataforma');
    expect(search[0]?.to).toBe('/orgs/$installationId/history');
  });

  test('one letter does not search the dailies', () => {
    expect(paletteItems({ ...base, query: 'a' }).some((item) => item.group === 'search')).toBe(
      false,
    );
  });

  test('people, standcast.yml and API are offered only to admins, who are the only ones who can use them', () => {
    const labels = paletteItems({ ...base, admin: false, query: '' })
      .filter((item) => item.group === 'screens')
      .map((item) => item.label);
    expect(labels).toEqual(['Hoje', 'Impedimentos', 'Histórico', 'Configuração']);
  });
});

describe('command palette option ids', () => {
  test('every option gets its own id, whatever the team name', () => {
    const items = paletteItems({ ...base, teams: ['開発', '営業', 'a b', 'a_b'], query: '' });
    const ids = items.map((item) => paletteOptionId(item, items));
    expect(new Set(ids).size).toBe(items.length);
  });
});

describe('command palette shortcut', () => {
  const key = (overrides: Partial<Parameters<typeof isPaletteShortcut>[0]>) => ({
    key: 'k',
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  });

  test('⌘K on a Mac and Ctrl+K elsewhere open the palette', () => {
    expect(isPaletteShortcut(key({ metaKey: true }), true)).toBe(true);
    expect(isPaletteShortcut(key({ ctrlKey: true }), false)).toBe(true);
    expect(isPaletteShortcut(key({ ctrlKey: true, key: 'K' }), false)).toBe(true);
  });

  test('Ctrl+K on a Mac stays with the text field, which uses it to delete to the end of the line', () => {
    expect(isPaletteShortcut(key({ ctrlKey: true }), true)).toBe(false);
  });

  test('other combinations are left to the browser', () => {
    expect(isPaletteShortcut(key({ ctrlKey: true, shiftKey: true }), false)).toBe(false);
    expect(isPaletteShortcut(key({ metaKey: true, altKey: true }), true)).toBe(false);
    expect(isPaletteShortcut(key({ metaKey: true, key: 'j' }), true)).toBe(false);
    expect(isPaletteShortcut(key({}), false)).toBe(false);
  });

  test('a keydown without a key, as Chromium sends on autofill, is ignored', () => {
    expect(isPaletteShortcut(key({ key: undefined, ctrlKey: true }), false)).toBe(false);
  });
});

describe('focus after the palette closes', () => {
  const element = (name: string, shown: boolean, isConnected = true) => ({
    name,
    isConnected,
    getClientRects: () => ({ length: shown ? 1 : 0 }),
  });

  test('a visible trigger keeps the default return to the trigger', () => {
    expect(
      paletteCloseFocus(element('trigger', true), element('field', true), element('menu', true)),
    ).toBeNull();
  });

  test('a hidden trigger returns focus to what was focused before opening', () => {
    expect(
      paletteCloseFocus(element('trigger', false), element('field', true), element('menu', true))
        ?.name,
    ).toBe('field');
  });

  test('a hidden trigger with nothing visible focused before falls back to the menu button', () => {
    expect(paletteCloseFocus(element('trigger', false), null, element('menu', true))?.name).toBe(
      'menu',
    );
    expect(
      paletteCloseFocus(
        element('trigger', false),
        element('gone', true, false),
        element('menu', true),
      )?.name,
    ).toBe('menu');
  });
});
