import { afterEach, describe, expect, test } from 'bun:test';
import {
  applyTheme,
  chooseTheme,
  followSystemTheme,
  getTheme,
  getThemeChoice,
  initialTheme,
  watchSystemTheme,
} from './theme';

describe('theme choice', () => {
  const originalDocument = globalThis.document;
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const originalMatchMedia = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');

  afterEach(() => {
    globalThis.document = originalDocument;
    for (const [name, original] of [
      ['localStorage', originalStorage],
      ['matchMedia', originalMatchMedia],
    ] as const) {
      if (original) Object.defineProperty(globalThis, name, original);
      else Reflect.deleteProperty(globalThis, name);
    }
  });

  function stub(prefersDark: boolean): Map<string, string> {
    globalThis.document = {
      documentElement: { setAttribute: () => undefined },
    } as unknown as Document;
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
    });
    Object.defineProperty(globalThis, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: prefersDark }),
    });
    return store;
  }

  function fakeMedia(initial: boolean) {
    const listeners = new Set<() => void>();
    const media = {
      matches: initial,
      addEventListener: (_: 'change', listener: () => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_: 'change', listener: () => void) => {
        listeners.delete(listener);
      },
    };
    const flip = (next: boolean) => {
      media.matches = next;
      for (const listener of listeners) listener();
    };
    return { media, flip, listeners };
  }

  test('a stored light or dark is the choice, anything else follows the system', () => {
    const store = stub(false);
    expect(getThemeChoice()).toBe('system');
    store.set('standcast.theme', 'dark');
    expect(getThemeChoice()).toBe('dark');
    store.set('standcast.theme', 'purple');
    expect(getThemeChoice()).toBe('system');
  });

  test('following the system clears the stored choice and applies the system theme', () => {
    const store = stub(true);
    chooseTheme('light');
    expect(getThemeChoice()).toBe('light');
    followSystemTheme();
    expect(store.has('standcast.theme')).toBe(false);
    expect(getThemeChoice()).toBe('system');
    expect(getTheme()).toBe('dark');
  });

  test('a live system change applies only while nothing is stored', () => {
    const store = stub(false);
    const { media, flip, listeners } = fakeMedia(false);
    applyTheme('light');
    const stop = watchSystemTheme(media);
    flip(true);
    expect(getTheme()).toBe('dark');
    store.set('standcast.theme', 'dark');
    flip(false);
    expect(getTheme()).toBe('dark');
    stop();
    expect(listeners.size).toBe(0);
  });
});

describe('initialTheme', () => {
  test('stored value wins over the system preference', () => {
    expect(initialTheme('light', true)).toBe('light');
    expect(initialTheme('dark', false)).toBe('dark');
  });

  test('falls back to the system preference', () => {
    expect(initialTheme(null, true)).toBe('dark');
    expect(initialTheme(null, false)).toBe('light');
  });

  test('ignores an invalid stored value', () => {
    expect(initialTheme('purple', true)).toBe('dark');
    expect(initialTheme('', false)).toBe('light');
  });
});

describe('applyTheme', () => {
  const originalDocument = globalThis.document;
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

  afterEach(() => {
    globalThis.document = originalDocument;
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });

  function stubDocument(): Record<string, string> {
    const attributes: Record<string, string> = {};
    globalThis.document = {
      documentElement: {
        setAttribute: (name: string, value: string) => {
          attributes[name] = value;
        },
      },
    } as unknown as Document;
    return attributes;
  }

  function stubStorage(setItem: (key: string, value: string) => void): void {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { setItem, getItem: () => null },
    });
  }

  test('applyTheme only sets data-theme and never persists', () => {
    const attributes = stubDocument();
    const written: string[] = [];
    stubStorage((key, value) => written.push(`${key}=${value}`));
    applyTheme('dark');
    expect(attributes['data-theme']).toBe('dark');
    expect(getTheme()).toBe('dark');
    expect(written).toEqual([]);
  });

  test('chooseTheme persists the choice', () => {
    const attributes = stubDocument();
    const written: string[] = [];
    stubStorage((key, value) => written.push(`${key}=${value}`));
    chooseTheme('light');
    expect(attributes['data-theme']).toBe('light');
    expect(written).toEqual(['standcast.theme=light']);
  });

  test('chooseTheme survives a throwing localStorage', () => {
    const attributes = stubDocument();
    stubStorage(() => {
      throw new Error('blocked');
    });
    expect(() => chooseTheme('dark')).not.toThrow();
    expect(attributes['data-theme']).toBe('dark');
  });
});
