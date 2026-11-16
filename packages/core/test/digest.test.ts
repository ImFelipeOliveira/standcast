import { describe, expect, test } from 'bun:test';
import type { TeamConfig } from '../src/config';
import { buildDailyPost, buildDigest, buildDigestSummary, type DigestEntry } from '../src/digest';
import { type Block, type Inline, LINK_CHAT_ACCOUNT_ACTION } from '../src/message';

function team(language: 'pt-BR' | 'en', members: string[]): TeamConfig {
  return {
    name: 'backend',
    language,
    members,
    timezone: 'America/Sao_Paulo',
    workdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  } as unknown as TeamConfig;
}

function entry(
  login: string,
  chatUserId: string | undefined,
  over: Partial<DigestEntry['daily']> = {},
): DigestEntry {
  return {
    login,
    chatUserId,
    daily: {
      org: 'acme',
      yesterday: [{ text: `${login} did y` }],
      today: [{ text: `${login} does t` }],
      blockers: [],
      support: [],
      ...over,
    },
  };
}

function flat(inlines: Inline[]): string {
  return inlines
    .map((i) => (typeof i === 'string' ? i : 'mention' in i ? `<${i.mention}>` : i.link.text))
    .join('');
}

function blockText(b: Block): string {
  switch (b.type) {
    case 'heading':
      return b.text;
    case 'paragraph':
      return flat(b.content);
    case 'list':
      return b.items.map(flat).join('\n');
    case 'divider':
      return '---';
  }
}

const date = '2026-10-27';

describe('buildDigest', () => {
  const blocked = entry('alice', 'U1', { blockers: [{ text: 'waiting on infra' }] });
  const other = entry('bob', 'U2');
  const base = { team: team('en', ['alice', 'bob']), date, missing: [] };

  test('each person follows yesterday, today, blockers, support', () => {
    const asking = entry('alice', 'U1', {
      blockers: [{ text: 'waiting on infra' }],
      support: [{ text: 'need a review on the API PR' }],
    });
    const msg = buildDigest({ ...base, entries: [other, asking] });
    expect(msg.blocks.map(blockText)).toEqual([
      '📅 Daily — backend — 2026-10-27',
      '<U1>',
      '🗓️ Done yesterday (10/26):',
      'alice did y',
      '🎯 Focus for today (10/27):',
      'alice does t',
      '🚧 Blockers:',
      'waiting on infra',
      '🤝 Support requests:',
      'need a review on the API PR',
      '<U2>',
      '🗓️ Done yesterday (10/26):',
      'bob did y',
      '🎯 Focus for today (10/27):',
      'bob does t',
      '🚧 Blockers:',
      'No blockers.',
      '🤝 Support requests:',
      'No support requests.',
    ]);
  });

  test('support requests are only in their own section', () => {
    const asking = entry('bob', 'U2', { support: [{ text: 'pair on the migration' }] });
    const text = buildDigest({ ...base, entries: [asking] })
      .blocks.map(blockText)
      .join('\n');
    expect(text.split('pair on the migration')).toHaveLength(2);
  });

  test('dailies stored without support say nobody asked', () => {
    const { support: _, ...stored } = entry('bob', 'U2').daily;
    const msg = buildDigest({
      ...base,
      entries: [{ login: 'bob', chatUserId: 'U2', daily: stored }],
    });
    expect(msg.blocks.map(blockText)).toContain('No support requests.');
  });

  test('empty sections are localized', () => {
    const pt = buildDigest({ ...base, team: team('pt-BR', ['bob']), entries: [other] });
    const texts = pt.blocks.map(blockText);
    expect(texts).toContain('🤝 Solicitação de apoio:');
    expect(texts).toContain('Nenhum impedimento.');
    expect(texts).toContain('Nenhuma solicitação de apoio.');
  });

  test('one section per person in config member order', () => {
    const msg = buildDigest({ ...base, entries: [other, entry('alice', 'U1')] });
    const text = msg.blocks.map(blockText).join('\n');
    expect(text.indexOf('alice did y')).toBeLessThan(text.indexOf('bob did y'));
  });

  test('config order matches logins case-insensitively and keeps unlisted people', () => {
    const msg = buildDigest({
      team: team('en', ['@acme/backend', 'Alice']),
      date,
      entries: [other, entry('alice', 'U1'), entry('zed', 'U9')],
      missing: [],
    });
    const text = msg.blocks.map(blockText).join('\n');
    expect(text.indexOf('alice did y')).toBeLessThan(text.indexOf('bob did y'));
    expect(text.indexOf('bob did y')).toBeLessThan(text.indexOf('zed did y'));
  });

  test('prefers memberLogins of a resolved team for ordering', () => {
    const resolved = { ...team('en', ['@acme/backend']), memberLogins: ['bob', 'alice'] };
    const msg = buildDigest({ team: resolved, date, entries: [blocked, other], missing: [] });
    const text = msg.blocks.map(blockText).join('\n');
    expect(text.indexOf('bob did y')).toBeLessThan(text.indexOf('alice did y'));
  });

  test('missing listed last, no chat id as @login', () => {
    const msg = buildDigest({
      ...base,
      entries: [other],
      missing: [{ login: 'bob2', chatUserId: 'U7' }, { login: 'carol' }],
    });
    const last = msg.blocks[msg.blocks.length - 1];
    expect(last).toBeDefined();
    const json = JSON.stringify(last);
    expect(json).toContain('"@carol"');
    expect(json).toContain('{"mention":"U7"}');
  });

  test('blocker author without chat id is @login text', () => {
    const e = entry('dave', undefined, { blockers: [{ text: 'stuck' }] });
    const msg = buildDigest({ ...base, entries: [e] });
    expect(JSON.stringify(msg.blocks)).toContain('"@dave"');
    expect(JSON.stringify(msg.blocks)).not.toContain('mention');
  });

  test('a google chat digest with someone not linked offers the link button in the team language', () => {
    const chatTeam = (language: 'pt-BR' | 'en', provider: string) =>
      ({
        ...team(language, ['alice', 'carol']),
        chat: { provider, channel: 'spaces/AAAA' },
      }) as unknown as TeamConfig;
    const unlinked = { date, entries: [entry('alice', 'users/1')], missing: [{ login: 'carol' }] };
    expect(buildDigest({ ...unlinked, team: chatTeam('en', 'google-chat') }).actions).toEqual([
      {
        type: LINK_CHAT_ACCOUNT_ACTION,
        text: 'Shown as @login instead of your name? Link your Google Chat account so Standcast can mention you.',
        label: 'Link my account',
      },
    ]);
    expect(buildDigest({ ...unlinked, team: chatTeam('pt-BR', 'google-chat') }).actions).toEqual([
      {
        type: LINK_CHAT_ACCOUNT_ACTION,
        text: 'Aparece como @login em vez do seu nome? Vincule a sua conta do Google Chat para o Standcast mencionar você.',
        label: 'Vincular minha conta',
      },
    ]);
    expect(buildDigest({ ...unlinked, team: chatTeam('en', 'slack') }).actions).toBeUndefined();
    const linked = buildDigest({
      date,
      team: chatTeam('en', 'google-chat'),
      entries: [entry('alice', 'users/1')],
      missing: [{ login: 'carol', chatUserId: 'users/2' }],
    });
    expect(linked.actions).toBeUndefined();
    const author = buildDigest({
      date,
      team: chatTeam('en', 'google-chat'),
      entries: [entry('alice', undefined)],
      missing: [],
    });
    expect(author.actions).toHaveLength(1);
  });

  test('nobody missing', () => {
    const msg = buildDigest({ ...base, entries: [other] });
    expect(JSON.stringify(msg.blocks)).not.toContain('Did not send');
    expect(blockText(msg.blocks[msg.blocks.length - 1] as Block)).toBe('No support requests.');
  });

  test('localized', () => {
    const en = buildDigest({ ...base, entries: [other] });
    expect(en.blocks[0]).toEqual({ type: 'heading', text: '📅 Daily — backend — 2026-10-27' });
    const pt = buildDigest({ ...base, team: team('pt-BR', ['bob']), entries: [other] });
    expect(pt.blocks[0]).toEqual({ type: 'heading', text: '📅 Daily — backend — 27/10/2026' });
  });

  test('section labels carry emoji in both languages', () => {
    const asking = entry('alice', 'U1', {
      blockers: [{ text: 'stuck' }],
      support: [{ text: 'need a hand' }],
    });
    const cases = [
      {
        lang: 'en' as const,
        labels: [
          '🚧 Blockers:',
          '🤝 Support requests:',
          '🗓️ Done yesterday (10/26):',
          '🎯 Focus for today (10/27):',
        ],
        missing: '⏳ Did not send the daily: @carol',
      },
      {
        lang: 'pt-BR' as const,
        labels: [
          '🚧 Impedimentos:',
          '🤝 Solicitação de apoio:',
          '🗓️ O que foi realizado ontem (26/10):',
          '🎯 Foco para hoje (27/10):',
        ],
        missing: '⏳ Não enviaram a daily: @carol',
      },
    ];
    for (const { lang, labels, missing } of cases) {
      const msg = buildDigest({
        team: team(lang, ['alice']),
        date,
        entries: [asking],
        missing: [{ login: 'carol' }],
      });
      const texts = msg.blocks.map(blockText);
      expect(texts[0]?.startsWith('📅 Daily — backend — ')).toBe(true);
      for (const label of labels) expect(texts).toContain(label);
      expect(texts[texts.length - 1]).toBe(missing);
      expect(msg.fallbackText).toContain('🚧');
    }
  });

  test('yesterday spans the days since the previous workday', () => {
    const monday = '2026-11-16';
    const pt = buildDigest({
      team: team('pt-BR', ['alice']),
      date: monday,
      entries: [entry('alice', 'U1')],
      missing: [],
    });
    const ptTexts = pt.blocks.map(blockText);
    expect(ptTexts).toContain('🗓️ O que foi realizado ontem (13/11 a 15/11):');
    expect(ptTexts).toContain('🎯 Foco para hoje (16/11):');
    const en = buildDigest({
      team: team('en', ['alice']),
      date: monday,
      entries: [entry('alice', 'U1')],
      missing: [],
    });
    expect(en.blocks.map(blockText)).toContain('🗓️ Done yesterday (11/13 to 11/15):');
  });

  test('refs become links', () => {
    const e = entry('bob', 'U2', {
      yesterday: [
        { text: 'fixed it', ref: { kind: 'pull_request', url: 'https://x.test/1', title: 'PR 1' } },
        { text: 'plain ref', ref: { kind: 'issue', url: 'https://x.test/2' } },
      ],
    });
    const json = JSON.stringify(buildDigest({ ...base, entries: [e] }).blocks);
    expect(json).toContain('{"link":{"text":"PR 1","url":"https://x.test/1"}}');
    expect(json).toContain('{"link":{"text":"plain ref","url":"https://x.test/2"}}');
  });

  test('each link goes on its own line under the item, with the link emoji', () => {
    const e = entry('bob', 'U2', {
      yesterday: [
        { text: 'fixed it', ref: { kind: 'pull_request', url: 'https://x.test/1', title: 'PR 1' } },
        { text: 'no link' },
      ],
    });
    const texts = buildDigest({ ...base, entries: [e] }).blocks.map(blockText);
    expect(texts).toContain('fixed it\n   🔗 PR 1\nno link');
  });

  test('github and linear refs get a short label instead of the title', () => {
    const e = entry('bob', 'U2', {
      yesterday: [
        {
          text: 'merged the rename',
          ref: {
            kind: 'pull_request',
            url: 'https://github.com/acme/api/pull/30',
            title: 'refactor: rename',
          },
        },
        {
          text: 'opened an issue',
          ref: { kind: 'issue', url: 'https://github.com/acme/api/issues/7', title: 'Bug' },
        },
        {
          text: 'released',
          ref: {
            kind: 'commit',
            url: 'https://github.com/acme/api/commit/20fc434cc94ae11b689393006a44b96227610c89',
            title: 'chore: release',
          },
        },
        {
          text: 'finished the card',
          ref: { kind: 'card', url: 'https://linear.app/acme/issue/fel-12/do-it', title: 'Do it' },
        },
      ],
    });
    const json = JSON.stringify(buildDigest({ ...base, entries: [e] }).blocks);
    expect(json).toContain(
      '{"link":{"text":"api#30","url":"https://github.com/acme/api/pull/30"}}',
    );
    expect(json).toContain(
      '{"link":{"text":"api#7","url":"https://github.com/acme/api/issues/7"}}',
    );
    expect(json).toContain('"text":"api@20fc434"');
    expect(json).toContain('"text":"FEL-12"');
    expect(json).not.toContain('refactor: rename');
  });

  test('fallbackText is non-empty and clean', () => {
    const msg = buildDigest({
      ...base,
      entries: [blocked, other],
      missing: [{ login: 'carol' }],
    });
    expect(msg.fallbackText.length).toBeGreaterThan(0);
    expect(msg.fallbackText).not.toContain('[object');
  });
});

describe('buildDailyPost', () => {
  test('renders one person as a short message', () => {
    const msg = buildDailyPost(
      entry('alice', 'U1', { blockers: [{ text: 'stuck' }] }),
      team('pt-BR', ['alice']),
      date,
      true,
    );
    const text = msg.blocks.map(blockText).join('\n');
    expect(text).toContain('<U1>');
    expect(text).toContain('alice did y');
    expect(text).toContain('stuck');
    expect(msg.fallbackText).not.toContain('[object');
    expect(msg.fallbackText.length).toBeGreaterThan(0);
  });

  test('shows support requests after the blockers', () => {
    const msg = buildDailyPost(
      entry('alice', 'U1', {
        blockers: [{ text: 'stuck' }],
        support: [{ text: 'need a reviewer' }],
      }),
      team('en', ['alice']),
      date,
      true,
    );
    const texts = msg.blocks.map(blockText);
    const idxBlocker = texts.findIndex((t) => t.includes('stuck'));
    const idxSupport = texts.indexOf('🤝 Support requests:');
    expect(idxSupport).toBeGreaterThan(idxBlocker);
    expect(texts[idxSupport + 1]).toBe('need a reviewer');
  });

  test('without late has no late line', () => {
    const msg = buildDailyPost(entry('alice', undefined), team('en', ['alice']), date, false);
    expect(msg.fallbackText).not.toContain('Daily sent after the digest');
    expect(msg.fallbackText).toContain('alice');
    expect(msg.fallbackText).toContain('alice does t');
  });

  test('with late opens with the late line', () => {
    const msg = buildDailyPost(entry('alice', undefined), team('en', ['alice']), date, true);
    expect(msg.fallbackText.startsWith('Daily sent after the digest:')).toBe(true);
  });
});

describe('buildDigestSummary', () => {
  test('lists blockers, support and missing without per-person sections', () => {
    const msg = buildDigestSummary({
      team: team('en', ['alice', 'bob']),
      date,
      entries: [entry('alice', undefined, { blockers: [{ text: 'stuck on deploy' }] })],
      missing: [{ login: 'bob' }],
    });
    expect(msg.fallbackText).toContain('stuck on deploy');
    expect(msg.fallbackText).toContain('Did not send the daily:');
    expect(msg.fallbackText).toContain('bob');
    expect(msg.fallbackText).not.toContain('Today:');
    expect(msg.fallbackText).not.toContain('alice does t');
  });

  test('says everyone sent when nothing is open', () => {
    const msg = buildDigestSummary({
      team: team('en', ['alice']),
      date,
      entries: [entry('alice', undefined)],
      missing: [],
    });
    expect(msg.fallbackText).toContain('Everyone sent the daily and nobody is blocked.');
  });

  test('says everyone sent in pt-BR', () => {
    const msg = buildDigestSummary({
      team: team('pt-BR', ['alice']),
      date,
      entries: [entry('alice', undefined)],
      missing: [],
    });
    expect(msg.fallbackText).toContain('Todos enviaram a daily e ninguém está impedido.');
  });
});
