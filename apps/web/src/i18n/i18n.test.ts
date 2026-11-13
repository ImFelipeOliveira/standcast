import { afterEach, describe, expect, test } from 'bun:test';
import { en } from './en';
import {
  applyLang,
  detectLang,
  followBrowserLang,
  getLang,
  getLangChoice,
  setLang,
  translate,
  watchBrowserLang,
} from './index';
import { ptBR } from './pt-BR';

describe('language choice', () => {
  const originalDocument = globalThis.document;
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  afterEach(() => {
    globalThis.document = originalDocument;
    for (const [name, original] of [
      ['localStorage', originalStorage],
      ['navigator', originalNavigator],
    ] as const) {
      if (original) Object.defineProperty(globalThis, name, original);
      else Reflect.deleteProperty(globalThis, name);
    }
  });

  function stub(languages: string[]): { store: Map<string, string>; nav: { languages: string[] } } {
    globalThis.document = { documentElement: { lang: '' } } as unknown as Document;
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
    });
    const nav = { languages };
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: nav });
    return { store, nav };
  }

  test('a stored language is the choice, otherwise it follows the browser', () => {
    const { store } = stub(['pt-BR']);
    expect(getLangChoice()).toBe('browser');
    store.set('standcast.lang', 'en');
    expect(getLangChoice()).toBe('en');
    store.set('standcast.lang', 'xx');
    expect(getLangChoice()).toBe('browser');
  });

  test('following the browser clears the stored choice and applies its language', () => {
    const { store } = stub(['pt-BR', 'en']);
    setLang('en');
    expect(getLangChoice()).toBe('en');
    followBrowserLang();
    expect(store.has('standcast.lang')).toBe(false);
    expect(getLang()).toBe('pt-BR');
  });

  test('a browser language change applies only while nothing is stored', () => {
    const { store, nav } = stub(['en-US']);
    applyLang('en');
    const listeners = new Set<() => void>();
    const target = {
      addEventListener: (_: 'languagechange', listener: () => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_: 'languagechange', listener: () => void) => {
        listeners.delete(listener);
      },
    };
    const stop = watchBrowserLang(target);
    nav.languages = ['pt-BR'];
    for (const listener of listeners) listener();
    expect(getLang()).toBe('pt-BR');
    store.set('standcast.lang', 'pt-BR');
    nav.languages = ['en-US'];
    for (const listener of listeners) listener();
    expect(getLang()).toBe('pt-BR');
    stop();
    expect(listeners.size).toBe(0);
  });
});

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
