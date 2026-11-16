import { describe, expect, test } from 'bun:test';
import { type MessageKey, t } from '../src/i18n';

const chatLinkKeys: MessageKey[] = [
  'googleChat.notFound',
  'googleChat.signInLink',
  'googleChat.useSpace',
  'googleChat.replaced',
  'web.chatLink.title',
  'web.chatLink.confirm',
  'web.chatLink.replaces',
  'web.chatLink.submit',
  'web.chatLink.cancel',
  'web.chatLink.linked',
  'web.chatLink.expired',
  'web.chatLink.notMember',
  'web.chatLink.notConnected',
  'web.chatLink.mapped',
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

  test('pt-BR confirm interpolates account, login and org', () => {
    expect(
      t('pt-BR', 'web.chatLink.confirm', { account: 'a@x.com', login: 'ana', org: 'acme' }),
    ).toBe('Vincular a conta do Google Chat a@x.com ao seu GitHub @ana em acme?');
  });
});
