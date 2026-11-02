import { afterEach, describe, expect, test } from 'bun:test';
import { applyTheme, initialTheme } from './theme';

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

  test('applyTheme survives a throwing localStorage', () => {
    const attributes: Record<string, string> = {};
    globalThis.document = {
      documentElement: {
        setAttribute: (name: string, value: string) => {
          attributes[name] = value;
        },
      },
    } as unknown as Document;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        setItem: () => {
          throw new Error('blocked');
        },
      },
    });
    expect(() => applyTheme('dark')).not.toThrow();
    expect(attributes['data-theme']).toBe('dark');
  });
});
