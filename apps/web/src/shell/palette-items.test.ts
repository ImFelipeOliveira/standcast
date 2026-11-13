import { beforeEach, describe, expect, test } from 'bun:test';
import { applyLang, translate } from '../i18n';
import { paletteItems } from './palette-items';

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string>) =>
  translate('pt-BR', key, vars);

const base = { installationId: 11, teams: ['backend', 'plataforma'], currentTeam: 'backend', t };

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
});
