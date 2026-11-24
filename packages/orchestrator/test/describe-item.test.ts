import { expect, test } from 'bun:test';
import { type TextModel, TextModelError, type TextModelRequest } from '@standcast/core';
import {
  describeItem,
  FIELD_MAX,
  type ItemSource,
  itemLinks,
  MAX_SOURCE_CHARS,
  rawItem,
} from '../src';

const source: ItemSource = {
  pullRequests: [
    {
      number: 7,
      url: 'https://github.com/acme/api/pull/7',
      title: 'fix: receipt total',
      body: 'Totals were wrong. See ACME-12.',
      labels: ['bug'],
      headRef: 'x',
      repository: 'acme/api',
      reachedAt: new Date('2026-11-18T13:00:00.000Z'),
    },
  ],
  card: {
    identifier: 'ACME-12',
    url: 'https://linear.app/acme/issue/ACME-12',
    title: 'Receipt total',
    description: 'desc',
    labels: ['Bug'],
  },
};

function fake(answer: string | Error) {
  const requests: TextModelRequest[] = [];
  const model: TextModel = {
    completeJson: async (request) => {
      requests.push(request);
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
  return { model, requests };
}

const ok = (o: object) => JSON.stringify({ kind: 'fixed', title: 'Receipt total fixed', ...o });

test('valid answer becomes an item with links and live since from the source', async () => {
  const { model } = fake(ok({ problem: 'Wrong total', whatChanges: 'ignored' }));
  const item = await describeItem(model, source, 'en');
  if (typeof item === 'string' || 'error' in item) throw new Error('unexpected');
  expect(item.kind).toBe('fixed');
  expect(item.title).toBe('Receipt total fixed');
  expect(item.links).toEqual(itemLinks(source));
  expect(item.liveSince).toBe(rawItem(source).liveSince);
  expect(item.problem).toBe('Wrong total');
  expect(item.whatChanges).toBeUndefined();
});

test('the prompt marks source text as data and names the language', async () => {
  const { model, requests } = fake(ok({}));
  await describeItem(model, source, 'pt-BR');
  expect(requests[0]?.system).toContain('pt-BR');
  expect(requests[0]?.user).toContain('<source>');
  expect(requests[0]?.user).toContain('ACME-12');
});

test('source text is cut at MAX_SOURCE_CHARS', async () => {
  const big = structuredClone(source);
  big.pullRequests[0].body = 'x'.repeat(MAX_SOURCE_CHARS * 3);
  const { model, requests } = fake(ok({}));
  await describeItem(model, big, 'en');
  const user = requests[0]?.user ?? '';
  const inner = user.slice(user.indexOf('<source>') + 8, user.indexOf('</source>'));
  expect(inner.length).toBeLessThanOrEqual(MAX_SOURCE_CHARS + 2);
});

test('non JSON, unknown kind or missing title falls back to the raw item', async () => {
  for (const answer of [
    'nope',
    JSON.stringify({ kind: 'huge', title: 'x' }),
    JSON.stringify({ kind: 'new' }),
    JSON.stringify({ kind: 'new', title: 'x', extra: 1 }),
  ]) {
    expect(await describeItem(fake(answer).model, source, 'en')).toEqual(rawItem(source));
  }
  expect(await describeItem(null, source, 'en')).toEqual(rawItem(source));
});

test('internal answer returns internal', async () => {
  expect(
    await describeItem(fake(JSON.stringify({ kind: 'internal', title: 'x' })).model, source, 'en'),
  ).toBe('internal');
});

test('a ticket not present verbatim in the source is dropped; one present is kept', async () => {
  const dropped = await describeItem(fake(ok({ ticket: 'ZZZ-9' })).model, source, 'en');
  const kept = await describeItem(fake(ok({ ticket: 'ACME-12' })).model, source, 'en');
  expect(dropped).not.toHaveProperty('ticket');
  expect(kept).toHaveProperty('ticket', 'ACME-12');
});

test('emails and phones are stripped from every field', async () => {
  const item = await describeItem(
    fake(
      ok({
        title: 'Fix for a@b.com',
        problem: 'Call +55 11 91234-5678 now',
        customerAction: 'mail x@y.io',
      }),
    ).model,
    source,
    'en',
  );
  const text = JSON.stringify(item);
  expect(text).not.toContain('@');
  expect(text).not.toContain('91234');
});

test('fields over FIELD_MAX are cut, empty fields are omitted', async () => {
  const item = await describeItem(
    fake(ok({ problem: 'p'.repeat(FIELD_MAX * 2), whoWasAffected: '  ' })).model,
    source,
    'en',
  );
  if (typeof item === 'string' || 'error' in item) throw new Error('unexpected');
  expect(item.problem?.length).toBe(FIELD_MAX);
  expect(item).not.toHaveProperty('whoWasAffected');
});

test('timeout falls back to raw; rejected_key returns the error', async () => {
  expect(await describeItem(fake(new TextModelError('timeout', 't')).model, source, 'en')).toEqual(
    rawItem(source),
  );
  const rejected = new TextModelError('rejected_key', 'k');
  expect(await describeItem(fake(rejected).model, source, 'en')).toEqual({ error: rejected });
});
