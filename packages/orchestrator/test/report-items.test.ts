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
