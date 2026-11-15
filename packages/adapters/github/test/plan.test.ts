import { describe, expect, test } from 'bun:test';
import { type PullRequestTarget, pullRequestKey } from '@standcast/core';
import { lookupPlannedPullRequests } from '../src/plan';
import { type Call, octokitWith } from './helpers';

const since = new Date('2026-11-13T12:00:00Z');

function target(owner: string, repo: string, number: number): PullRequestTarget {
  return { key: pullRequestKey(owner, repo, number), owner, repo, number };
}

type Commit = { committedDate: string; login: string | null };
type Review = { submittedAt: string; url: string };

function pull(
  url: string,
  options: {
    commits?: Commit[];
    reviews?: Review[];
    merged?: boolean;
    mergedAt?: string | null;
    closedAt?: string | null;
  } = {},
) {
  return {
    pullRequest: {
      url,
      merged: options.merged ?? false,
      mergedAt: options.mergedAt ?? null,
      closedAt: options.closedAt ?? null,
      commits: {
        nodes: (options.commits ?? []).map((commit) => ({
          commit: {
            committedDate: commit.committedDate,
            author: { user: commit.login === null ? null : { login: commit.login } },
          },
        })),
      },
      reviews: { nodes: options.reviews ?? [] },
    },
  };
}

function graphqlBody(calls: Call[]): { query: string; variables: Record<string, unknown> } {
  const call = calls.find((c) => c.url.pathname === '/graphql');
  return JSON.parse(call?.body ?? '{}');
}

describe('lookupPlannedPullRequests', () => {
  test('lookupPlannedPullRequests builds aliases from the index and passes owner, repo and number as variables', async () => {
    const targets = [target('acme', 'secret-repo', 41), target('acme', 'other-thing', 7)];
    const { octokit, calls } = octokitWith({
      'POST /graphql': {
        body: JSON.stringify({
          data: {
            p0: pull('https://github.com/acme/secret-repo/pull/41'),
            p1: pull('https://github.com/acme/other-thing/pull/7'),
          },
        }),
      },
    });

    await lookupPlannedPullRequests(octokit, { login: 'zed-login', since, targets });

    const body = graphqlBody(calls);
    expect(body.query).toContain('p0:');
    expect(body.query).toContain('p1:');
    expect(body.query).toContain('$o0');
    expect(body.query).toContain('$o0: String!');
    expect(body.query).toContain('$r1: String!');
    expect(body.query).toContain('$n1: Int!');
    expect(body.query).toContain('$login: String!');
    for (const value of ['acme', 'secret-repo', 'other-thing', '41', 'zed-login']) {
      expect(body.query).not.toContain(value);
    }
    expect(body.variables).toEqual({
      login: 'zed-login',
      o0: 'acme',
      r0: 'secret-repo',
      n0: 41,
      o1: 'acme',
      r1: 'other-thing',
      n1: 7,
    });
    expect(calls[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  test('lookupPlannedPullRequests finds commits, reviews and merges inside the window only', async () => {
    const quiet = target('acme', 'api', 1);
    const active = target('acme', 'api', 2);
    const merged = target('acme', 'web', 3);
    const closed = target('acme', 'web', 4);
    const { octokit } = octokitWith({
      'POST /graphql': {
        body: JSON.stringify({
          data: {
            p0: pull('https://github.com/acme/api/pull/1', {
              commits: [
                { committedDate: '2026-11-13T15:00:00Z', login: 'bob' },
                { committedDate: '2026-11-12T15:00:00Z', login: 'alice' },
                { committedDate: '2026-11-13T16:00:00Z', login: null },
              ],
              reviews: [{ submittedAt: '2026-11-12T09:00:00Z', url: 'https://github.com/r/old' }],
              merged: true,
              mergedAt: '2026-11-11T10:00:00Z',
              closedAt: '2026-11-11T10:00:00Z',
            }),
            p1: pull('https://github.com/acme/api/pull/2', {
              commits: [
                { committedDate: '2026-11-13T13:00:00Z', login: 'Alice' },
                { committedDate: '2026-11-14T09:00:00Z', login: 'ALICE' },
              ],
              reviews: [
                { submittedAt: '2026-11-13T18:00:00Z', url: 'https://github.com/r/1' },
                { submittedAt: '2026-11-13T20:00:00Z', url: 'https://github.com/r/2' },
              ],
            }),
            p2: pull('https://github.com/acme/web/pull/3', {
              merged: true,
              mergedAt: '2026-11-14T08:00:00Z',
              closedAt: '2026-11-14T08:00:00Z',
            }),
            p3: pull('https://github.com/acme/web/pull/4', {
              closedAt: '2026-11-13T12:00:00Z',
            }),
          },
        }),
      },
    });

    const results = await lookupPlannedPullRequests(octokit, {
      login: 'alice',
      since,
      targets: [quiet, active, merged, closed],
    });

    expect(results.get(quiet.key)).toEqual({ ok: true, evidence: [] });
    expect(results.get(active.key)).toEqual({
      ok: true,
      evidence: [
        {
          kind: 'commit',
          url: 'https://github.com/acme/api/pull/2',
          at: '2026-11-14T09:00:00.000Z',
        },
        { kind: 'review', url: 'https://github.com/r/2', at: '2026-11-13T20:00:00.000Z' },
      ],
    });
    expect(results.get(merged.key)).toEqual({
      ok: true,
      evidence: [
        {
          kind: 'merged',
          url: 'https://github.com/acme/web/pull/3',
          at: '2026-11-14T08:00:00.000Z',
        },
      ],
    });
    expect(results.get(closed.key)).toEqual({
      ok: true,
      evidence: [
        {
          kind: 'closed',
          url: 'https://github.com/acme/web/pull/4',
          at: '2026-11-13T12:00:00.000Z',
        },
      ],
    });
  });

  test('lookupPlannedPullRequests marks an alias with errors as not ok and keeps the others', async () => {
    const kept = target('acme', 'api', 1);
    const deleted = target('acme', 'api', 2);
    const hidden = target('acme', 'private', 3);
    const { octokit } = octokitWith({
      'POST /graphql': {
        body: JSON.stringify({
          data: {
            p0: pull('https://github.com/acme/api/pull/1', {
              commits: [{ committedDate: '2026-11-13T15:00:00Z', login: 'alice' }],
            }),
            p1: { pullRequest: null },
            p2: null,
          },
          errors: [
            {
              type: 'NOT_FOUND',
              path: ['p1', 'pullRequest'],
              message: 'Could not resolve to a PullRequest with the number of 2.',
            },
            {
              type: 'NOT_FOUND',
              path: ['p2'],
              message: "Could not resolve to a Repository with the name 'acme/private'.",
            },
          ],
        }),
      },
    });

    const results = await lookupPlannedPullRequests(octokit, {
      login: 'alice',
      since,
      targets: [kept, deleted, hidden],
    });

    expect(results.get(kept.key)).toEqual({
      ok: true,
      evidence: [
        {
          kind: 'commit',
          url: 'https://github.com/acme/api/pull/1',
          at: '2026-11-13T15:00:00.000Z',
        },
      ],
    });
    expect(results.get(deleted.key)).toEqual({ ok: false });
    expect(results.get(hidden.key)).toEqual({ ok: false });
  });

  test('lookupPlannedPullRequests marks an alias named in errors as not ok even with data', async () => {
    const partial = target('acme', 'api', 1);
    const { octokit } = octokitWith({
      'POST /graphql': {
        body: JSON.stringify({
          data: { p0: pull('https://github.com/acme/api/pull/1') },
          errors: [{ path: ['p0', 'pullRequest', 'reviews'], message: 'timeout' }],
        }),
      },
    });

    const results = await lookupPlannedPullRequests(octokit, {
      login: 'alice',
      since,
      targets: [partial],
    });

    expect(results.get(partial.key)).toEqual({ ok: false });
  });

  test('lookupPlannedPullRequests throws when the request yields no data', async () => {
    const { octokit } = octokitWith({
      'POST /graphql': {
        body: JSON.stringify({ data: null, errors: [{ message: 'Something went wrong' }] }),
      },
    });

    await expect(
      lookupPlannedPullRequests(octokit, {
        login: 'alice',
        since,
        targets: [target('acme', 'api', 1)],
      }),
    ).rejects.toThrow();
  });

  test('lookupPlannedPullRequests throws on an HTTP failure', async () => {
    const { octokit } = octokitWith({
      'POST /graphql': { status: 502, body: JSON.stringify({ message: 'Bad Gateway' }) },
    });

    await expect(
      lookupPlannedPullRequests(octokit, {
        login: 'alice',
        since,
        targets: [target('acme', 'api', 1)],
      }),
    ).rejects.toThrow();
  });

  test('lookupPlannedPullRequests sends no request for no targets', async () => {
    const { octokit, calls } = octokitWith({});

    const results = await lookupPlannedPullRequests(octokit, {
      login: 'alice',
      since,
      targets: [],
    });

    expect(results.size).toBe(0);
    expect(calls).toHaveLength(0);
  });
});
