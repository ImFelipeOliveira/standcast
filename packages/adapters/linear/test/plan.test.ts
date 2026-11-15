import { describe, expect, test } from 'bun:test';
import { type CardTarget, cardKey } from '@standcast/core';
import { createLinearClient, LinearGraphqlError, lookupPlannedCards } from '../src';
import { fakeFetch } from './helpers';

const since = new Date('2026-11-13T12:00:00.000Z');

function target(identifier: string, workspace = 'acme'): CardTarget {
  return {
    key: cardKey(workspace, identifier),
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
      since: '2026-11-13T12:00:00.000Z',
      t0: 'SECRET',
      n0: 41,
      t1: 'OTHER',
      n1: 7,
    });
    expect(sent.query).toContain('$userId: ID!');
    expect(sent.query).toContain('$since: DateTimeOrDuration!');
    expect(sent.query).toContain('$t0: String!');
    expect(sent.query).toContain('$n0: Float!');
    expect(sent.query).toContain('$t1: String!');
    expect(sent.query).toContain('$n1: Float!');
    expect(sent.query).toContain('{ team: { key: { eq: $t0 } }, number: { eq: $n0 } }');
    expect(sent.query).toContain('{ team: { key: { eq: $t1 } }, number: { eq: $n1 } }');
    expect(sent.query).toContain('first: 10');
    expect(sent.query).toContain('history(first: 50)');
    expect(sent.query).toContain(
      'comments(filter: { user: { id: { eq: $userId } }, createdAt: { gte: $since } }, first: 20)',
    );
    expect(sent.query).not.toContain('last:');
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

    expect(results.get(cardKey('acme', 'OLD-3'))).toEqual({ ok: false });
    expect(results.get(cardKey('acme', 'ENG-12'))).toEqual({ ok: true, evidence: [] });
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

    expect(results.get(cardKey('acme', 'ENG-12'))).toEqual({
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
    expect(results.get(cardKey('acme', 'ENG-13'))).toEqual({ ok: true, evidence: [] });
  });

  test('lookupPlannedCards leaves a card of another workspace with the same identifier unknown', async () => {
    const f = reply([issue('ENG-12')]);
    const results = await lookupPlannedCards(createLinearClient('t', f.fetch), {
      userId: 'u',
      since,
      targets: [target('ENG-12', 'other'), target('ENG-12')],
    });
    expect(results.get(cardKey('other', 'ENG-12'))).toEqual({ ok: false });
    expect(results.get(cardKey('acme', 'ENG-12'))).toEqual({ ok: true, evidence: [] });
  });

  test('lookupPlannedCards counts a state change and a comment exactly at since', async () => {
    const at = '2026-11-13T12:00:00.000Z';
    const f = reply([
      issue(
        'ENG-12',
        [{ createdAt: at, toState: { name: 'In Progress' } }],
        [{ createdAt: at, url: 'https://linear.app/acme/comment/edge' }],
      ),
    ]);

    const results = await lookupPlannedCards(createLinearClient('t', f.fetch), {
      userId: 'u',
      since,
      targets: [target('ENG-12')],
    });

    expect(results.get(cardKey('acme', 'ENG-12'))).toEqual({
      ok: true,
      evidence: [
        { kind: 'state_changed', url: 'https://linear.app/acme/issue/ENG-12/title-slug', at },
        { kind: 'comment', url: 'https://linear.app/acme/comment/edge', at },
      ],
    });
  });

  test('lookupPlannedCards leaves a full history page without evidence unknown when it may miss in-window entries', async () => {
    const minutes = (count: number, from: string): Change[] =>
      Array.from({ length: count }, (_, i) => ({
        createdAt: new Date(new Date(from).getTime() + i * 60_000).toISOString(),
        toState: null,
      }));
    const f = reply([
      issue('ENG-1', minutes(50, '2026-11-13T12:00:00.000Z')),
      issue('ENG-2', [
        ...minutes(1, '2026-11-13T11:00:00.000Z'),
        ...minutes(49, '2026-11-13T13:00:00.000Z'),
      ]),
      issue('ENG-3', minutes(49, '2026-11-13T13:00:00.000Z')),
      issue('ENG-4', minutes(50, '2026-11-13T13:00:00.000Z'), [
        { createdAt: '2026-11-13T14:00:00.000Z', url: 'https://linear.app/acme/comment/c' },
      ]),
    ]);

    const results = await lookupPlannedCards(createLinearClient('t', f.fetch), {
      userId: 'u',
      since,
      targets: ['ENG-1', 'ENG-2', 'ENG-3', 'ENG-4'].map((id) => target(id)),
    });

    expect(results.get(cardKey('acme', 'ENG-1'))).toEqual({ ok: false });
    expect(results.get(cardKey('acme', 'ENG-2'))).toEqual({ ok: true, evidence: [] });
    expect(results.get(cardKey('acme', 'ENG-3'))).toEqual({ ok: true, evidence: [] });
    expect(results.get(cardKey('acme', 'ENG-4'))).toEqual({
      ok: true,
      evidence: [
        {
          kind: 'comment',
          url: 'https://linear.app/acme/comment/c',
          at: '2026-11-13T14:00:00.000Z',
        },
      ],
    });
  });

  test('lookupPlannedCards leaves a full comment page without evidence unknown', async () => {
    const comments = Array.from({ length: 20 }, (_, i) => ({
      createdAt: 'not a date',
      url: `https://linear.app/acme/comment/${i}`,
    }));
    const f = reply([issue('ENG-1', [], comments), issue('ENG-2', [], comments.slice(0, 19))]);

    const results = await lookupPlannedCards(createLinearClient('t', f.fetch), {
      userId: 'u',
      since,
      targets: [target('ENG-1'), target('ENG-2')],
    });

    expect(results.get(cardKey('acme', 'ENG-1'))).toEqual({ ok: false });
    expect(results.get(cardKey('acme', 'ENG-2'))).toEqual({ ok: true, evidence: [] });
  });

  test('lookupPlannedCards matches identifiers regardless of case', async () => {
    const f = reply([issue('ENG-12')]);
    const results = await lookupPlannedCards(createLinearClient('t', f.fetch), {
      userId: 'u',
      since,
      targets: [
        {
          key: cardKey('acme', 'eng-12'),
          identifier: 'eng-12',
          url: 'https://linear.app/acme/issue/eng-12',
        },
      ],
    });
    const sent = JSON.parse(f.calls[0]?.body ?? '');
    expect(sent.variables).toEqual({ userId: 'u', since: since.toISOString(), t0: 'ENG', n0: 12 });
    expect(results.get(cardKey('acme', 'ENG-12'))).toEqual({ ok: true, evidence: [] });
  });

  test('lookupPlannedCards scopes every card to the person and leaves unassigned cards unknown', async () => {
    const f = reply([issue('ENG-12')]);

    const results = await lookupPlannedCards(createLinearClient('t', f.fetch), {
      userId: 'lin-user-1',
      since,
      targets: [target('ENG-12'), target('PRIV-9')],
    });

    const sent = JSON.parse(f.calls[0]?.body ?? '');
    expect(sent.query).toMatch(/filter: \{\s*assignee: \{ id: \{ eq: \$userId \} \}\s*or: \[/);
    expect(sent.query).not.toContain('lin-user-1');
    expect(sent.variables.userId).toBe('lin-user-1');
    expect(results.get(cardKey('acme', 'PRIV-9'))).toEqual({ ok: false });
    expect(results.get(cardKey('acme', 'ENG-12'))).toEqual({ ok: true, evidence: [] });
  });

  test('lookupPlannedCards looks up only the first ten valid targets', async () => {
    const targets = Array.from({ length: 11 }, (_, i) => target(`ENG-${i + 1}`));
    const f = reply(targets.map((t) => issue(t.identifier)));

    const results = await lookupPlannedCards(createLinearClient('t', f.fetch), {
      userId: 'u',
      since,
      targets: [{ key: cardKey('acme', 'bad'), identifier: 'bad', url: 'x' }, ...targets],
    });

    const sent = JSON.parse(f.calls[0]?.body ?? '');
    expect(sent.query.match(/number: \{ eq: \$n\d+ \}/g)).toHaveLength(10);
    expect(sent.query).toContain('$n9: Float!');
    expect(sent.query).not.toContain('$n10');
    expect(sent.variables.n9).toBe(10);
    expect(sent.variables).not.toHaveProperty('t10');
    expect(results.size).toBe(10);
    expect(results.has(cardKey('acme', 'ENG-10'))).toBe(true);
    expect(results.has(cardKey('acme', 'ENG-11'))).toBe(false);
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
    const bad: CardTarget = { key: cardKey('acme', 'ENG 12'), identifier: 'ENG 12', url: 'x' };
    const results = await lookupPlannedCards(createLinearClient('t', f.fetch), {
      userId: 'u',
      since,
      targets: [bad, { ...bad, key: cardKey('acme', '12-ENG'), identifier: '12-ENG' }],
    });
    expect(f.calls).toHaveLength(0);
    expect(results.get(cardKey('acme', 'ENG 12'))).toBeUndefined();
  });

  test('lookupPlannedCards indexes variables only over well-formed identifiers', async () => {
    const f = reply([issue('ENG-5')]);
    const results = await lookupPlannedCards(createLinearClient('t', f.fetch), {
      userId: 'u',
      since,
      targets: [{ key: cardKey('acme', '$x-1'), identifier: '$x-1', url: 'x' }, target('ENG-5')],
    });
    const sent = JSON.parse(f.calls[0]?.body ?? '');
    expect(sent.variables).toEqual({ userId: 'u', since: since.toISOString(), t0: 'ENG', n0: 5 });
    expect(sent.query).not.toContain('$x');
    expect(results.get(cardKey('acme', 'ENG-5'))).toEqual({ ok: true, evidence: [] });
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
