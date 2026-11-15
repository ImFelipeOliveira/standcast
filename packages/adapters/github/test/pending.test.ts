import { describe, expect, test } from 'bun:test';
import { listPendingPullRequests, PENDING_SEARCH_LIMIT } from '../src/pending';
import { type Call, octokitWith } from './helpers';

type Node = Record<string, unknown>;

function pullNode(overrides: Node = {}): Node {
  return {
    url: 'https://github.com/acme/api/pull/1',
    title: 'Add billing',
    isDraft: false,
    createdAt: '2026-11-10T12:00:00Z',
    repository: { nameWithOwner: 'acme/api' },
    reviewDecision: null,
    commits: { nodes: [{ commit: { statusCheckRollup: null } }] },
    ...overrides,
  };
}

function graphqlRoute(own: Node[], requested: Node[]) {
  return {
    body: JSON.stringify({ data: { own: { nodes: own }, requested: { nodes: requested } } }),
  };
}

function graphqlBody(calls: Call[]): { query: string; variables: Record<string, unknown> } {
  const call = calls.find((c) => c.url.pathname === '/graphql');
  return JSON.parse(call?.body ?? '{}');
}

describe('listPendingPullRequests', () => {
  test('listPendingPullRequests maps both searches', async () => {
    const own = [
      pullNode({
        url: 'https://github.com/acme/api/pull/1',
        title: 'Add billing',
        isDraft: true,
        reviewDecision: 'CHANGES_REQUESTED',
        commits: { nodes: [{ commit: { statusCheckRollup: { state: 'ERROR' } } }] },
      }),
      pullNode({
        url: 'https://github.com/acme/api/pull/2',
        title: 'Fix login',
        reviewDecision: 'APPROVED',
        commits: { nodes: [{ commit: { statusCheckRollup: { state: 'EXPECTED' } } }] },
      }),
    ];
    const requested = [
      pullNode({
        url: 'https://github.com/acme/web/pull/7',
        title: 'Refactor db',
        createdAt: '2026-11-12T08:30:00Z',
        repository: { nameWithOwner: 'acme/web' },
        reviewDecision: 'REVIEW_REQUIRED',
        commits: { nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }] },
      }),
      pullNode({
        url: 'https://github.com/acme/web/pull/8',
        title: 'Bump deps',
        reviewDecision: 'SOMETHING_ELSE',
        commits: { nodes: [] },
      }),
    ];
    const { octokit, calls } = octokitWith({
      'GET /users/acme': { body: JSON.stringify({ type: 'Organization' }) },
      'POST /graphql': graphqlRoute(own, requested),
    });

    const pending = await listPendingPullRequests(octokit, 'acme', 'alice');

    const body = graphqlBody(calls);
    expect(body.variables.own).toBe('is:pr is:open author:alice org:acme');
    expect(body.variables.requested).toBe('is:pr is:open user-review-requested:alice org:acme');
    expect(body.query).not.toContain('alice');
    expect(body.query).not.toContain('acme');
    expect(body.query).toContain('$own: String!');
    expect(body.query).toContain('$requested: String!');
    expect(body.query).toContain(`first: ${PENDING_SEARCH_LIMIT}`);
    expect(calls.find((c) => c.url.pathname === '/graphql')?.signal).toBeInstanceOf(AbortSignal);

    expect(pending.truncated).toBe(false);
    expect(pending.items).toEqual([
      {
        kind: 'own_pr',
        ref: {
          kind: 'pull_request',
          url: 'https://github.com/acme/api/pull/1',
          title: 'Add billing',
        },
        title: 'Add billing',
        repo: 'acme/api',
        since: '2026-11-10T12:00:00Z',
        draft: true,
        reviewDecision: 'changes_requested',
        checks: 'failure',
      },
      {
        kind: 'own_pr',
        ref: {
          kind: 'pull_request',
          url: 'https://github.com/acme/api/pull/2',
          title: 'Fix login',
        },
        title: 'Fix login',
        repo: 'acme/api',
        since: '2026-11-10T12:00:00Z',
        draft: false,
        reviewDecision: 'approved',
        checks: 'pending',
      },
      {
        kind: 'review_requested',
        ref: {
          kind: 'pull_request',
          url: 'https://github.com/acme/web/pull/7',
          title: 'Refactor db',
        },
        title: 'Refactor db',
        repo: 'acme/web',
        since: '2026-11-12T08:30:00Z',
        draft: false,
        reviewDecision: 'review_required',
        checks: 'success',
      },
      {
        kind: 'review_requested',
        ref: {
          kind: 'pull_request',
          url: 'https://github.com/acme/web/pull/8',
          title: 'Bump deps',
        },
        title: 'Bump deps',
        repo: 'acme/api',
        since: '2026-11-10T12:00:00Z',
        draft: false,
        reviewDecision: null,
        checks: null,
      },
    ]);
  });

  test('listPendingPullRequests uses the user qualifier for user accounts', async () => {
    const { octokit, calls } = octokitWith({
      'GET /users/alice': { body: JSON.stringify({ type: 'User' }) },
      'POST /graphql': graphqlRoute([], []),
    });

    await listPendingPullRequests(octokit, 'alice', 'alice');

    expect(graphqlBody(calls).variables.own).toBe('is:pr is:open author:alice user:alice');
  });

  test('listPendingPullRequests clamps titles', async () => {
    const { octokit } = octokitWith({
      'GET /users/acme': { body: JSON.stringify({ type: 'Organization' }) },
      'POST /graphql': graphqlRoute([pullNode({ title: `Fix‮ ${'x'.repeat(300)}` })], []),
    });

    const pending = await listPendingPullRequests(octokit, 'acme', 'alice');

    expect(pending.items[0]?.title).not.toContain('‮');
    expect(Array.from(pending.items[0]?.title ?? '').length).toBeLessThan(300);
    expect(pending.items[0]?.ref.title).toBe(pending.items[0]?.title);
  });

  test('listPendingPullRequests sets truncated at 50 results', async () => {
    const full = Array.from({ length: PENDING_SEARCH_LIMIT }, (_, index) =>
      pullNode({ url: `https://github.com/acme/api/pull/${index + 1}` }),
    );
    const { octokit } = octokitWith({
      'GET /users/acme': { body: JSON.stringify({ type: 'Organization' }) },
      'POST /graphql': graphqlRoute([], full),
    });

    const pending = await listPendingPullRequests(octokit, 'acme', 'alice');

    expect(PENDING_SEARCH_LIMIT).toBe(50);
    expect(pending.truncated).toBe(true);
    expect(pending.items).toHaveLength(50);
  });

  test('listPendingPullRequests throws when the request fails', async () => {
    const { octokit } = octokitWith({
      'GET /users/acme': { body: JSON.stringify({ type: 'Organization' }) },
      'POST /graphql': { body: JSON.stringify({ data: null, errors: [{ message: 'boom' }] }) },
    });

    await expect(listPendingPullRequests(octokit, 'acme', 'alice')).rejects.toThrow();
  });
});
