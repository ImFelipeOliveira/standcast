import { describe, expect, test } from 'bun:test';
import {
  buildBlockerAlert,
  buildDailyPost,
  LINK_CHAT_ACCOUNT_ACTION,
  type Message,
  type TeamConfig,
} from '@standcast/core';
import { GOOGLE_CHAT_TEXT_LIMIT, MARKUP_BREAKER, renderGoogleChat } from '../src';

describe('renderGoogleChat blocker alert', () => {
  test('mentions the managers and links the blocker ref', () => {
    const out = renderGoogleChat(
      buildBlockerAlert({
        lang: 'pt-BR',
        team: 'Alpha',
        managers: [{ login: 'carol', chatUserId: 'users/123' }, { login: 'dave' }],
        author: 'alice',
        blocker: {
          text: 'esperando o banco de staging',
          ref: { kind: 'card', url: 'https://linear.app/acme/issue/ENG-9', title: 'ENG-9' },
        },
        ageDays: 5,
        openedOn: '2026-10-23',
        routedTo: [],
      }),
    );
    expect(out.text).toContain('*🚧 Impedimento aberto há 5 dias · Alpha*');
    expect(out.text).toContain('<users/123>, @dave');
    expect(out.text).toContain('esperando o banco de staging');
    expect(out.text).toContain('<https://linear.app/acme/issue/ENG-9|ENG-9>');
    expect(out.text).toContain('Aberto desde 23/10/2026, informado por @alice.');
    expect(out.text).not.toContain('Encaminhado');
  });
});

const ENDPOINT = 'https://api.test/webhooks/google-chat';

const withLink: Message = {
  fallbackText: 'fb',
  blocks: [{ type: 'paragraph', content: ['Did not send: @carol'] }],
  actions: [
    { type: LINK_CHAT_ACCOUNT_ACTION, text: 'Shown as <@login>?', label: 'Link my account' },
  ],
};

describe('renderGoogleChat actions', () => {
  test('the link account action becomes a card button that calls the chat endpoint', () => {
    expect(renderGoogleChat(withLink, { interactionUrl: ENDPOINT })).toEqual({
      text: 'Did not send: @carol',
      cardsV2: [
        {
          cardId: LINK_CHAT_ACCOUNT_ACTION,
          card: {
            sections: [
              {
                widgets: [
                  { textParagraph: { text: 'Shown as &lt;@login&gt;?' } },
                  {
                    buttonList: {
                      buttons: [
                        {
                          text: 'Link my account',
                          onClick: {
                            action: {
                              function: ENDPOINT,
                              parameters: [{ key: 'action', value: LINK_CHAT_ACCOUNT_ACTION }],
                            },
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        },
      ],
    });
  });

  test('without an interaction url or without actions there is no card', () => {
    expect(renderGoogleChat(withLink)).toEqual({ text: 'Did not send: @carol' });
    const { actions: _, ...plain } = withLink;
    expect(renderGoogleChat(plain, { interactionUrl: ENDPOINT })).toEqual({
      text: 'Did not send: @carol',
    });
  });
});

describe('renderGoogleChat', () => {
  test('renders heading, paragraph, list and divider as text', () => {
    const out = renderGoogleChat({
      fallbackText: 'fb',
      blocks: [
        { type: 'heading', text: 'Daily' },
        { type: 'paragraph', content: ['hello'] },
        { type: 'list', items: [['a'], ['b']] },
        { type: 'divider' },
        { type: 'paragraph', content: ['end'] },
      ],
    });
    expect(out).toEqual({ text: '*Daily*\n\nhello\n• a\n• b\n\nend' });
  });

  test('separates digest sections with a blank line', () => {
    const out = renderGoogleChat({
      fallbackText: 'fb',
      blocks: [
        { type: 'heading', text: 'Daily' },
        { type: 'heading', text: 'Blockers' },
        { type: 'list', items: [['b1']] },
        { type: 'paragraph', content: ['@ana'] },
        { type: 'paragraph', content: ['Yesterday:'] },
        { type: 'list', items: [['y1'], ['y2']] },
        { type: 'paragraph', content: ['Today:'] },
        { type: 'list', items: [['t1']] },
        { type: 'paragraph', content: ['Did not send: @bob'] },
      ],
    });
    expect(out.text).toBe(
      '*Daily*\n\n*Blockers*\n• b1\n\n@ana\nYesterday:\n• y1\n• y2\n\nToday:\n• t1\n\nDid not send: @bob',
    );
  });

  test('blocks that render empty keep the spacing of the block before them', () => {
    const afterHeading = renderGoogleChat({
      fallbackText: 'fb',
      blocks: [
        { type: 'heading', text: 'Daily' },
        { type: 'heading', text: '' },
        { type: 'paragraph', content: ['hello'] },
      ],
    });
    expect(afterHeading.text).toBe('*Daily*\n\nhello');
    const afterList = renderGoogleChat({
      fallbackText: 'fb',
      blocks: [
        { type: 'list', items: [['a']] },
        { type: 'list', items: [] },
        { type: 'paragraph', content: ['hello'] },
      ],
    });
    expect(afterList.text).toBe('• a\n\nhello');
  });

  test('a message whose blocks all render empty uses the fallback text', () => {
    const out = renderGoogleChat({
      fallbackText: 'only fb',
      blocks: [
        { type: 'heading', text: '' },
        { type: 'list', items: [] },
      ],
    });
    expect(out.text).toBe('only fb');
  });

  test('a daily item puts its link on the next line', () => {
    const msg = buildDailyPost(
      {
        login: 'ana',
        daily: {
          org: 'acme',
          yesterday: [],
          today: [
            {
              text: 'ship it',
              ref: { kind: 'card', url: 'https://linear.app/acme/issue/MKT-9/x', title: 'x' },
            },
          ],
          blockers: [],
          support: [],
        },
      },
      {
        name: 'backend',
        language: 'pt-BR',
        members: ['ana'],
        timezone: 'America/Sao_Paulo',
        workdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
      } as unknown as TeamConfig,
      '2026-11-16',
      false,
    );
    expect(renderGoogleChat(msg).text).toContain(
      '• ship it\n   🔗 <https://linear.app/acme/issue/MKT-9/x|MKT-9>',
    );
  });

  test('render keeps links and safe mentions only', () => {
    const out = renderGoogleChat({
      fallbackText: 'fb',
      blocks: [
        {
          type: 'paragraph',
          content: [
            { mention: 'users/123456789' },
            ' a & b * c ',
            { link: { text: 'PR #1', url: 'https://github.com/o/r/pull/1' } },
            ' ',
            { link: { text: 'bad', url: 'javascript:alert(1)' } },
            ' ',
            { mention: 'users/all' },
            ' ',
            { mention: 'ana' },
          ],
        },
      ],
    });
    expect(out.text).toBe(
      '<users/123456789> a & b * c <https://github.com/o/r/pull/1|PR #1> bad @users/all @ana',
    );
  });

  test('text and link text cannot inject markup', () => {
    const out = renderGoogleChat({
      fallbackText: 'fb',
      blocks: [
        {
          type: 'paragraph',
          content: [
            'ping <users/all> now',
            ' ',
            { link: { text: 'a|b>c', url: 'https://x.test/p?q=a|b&r=<s>' } },
          ],
        },
      ],
    });
    expect(out.text).not.toContain('<users/all>');
    expect(out.text).toContain(`ping <${MARKUP_BREAKER}users/all> now`);
    expect(MARKUP_BREAKER).toBe('\u200B');
    expect(out.text).toContain('<https://x.test/p?q=a%7Cb&r=%3Cs%3E|a¦b›c>');
  });

  test('falls back to the fallback text when blocks render empty', () => {
    expect(renderGoogleChat({ fallbackText: 'only <fb>', blocks: [] }).text).toBe(
      `only <${MARKUP_BREAKER}fb>`,
    );
  });

  test('long digest is cut with the tail', () => {
    const items = Array.from({ length: 400 }, (_, i) => [`item ${i} ${'x'.repeat(20)}`]);
    const out = renderGoogleChat({
      fallbackText: 'fb',
      blocks: [
        { type: 'heading', text: 'Digest' },
        { type: 'list', items },
      ],
    });
    expect(GOOGLE_CHAT_TEXT_LIMIT).toBe(4096);
    expect(out.text.length).toBeLessThanOrEqual(4096);
    expect(out.text.startsWith('*Digest*\n• item 0')).toBe(true);
    expect(out.text.endsWith('\n… see Standcast')).toBe(true);
    const lines = out.text.split('\n');
    expect(lines.at(-2)).toMatch(/^• item \d+ x{20}$/);
  });

  test('a hard cut does not leave open markup', () => {
    const link = { link: { text: 'pr', url: 'https://github.com/o/r/pull/1' } };
    const out = renderGoogleChat({
      fallbackText: 'fb',
      blocks: [{ type: 'paragraph', content: ['z'.repeat(4070), link, ' tail'] }],
    });
    expect(out.text).toBe(`${'z'.repeat(4070)}\n… see Standcast`);
  });

  test('a single long line is cut with the tail', () => {
    const out = renderGoogleChat({
      fallbackText: 'fb',
      blocks: [{ type: 'paragraph', content: ['y'.repeat(5000)] }],
    });
    expect(out.text.length).toBeLessThanOrEqual(4096);
    expect(out.text.endsWith('… see Standcast')).toBe(true);
  });
});
