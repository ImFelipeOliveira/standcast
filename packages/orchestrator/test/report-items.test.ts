import { expect, test } from 'bun:test';
import {
  cardIdentifiers,
  type ItemSource,
  isInternal,
  itemLinks,
  rawItem,
  revertTarget,
  stripContacts,
} from '../src';

function src(o: { title: string; labels?: string[] }): ItemSource {
  return {
    pullRequests: [
      {
        number: 1,
        url: 'https://github.com/acme/api/pull/1',
        title: o.title,
        body: '',
        labels: o.labels ?? [],
        headRef: 'x',
        repository: 'acme/api',
        reachedAt: new Date('2026-11-18T13:00:00.000Z'),
      },
    ],
    card: null,
  };
}

test('internal prefixes and bots are internal; feat, fix and revert are not', () => {
  expect(isInternal('chore(deps): bump x', 'alice')).toBe(true);
  expect(isInternal('refactor!: drop y', 'alice')).toBe(true);
  expect(isInternal('feat: pix', 'dependabot[bot]')).toBe(true);
  expect(isInternal('fix: recibo', 'alice')).toBe(false);
  expect(isInternal('Revert "feat: pix"', 'alice')).toBe(false);
});

test('card identifiers come from branch, title, body and Linear URLs, at most three', () => {
  expect(
    cardIdentifiers(
      'alice/pag-88-pix',
      'feat: PIX',
      'see https://linear.app/acme/issue/PAG-91/x and PAG-88',
    ),
  ).toEqual(['PAG-88', 'PAG-91']);
});

test('revert target is read from GitHub revert body', () => {
  expect(revertTarget('Reverts acme/api#412\n\nbecause')).toEqual({
    owner: 'acme',
    repo: 'api',
    number: 412,
  });
  expect(revertTarget('reverts nothing')).toBeNull();
});

test('stripContacts removes emails and phones but keeps versions, dates and plain numbers', () => {
  expect(stripContacts('Ana ana@cliente.com ligou de (11) 91234-5678 e +55 11 91234-5678')).toBe(
    'Ana ligou de e',
  );
  expect(stripContacts('app 5.2.1 em 2026-11-24, 30 dias')).toBe(
    'app 5.2.1 em 2026-11-24, 30 dias',
  );
});

test('stripContacts removes @mentions after emails, keeping the text around them', () => {
  expect(stripContacts('cc @alice')).toBe('cc');
  expect(stripContacts('@bob-dev fixed it')).toBe('fixed it');
  expect(stripContacts('export (@bob) done')).toBe('export () done');
  expect(stripContacts('ask ana@x.com or @carol today')).toBe('ask or today');
  expect(stripContacts('price@2x stays')).toBe('price@2x stays');
});

test('raw item drops the conventional prefix, is fixed for fix titles or bug labels, else new', () => {
  expect(rawItem(src({ title: 'fix(app): recibo duplicado' })).kind).toBe('fixed');
  expect(rawItem(src({ title: 'fix(app): recibo duplicado' })).title).toBe('recibo duplicado');
  expect(rawItem(src({ title: 'Pix agendado', labels: ['Bug'] })).kind).toBe('fixed');
  expect(rawItem(src({ title: 'feat: pix' })).kind).toBe('new');
  expect(rawItem(src({ title: 'feat: pix' })).liveSince).toBe('2026-11-18T13:00:00.000Z');
});

test('item links list pull requests then the card', () => {
  const s = {
    ...src({ title: 'x' }),
    card: {
      identifier: 'PAG-1',
      url: 'https://linear.app/a/issue/PAG-1',
      title: '',
      description: '',
      labels: [],
    },
  };
  expect(itemLinks(s).map((l) => l.label)).toEqual(['api#1', 'PAG-1']);
});

test('phones and long digit runs are removed whole; versions, dates, money and refs stay', () => {
  for (const phone of [
    '+1 415-555-2671',
    '+1 (415) 555-2671',
    '415-555-2671',
    '+351 912 345 678',
    '0800 123 4567',
    '(11) 9 1234-5678',
    '+55 11 9 1234-5678',
    '(11) 91234-5678',
    '+55 11 91234-5678',
  ]) {
    expect(stripContacts(`ligar ${phone} hoje`)).toBe('ligar hoje');
  }
  expect(stripContacts('pedido 123456789012')).toBe('pedido');
  expect(stripContacts('acct_1234567890')).toBe('acct_');
  for (const keep of [
    '5.2.1',
    '1.2.3.4567',
    '2026-11-24',
    'R$ 1.234,56',
    '#12345',
    '30 dias',
    'PR 412',
  ]) {
    expect(stripContacts(keep)).toBe(keep);
  }
  expect(stripContacts('em 2026-11-24 30 dias')).toBe('em 2026-11-24 30 dias');
});

test('titles are never empty and fall back to the card title, then the pull request label', () => {
  expect(rawItem(src({ title: 'feat: ana@x.com' })).title).toBe('api#1');
  const withCard = {
    ...src({ title: 'feat: ana@x.com' }),
    card: {
      identifier: 'PAG-1',
      url: 'https://linear.app/a/issue/PAG-1',
      title: 'Pix agendado',
      description: '',
      labels: [],
    },
  };
  expect(rawItem(withCard).title).toBe('Pix agendado');
});

test('grouped pull requests use the first title and the oldest reachedAt', () => {
  const [a] = src({ title: 'feat: primeiro' }).pullRequests;
  const item = rawItem({
    card: null,
    pullRequests: [
      { ...a, reachedAt: new Date('2026-11-20T00:00:00.000Z') },
      { ...a, title: 'feat: segundo', reachedAt: new Date('2026-11-19T00:00:00.000Z') },
    ],
  });
  expect(item.title).toBe('primeiro');
  expect(item.liveSince).toBe('2026-11-19T00:00:00.000Z');
  expect(item.links).toHaveLength(2);
});

test('card identifiers are capped at three', () => {
  expect(cardIdentifiers('A-1 B-2 C-3 D-4')).toEqual(['A-1', 'B-2', 'C-3']);
});

test('only known conventional prefixes are stripped; fix detection is word-bounded', () => {
  expect(rawItem(src({ title: 'Pix: agendamento' })).title).toBe('Pix: agendamento');
  expect(rawItem(src({ title: 'hotfix: x' })).kind).toBe('fixed');
  expect(rawItem(src({ title: 'Fixes login' })).kind).toBe('fixed');
  expect(rawItem(src({ title: 'fixture: x' })).kind).toBe('new');
});
