import { describe, expect, test } from 'bun:test';
import { type CardTarget, cardKey } from '@standcast/core';
import { createLinearClient, LinearGraphqlError, lookupPlannedCards } from '../src';
import { fakeFetch } from './helpers';

const since = new Date('2026-11-13T12:00:00.000Z');

function target(identifier: string, workspace = 'acme'): CardTarget {
  return {
    key: cardKey(identifier),
    identifier,
    url: `https://linear.app/${workspace}/issue/${identifier}`,
  };
}

type Change = { createdAt: string; toState: { name: string } | null };
type Comment = { createdAt: string; url: string };

function issue(identifier: string, history: Change[] = [], comments: Comment[] = []) {
  return {
    identifier,
    url: `https://linear.app/acme/issue/${identifier}/title-slug`,
    history: { nodes: history },
    comments: { nodes: comments },
  };
}

function reply(nodes: unknown[]) {
  return fakeFetch({ body: JSON.stringify({ data: { issues: { nodes } } }) });
}

describe('lookupPlannedCards', () => {
  test('lookupPlannedCards queries by team and number as variables', async () => {
    const f = reply([issue('SECRET-41'), issue('OTHER-7')]);

    await lookupPlannedCards(createLinearClient('t', f.fetch), {
      userId: 'lin-user-1',
      since,
      targets: [target('SECRET-41'), target('OTHER-7')],
    });

    expect(f.calls).toHaveLength(1);
    const sent = JSON.parse(f.calls[0]?.body ?? '');
    expect(sent.variables).toEqual({
      userId: 'lin-user-1',
      t0: 'SECRET',
      n0: 41,
      t1: 'OTHER',
      n1: 7,
    });
    expect(sent.query).toContain('$userId: ID!');
    expect(sent.query).toContain('$t0: String!');
    expect(sent.query).toContain('$n0: Float!');
    expect(sent.query).toContain('$t1: String!');
    expect(sent.query).toContain('$n1: Float!');
    expect(sent.query).toContain('{ team: { key: { eq: $t0 } }, number: { eq: $n0 } }');
    expect(sent.query).toContain('{ team: { key: { eq: $t1 } }, number: { eq: $n1 } }');
    expect(sent.query).toContain('first: 10');
    expect(sent.query).toContain('history(last: 50)');
    expect(sent.query).toContain('comments(filter: { user: { id: { eq: $userId } } }, last: 20)');
    for (const value of ['SECRET', 'OTHER', '41', 'lin-user-1', 'acme']) {
      expect(sent.query).not.toContain(value);
    }
  });

  test('lookupPlannedCards keeps found cards when one identifier is missing', async () => {
    const f = reply([issue('ENG-12')]);

    const results = await lookupPlannedCards(createLinearClient('t', f.fetch), {
      userId: 'u',
      since,
      targets: [target('ENG-12'), target('OLD-3')],
    });

    expect(results.get(cardKey('OLD-3'))).toEqual({ ok: false });
    expect(results.get(cardKey('ENG-12'))).toEqual({ ok: true, evidence: [] });
    expect(results.size).toBe(2);
  });

  test('lookupPlannedCards counts only changes and comments inside the window', async () => {
    const f = reply([
      issue(
        'ENG-12',
        [
          { createdAt: '2026-11-13T11:59:59.000Z', toState: { name: 'In Progress' } },
          { createdAt: '2026-11-13T13:00:00.000Z', toState: { name: 'In Review' } },
          { createdAt: '2026-11-13T15:00:00.000Z', toState: { name: 'Done' } },
          { createdAt: '2026-11-13T16:00:00.000Z', toState: null },
        ],
        [
          { createdAt: '2026-11-12T09:00:00.000Z', url: 'https://linear.app/acme/comment/old' },
          { createdAt: '2026-11-13T14:00:00.000Z', url: 'https://linear.app/acme/comment/new' },
          { createdAt: '2026-11-13T12:30:00.000Z', url: 'https://linear.app/acme/comment/mid' },
        ],
      ),
      issue(
        'ENG-13',
        [{ createdAt: '2026-11-10T10:00:00.000Z', toState: { name: 'Done' } }],
        [{ createdAt: '2026-11-11T10:00:00.000Z', url: 'https://linear.app/acme/comment/x' }],
      ),
    ]);

    const results = await lookupPlannedCards(createLinearClient('t', f.fetch), {
      userId: 'u',
      since,
      targets: [target('ENG-12'), target('ENG-13')],
    });

    expect(results.get(cardKey('ENG-12'))).toEqual({
      ok: true,
      evidence: [
        {
          kind: 'state_changed',
          url: 'https://linear.app/acme/issue/ENG-12/title-slug',
          at: '2026-11-13T15:00:00.000Z',
        },
        {
          kind: 'comment',
          url: 'https://linear.app/acme/comment/new',
          at: '2026-11-13T14:00:00.000Z',
        },
      ],
    });
    expect(results.get(cardKey('ENG-13'))).toEqual({ ok: true, evidence: [] });
  });

  test('lookupPlannedCards matches identifiers regardless of case', async () => {
    const f = reply([issue('ENG-12')]);
    const results = await lookupPlannedCards(createLinearClient('t', f.fetch), {
      userId: 'u',
      since,
      targets: [
        {
          key: cardKey('eng-12'),
          identifier: 'eng-12',
          url: 'https://linear.app/acme/issue/eng-12',
        },
      ],
    });
    const sent = JSON.parse(f.calls[0]?.body ?? '');
    expect(sent.variables).toEqual({ userId: 'u', t0: 'ENG', n0: 12 });
    expect(results.get(cardKey('ENG-12'))).toEqual({ ok: true, evidence: [] });
  });

  test('lookupPlannedCards makes no request without targets', async () => {
    const f = reply([]);
    const results = await lookupPlannedCards(createLinearClient('t', f.fetch), {
      userId: 'u',
      since,
      targets: [],
    });
    expect(results.size).toBe(0);
    expect(f.calls).toHaveLength(0);
  });

  test('lookupPlannedCards skips malformed identifiers without a request', async () => {
    const f = reply([]);
    const bad: CardTarget = { key: cardKey('ENG 12'), identifier: 'ENG 12', url: 'x' };
    const results = await lookupPlannedCards(createLinearClient('t', f.fetch), {
      userId: 'u',
      since,
      targets: [bad, { ...bad, key: cardKey('12-ENG'), identifier: '12-ENG' }],
    });
    expect(f.calls).toHaveLength(0);
    expect(results.get(cardKey('ENG 12'))).toBeUndefined();
  });

  test('lookupPlannedCards indexes variables only over well-formed identifiers', async () => {
    const f = reply([issue('ENG-5')]);
    const results = await lookupPlannedCards(createLinearClient('t', f.fetch), {
      userId: 'u',
      since,
      targets: [{ key: cardKey('$x-1'), identifier: '$x-1', url: 'x' }, target('ENG-5')],
    });
    const sent = JSON.parse(f.calls[0]?.body ?? '');
    expect(sent.variables).toEqual({ userId: 'u', t0: 'ENG', n0: 5 });
    expect(sent.query).not.toContain('$x');
    expect(results.get(cardKey('ENG-5'))).toEqual({ ok: true, evidence: [] });
  });

  test('lookupPlannedCards rethrows a graphql error', async () => {
    const f = fakeFetch({
      body: JSON.stringify({ errors: [{ message: 'bad', extensions: { code: 'INVALID_INPUT' } }] }),
    });
    await expect(
      lookupPlannedCards(createLinearClient('t', f.fetch), {
        userId: 'u',
        since,
        targets: [target('ENG-1')],
      }),
    ).rejects.toBeInstanceOf(LinearGraphqlError);
  });
});
