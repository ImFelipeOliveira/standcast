import { describe, expect, test } from 'bun:test';
import { ASSIGNED_PAGE_SIZE, createLinearClient, listAssignedOpen } from '../src';
import { fakeFetch } from './helpers';

function node(overrides: Record<string, unknown> = {}) {
  return {
    identifier: 'ENG-7',
    url: 'https://linear.app/acme/issue/ENG-7/fix-login',
    title: 'Fix login',
    updatedAt: '2026-11-13T10:00:00.000Z',
    priority: 2,
    state: { name: 'Todo' },
    ...overrides,
  };
}

function reply(nodes: unknown[]) {
  return fakeFetch({ body: JSON.stringify({ data: { issues: { nodes } } }) });
}

describe('listAssignedOpen', () => {
  test('listAssignedOpen filters started or urgent and high unstarted cards and maps priority', async () => {
    const f = reply([
      node(),
      node({
        identifier: 'ENG-8',
        url: 'https://linear.app/acme/issue/ENG-8',
        title: 'Ship it',
        priority: 1,
        state: { name: 'In Progress' },
      }),
      node({ identifier: 'ENG-9', url: 'https://linear.app/acme/issue/ENG-9', priority: 3 }),
      node({ identifier: 'ENG-10', url: 'https://linear.app/acme/issue/ENG-10', priority: 4 }),
      node({ identifier: 'ENG-11', url: 'https://linear.app/acme/issue/ENG-11', priority: 0 }),
    ]);

    const pending = await listAssignedOpen(createLinearClient('t', f.fetch), {
      userId: 'lin-user-1',
      teamKey: 'SECRETTEAM',
    });

    const sent = JSON.parse(f.calls[0]?.body ?? '');
    expect(sent.variables).toEqual({ userId: 'lin-user-1', teamKey: 'SECRETTEAM' });
    expect(sent.query).toContain('assignee: { id: { eq: $userId } }');
    expect(sent.query).toContain('team: { key: { eq: $teamKey } }');
    expect(sent.query).toContain('{ state: { type: { eq: "started" } } }');
    expect(sent.query).toContain(
      '{ state: { type: { eq: "unstarted" } }, priority: { in: [1, 2] } }',
    );
    expect(sent.query).toContain('first: 50');
    expect(sent.query).not.toContain('lin-user-1');
    expect(sent.query).not.toContain('SECRETTEAM');
    expect(pending.truncated).toBe(false);
    expect(pending.items[0]).toEqual({
      kind: 'card',
      ref: {
        kind: 'card',
        url: 'https://linear.app/acme/issue/ENG-7/fix-login',
        title: 'Fix login',
      },
      title: 'Fix login',
      since: '2026-11-13T10:00:00.000Z',
      state: 'Todo',
      priority: 'high',
    });
    expect(pending.items.map((item) => item.priority)).toEqual([
      'high',
      'urgent',
      'medium',
      'low',
      'none',
    ]);
    expect(pending.items[1]?.state).toBe('In Progress');
  });

  test('listAssignedOpen drops malformed nodes and omits a missing state', async () => {
    const f = reply([
      node({ url: '' }),
      node({ updatedAt: null }),
      null,
      node({ state: null, priority: null }),
    ]);
    const pending = await listAssignedOpen(createLinearClient('t', f.fetch), {
      userId: 'u',
      teamKey: 'ENG',
    });
    expect(pending.items).toEqual([
      {
        kind: 'card',
        ref: {
          kind: 'card',
          url: 'https://linear.app/acme/issue/ENG-7/fix-login',
          title: 'Fix login',
        },
        title: 'Fix login',
        since: '2026-11-13T10:00:00.000Z',
        priority: 'none',
      },
    ]);
  });

  test('listAssignedOpen flags a full page as truncated', async () => {
    expect(ASSIGNED_PAGE_SIZE).toBe(50);
    const nodes = Array.from({ length: ASSIGNED_PAGE_SIZE }, (_, i) =>
      node({ identifier: `ENG-${i}`, url: `https://linear.app/acme/issue/ENG-${i}` }),
    );
    const pending = await listAssignedOpen(createLinearClient('t', reply(nodes).fetch), {
      userId: 'u',
      teamKey: 'ENG',
    });
    expect(pending.truncated).toBe(true);
    expect(pending.items).toHaveLength(ASSIGNED_PAGE_SIZE);
  });
});
