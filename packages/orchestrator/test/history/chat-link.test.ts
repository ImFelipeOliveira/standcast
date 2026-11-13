import { describe, expect, test } from 'bun:test';
import { chatLink } from '../../src/modules/history/chat-link';

describe('chatLink', () => {
  test('slack opens the channel in the workspace', () => {
    expect(chatLink('slack', { channel: 'C123', id: '1730000000.000100' }, 'T999')).toBe(
      'https://slack.com/app_redirect?team=T999&channel=C123',
    );
  });

  test('slack without a connected workspace has no link', () => {
    expect(chatLink('slack', { channel: 'C123', id: '1.2' }, null)).toBeNull();
  });

  test('google chat opens the digest thread', () => {
    expect(
      chatLink('google-chat', { channel: 'spaces/AAAA', id: 'spaces/AAAA/threads/BBBB' }, null),
    ).toBe('https://chat.google.com/room/AAAA/BBBB');
  });

  test('google chat without a thread opens the space', () => {
    expect(chatLink('google-chat', { channel: 'spaces/AAAA', id: '' }, null)).toBe(
      'https://chat.google.com/room/AAAA',
    );
  });

  test('no ref, no link', () => {
    expect(chatLink('slack', null, 'T999')).toBeNull();
    expect(chatLink('google-chat', null, null)).toBeNull();
  });
});
