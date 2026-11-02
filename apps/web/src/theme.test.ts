import { afterEach, describe, expect, test } from 'bun:test';
import { applyTheme, chooseTheme, getTheme, initialTheme } from './theme';

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
