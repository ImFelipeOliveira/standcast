import { describe, expect, test } from 'bun:test';
import { type MessageKey, t } from '../src/i18n';

const chatLinkKeys: MessageKey[] = [
  'googleChat.notFound',
  'googleChat.signInLink',
  'googleChat.useSpace',
  'googleChat.replaced',
];

describe('chat link copy', () => {
  test('exists in both languages', () => {
    for (const key of chatLinkKeys) {
      for (const lang of ['en', 'pt-BR'] as const) {
        const text = t(lang, key);
        expect(text).not.toBe('');
        expect(text).not.toBe(key);
      }
    }
  });
});
