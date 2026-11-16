import { describe, expect, test } from 'bun:test';
import {
  buildBlockerAlert,
  buildDigest,
  LINK_CHAT_ACCOUNT_ACTION,
  type Message,
  type TeamConfig,
} from '@standcast/core';
import { renderSlack } from '../src/render';

describe('renderSlack blocker alert', () => {
  test('mentions the managers and links the blocker ref', () => {
    const out = renderSlack(
      buildBlockerAlert({
        lang: 'en',
        team: 'Alpha',
        managers: [{ login: 'carol', chatUserId: 'UCAROL' }, { login: 'dave' }],
        author: 'alice',
        blocker: {
          text: 'waiting on <staging>',
          ref: { kind: 'pull_request', url: 'https://github.com/acme/api/pull/7', title: 'Fix' },
        },
        ageDays: 5,
        openedOn: '2026-10-23',
        routedTo: ['bob'],
      }),
    );
    const sections = out.blocks.map((b) => JSON.stringify(b)).join('\n');
    expect(out.blocks[0]).toEqual({
      type: 'header',
      text: { type: 'plain_text', text: '🚧 Blocker open for 5 days · Alpha' },
    });
    expect(sections).toContain('<@UCAROL>, @dave');
    expect(sections).toContain('waiting on &lt;staging&gt;');
    expect(sections).toContain('<https://github.com/acme/api/pull/7|Fix>');
    expect(sections).toContain('Routed to @bob.');
  });
});

describe('renderSlack', () => {
  test('message actions do not change the slack payload', () => {
    const plain: Message = { fallbackText: 'fb', blocks: [{ type: 'paragraph', content: ['hi'] }] };
    const withLink: Message = {
      ...plain,
      actions: [{ type: LINK_CHAT_ACCOUNT_ACTION, text: 'Link?', label: 'Link my account' }],
    };
    expect(renderSlack(withLink)).toEqual(renderSlack(plain));
  });

  test('render heading/paragraph/list/divider', () => {
    const out = renderSlack({
      fallbackText: 'fb',
      blocks: [
        { type: 'heading', text: 'Title' },
        { type: 'paragraph', content: ['hello'] },
        { type: 'list', items: [['a'], ['b']] },
        { type: 'divider' },
      ],
    });
    expect(out.text).toBe('fb');
    expect(out.blocks).toEqual([
      { type: 'header', text: { type: 'plain_text', text: 'Title' } },
      { type: 'section', text: { type: 'mrkdwn', text: 'hello\n• a\n• b' } },
      { type: 'divider' },
    ]);
  });

  test('a full digest of six people stays within the slack block limit', () => {
    const logins = ['ana', 'bia', 'caio', 'duda', 'enzo', 'fabi'];
    const team = {
      name: 'backend',
      language: 'en',
      members: logins,
      timezone: 'America/Sao_Paulo',
      workdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
    } as unknown as TeamConfig;
    const out = renderSlack(
      buildDigest({
        team,
        date: '2026-11-16',
        entries: logins.map((login) => ({
          login,
          daily: {
            org: 'acme',
            yesterday: [{ text: `${login} did y` }],
            today: [{ text: `${login} does t` }],
            blockers: [],
            support: [],
          },
        })),
        missing: [{ login: 'gabi' }],
      }),
    );
    expect(out.blocks.length).toBeLessThanOrEqual(50);
    const text = JSON.stringify(out.blocks);
    for (const login of logins) {
      expect(text).toContain(`${login} did y`);
      expect(text).toContain(`${login} does t`);
    }
    expect(text).toContain('@gabi');
  });

  test('text blocks start a new section before passing 3000 chars', () => {
    const out = renderSlack({
      fallbackText: 'fb',
      blocks: [
        { type: 'paragraph', content: ['a'.repeat(2000)] },
        { type: 'paragraph', content: ['b'.repeat(2000)] },
      ],
    });
    expect(out.blocks).toEqual([
      { type: 'section', text: { type: 'mrkdwn', text: 'a'.repeat(2000) } },
      { type: 'section', text: { type: 'mrkdwn', text: 'b'.repeat(2000) } },
    ]);
  });

  test('render inline', () => {
    const out = renderSlack({
      fallbackText: 'fb',
      blocks: [
        {
          type: 'paragraph',
          content: [
            { mention: 'U123' },
            ' a & b < c > d ',
            { link: { text: 't', url: 'https://x' } },
          ],
        },
      ],
    });
    expect(out.blocks[0]).toEqual({
      type: 'section',
      text: { type: 'mrkdwn', text: '<@U123> a &amp; b &lt; c &gt; d <https://x/|t>' },
    });
  });

  test('a mention with an invalid id renders as escaped text', () => {
    const out = renderSlack({
      fallbackText: 'fb',
      blocks: [{ type: 'paragraph', content: [{ mention: '<!channel>' }, ' ', { mention: 'u1' }] }],
    });
    const text = (out.blocks[0] as { text: { text: string } }).text.text;
    expect(text).toBe('@&lt;!channel&gt; @u1');
    expect(text).not.toContain('<@');
    expect(text).not.toContain('<!');
  });

  test('header truncated to 150 chars', () => {
    const out = renderSlack({
      fallbackText: 'fb',
      blocks: [{ type: 'heading', text: 'x'.repeat(200) }],
    });
    const header = out.blocks[0] as { text: { text: string } };
    expect(header.text.text).toHaveLength(150);
  });

  test('link url cannot break out of link syntax', () => {
    const out = renderSlack({
      fallbackText: 'fb',
      blocks: [
        { type: 'paragraph', content: [{ link: { text: 't', url: 'https://x.com/a|b>c<d e' } }] },
      ],
    });
    const text = (out.blocks[0] as { text: { text: string } }).text.text;
    expect(text).toBe('<https://x.com/a%7Cb%3Ec%3Cd%20e|t>');
  });

  test('non-http link renders as plain text', () => {
    const out = renderSlack({
      fallbackText: 'fb',
      blocks: [
        {
          type: 'paragraph',
          content: [
            { link: { text: 'a<b', url: 'javascript:alert(1)' } },
            { link: { text: 'bad', url: 'not a url' } },
          ],
        },
      ],
    });
    expect((out.blocks[0] as { text: { text: string } }).text.text).toBe('a&lt;bbad');
  });

  test('raw pings are escaped in blocks and fallback', () => {
    const out = renderSlack({
      fallbackText: '<!channel> hi',
      blocks: [{ type: 'paragraph', content: ['<!channel> hi'] }],
    });
    expect(out.text).toBe('&lt;!channel&gt; hi');
    expect((out.blocks[0] as { text: { text: string } }).text.text).toBe('&lt;!channel&gt; hi');
  });

  test('empty blocks are skipped', () => {
    const out = renderSlack({
      fallbackText: 'fb',
      blocks: [
        { type: 'paragraph', content: [''] },
        { type: 'list', items: [] },
        { type: 'divider' },
      ],
    });
    expect(out.blocks).toEqual([{ type: 'divider' }]);
  });

  test('a long list is split across sections without losing items', () => {
    const items = Array.from({ length: 8 }, (_, i) => [`${i}${'x'.repeat(499)}`]);
    const out = renderSlack({ fallbackText: 'fb', blocks: [{ type: 'list', items }] });
    const texts = out.blocks.map((b) => (b as { text: { text: string } }).text.text);
    expect(texts.length).toBe(2);
    for (const text of texts) expect(text.length).toBeLessThanOrEqual(3000);
    expect(texts.join('\n')).toBe(items.map(([item]) => `• ${item}`).join('\n'));
  });

  test('a message past 50 blocks keeps 49 and ends with the tail', () => {
    const blocks = Array.from({ length: 60 }, (_, i) => ({
      type: 'heading' as const,
      text: `h${i}`,
    }));
    const out = renderSlack({ fallbackText: 'fb', blocks });
    expect(out.blocks).toHaveLength(50);
    expect(out.blocks[48]).toEqual({ type: 'header', text: { type: 'plain_text', text: 'h48' } });
    expect(out.blocks[49]).toEqual({
      type: 'section',
      text: { type: 'mrkdwn', text: '… see Standcast' },
    });
  });

  test('section text truncated to 3000 chars', () => {
    const out = renderSlack({
      fallbackText: 'fb',
      blocks: [{ type: 'paragraph', content: ['y'.repeat(3500)] }],
    });
    const text = (out.blocks[0] as { text: { text: string } }).text.text;
    expect(text).toHaveLength(3000);
    expect(text.endsWith('…')).toBe(true);
  });
});
