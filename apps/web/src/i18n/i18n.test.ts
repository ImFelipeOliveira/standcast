import { afterEach, describe, expect, test } from 'bun:test';
import { en } from './en';
import { applyLang, detectLang, getLang, setLang, translate } from './index';
import { ptBR } from './pt-BR';

describe('detectLang', () => {
  test('pt and pt-BR resolve to pt-BR', () => {
    expect(detectLang(['pt'], null)).toBe('pt-BR');
    expect(detectLang(['pt-BR', 'en'], null)).toBe('pt-BR');
  });

  test('other languages resolve to en', () => {
    expect(detectLang(['fr-FR'], null)).toBe('en');
    expect(detectLang(['en-US'], null)).toBe('en');
    expect(detectLang([], null)).toBe('en');
  });

  test('stored value wins and invalid stored is ignored', () => {
    expect(detectLang(['pt-BR'], 'en')).toBe('en');
    expect(detectLang(['en-US'], 'pt-BR')).toBe('pt-BR');
    expect(detectLang(['pt-BR'], 'xx')).toBe('pt-BR');
  });
});

describe('dictionaries', () => {
  test('dictionaries have the same keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ptBR).sort());
  });

  test('translate interpolates variables', () => {
    expect(translate('en', 'greeting', { name: 'Ana' })).toBe('Hello, Ana');
    expect(translate('pt-BR', 'greeting', { name: 'Ana' })).toBe('Olá, Ana');
  });
});

describe('language persistence', () => {
  const originalDocument = globalThis.document;
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

  afterEach(() => {
    globalThis.document = originalDocument;
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });

  function stub(): { written: string[]; html: { lang: string } } {
    const written: string[] = [];
    const html = { lang: '' };
    globalThis.document = { documentElement: html } as unknown as Document;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        setItem: (key: string, value: string) => written.push(`${key}=${value}`),
        getItem: () => null,
      },
    });
    return { written, html };
  }

  test('applyLang sets the html lang and never persists', () => {
    const { written, html } = stub();
    applyLang('en');
    expect(html.lang).toBe('en');
    expect(getLang()).toBe('en');
    expect(written).toEqual([]);
  });

  test('setLang persists the choice', () => {
    const { written, html } = stub();
    setLang('pt-BR');
    expect(html.lang).toBe('pt-BR');
    expect(written).toEqual(['standcast.lang=pt-BR']);
  });
});
