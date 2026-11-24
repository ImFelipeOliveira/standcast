import { describe, expect, test } from 'bun:test';
import {
  compareCommitShas,
  getPullRequestText,
  listPullRequestCommitShas,
  mergedPullRequestsForCommits,
} from '../src/production';
import { octokitWith } from './helpers';

const shaPage = (start: number, count: number) =>
  JSON.stringify({
    commits: Array.from({ length: count }, (_, index) => ({ sha: `s${start + index}` })),
  });

describe('compareCommitShas', () => {
  test('collects every sha across pages', async () => {
    const { octokit, calls } = octokitWith({
      'GET /repos/acme/api/compare/a...b': (url) => ({
        body: url.searchParams.get('page') === '1' ? shaPage(0, 100) : shaPage(100, 3),
      }),
    });
    const result = await compareCommitShas(octokit, 'acme', 'api', 'a', 'b');
    expect(result.shas).toHaveLength(103);
    expect(result.truncated).toBe(false);
    expect(calls).toHaveLength(2);
  });

  test('flags truncation at the page cap', async () => {
    const { octokit, calls } = octokitWith({
      'GET /repos/acme/api/compare/a...b': { body: shaPage(0, 100) },
    });
    const result = await compareCommitShas(octokit, 'acme', 'api', 'a', 'b');
    expect(calls).toHaveLength(10);
    expect(result.truncated).toBe(true);
  });

  test('404 falls back to the head sha, truncated', async () => {
    const { octokit } = octokitWith({});
    expect(await compareCommitShas(octokit, 'acme', 'api', 'a', 'h')).toEqual({
      shas: ['h'],
      truncated: true,
    });
  });

  test('404 after some pages keeps the collected shas, truncated', async () => {
    const { octokit } = octokitWith({
      'GET /repos/acme/api/compare/a...b': (url) =>
        url.searchParams.get('page') === '1'
          ? { body: shaPage(0, 100) }
          : { status: 404, body: '{}' },
    });
    const result = await compareCommitShas(octokit, 'acme', 'api', 'a', 'b');
    expect(result.shas).toHaveLength(100);
    expect(result.truncated).toBe(true);
  });

  test('500 propagates', async () => {
    const { octokit } = octokitWith({ 'GET /repos/acme/api/compare/a...b': { status: 500 } });
    await expect(compareCommitShas(octokit, 'acme', 'api', 'a', 'b')).rejects.toThrow();
  });
});

const pull = (number: number, merged: boolean, author: { login: string } | null = null) => ({
  number,
  url: `https://github.com/acme/api/pull/${number}`,
  title: `PR ${number}`,
  merged,
  mergedAt: merged ? '2026-11-20T10:00:00Z' : null,
  baseRefName: 'main',
  headRefName: `feat/${number}`,
  author,
});

describe('mergedPullRequestsForCommits', () => {
  test('keeps merged pull requests only, deduped, in batches of 50', async () => {
    let graphqlCalls = 0;
    const { octokit } = octokitWith({
      'POST /graphql': () => {
        graphqlCalls++;
        const data =
          graphqlCalls === 1
            ? {
                repository: {
                  c0: { associatedPullRequests: { nodes: [pull(1, true, { login: 'alice' })] } },
                  c1: { associatedPullRequests: { nodes: [pull(1, true), pull(2, false)] } },
                  c2: null,
                },
              }
            : {
                repository: {
                  c0: { associatedPullRequests: { nodes: [pull(3, true)] } },
                },
              };
        return { body: JSON.stringify({ data }) };
      },
    });
    const shas = Array.from({ length: 51 }, (_, index) => `s${index}`);
    const result = await mergedPullRequestsForCommits(octokit, 'acme', 'api', shas);
    expect(graphqlCalls).toBe(2);
    expect(result.map((item) => item.number)).toEqual([1, 3]);
    expect(result[0]).toEqual({
      number: 1,
      url: 'https://github.com/acme/api/pull/1',
      title: 'PR 1',
      author: 'alice',
      baseRef: 'main',
      headRef: 'feat/1',
      mergedAt: '2026-11-20T10:00:00Z',
    });
    expect(result[1]?.author).toBe('');
  });

  test('keeps the aliases that succeeded when others fail', async () => {
    const { octokit } = octokitWith({
      'POST /graphql': {
        body: JSON.stringify({
          data: {
            repository: {
              c0: { associatedPullRequests: { nodes: [pull(1, true)] } },
              c1: null,
            },
          },
          errors: [{ message: 'boom', path: ['repository', 'c1'] }],
        }),
      },
    });
    const result = await mergedPullRequestsForCommits(octokit, 'acme', 'api', ['a', 'b']);
    expect(result.map((item) => item.number)).toEqual([1]);
  });

  test('no shas makes no call', async () => {
    const { octokit, calls } = octokitWith({});
    expect(await mergedPullRequestsForCommits(octokit, 'acme', 'api', [])).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe('listPullRequestCommitShas', () => {
  test('lists commit shas, at most 3 pages, truncated when the last page is full', async () => {
    const { octokit, calls } = octokitWith({
      'GET /repos/acme/api/pulls/7/commits': {
        body: JSON.stringify(Array.from({ length: 100 }, (_, index) => ({ sha: `s${index}` }))),
      },
    });
    const { shas, truncated } = await listPullRequestCommitShas(octokit, 'acme', 'api', 7);
    expect(calls).toHaveLength(3);
    expect(shas).toHaveLength(300);
    expect(truncated).toBe(true);
  });

  test('a short page is not truncated', async () => {
    const { octokit } = octokitWith({
      'GET /repos/acme/api/pulls/7/commits': { body: JSON.stringify([{ sha: 's1' }]) },
    });
    expect(await listPullRequestCommitShas(octokit, 'acme', 'api', 7)).toEqual({
      shas: ['s1'],
      truncated: false,
    });
  });
});

describe('getPullRequestText', () => {
  test('returns body, labels and head ref; 404 is null', async () => {
    const { octokit } = octokitWith({
      'GET /repos/acme/api/pulls/7': {
        body: JSON.stringify({
          number: 7,
          html_url: 'https://github.com/acme/api/pull/7',
          title: 'Add login',
          body: null,
          labels: [{ name: 'feature' }, { name: 'api' }],
          head: { ref: 'feat/login' },
        }),
      },
    });
    expect(await getPullRequestText(octokit, 'acme', 'api', 7)).toEqual({
      number: 7,
      url: 'https://github.com/acme/api/pull/7',
      title: 'Add login',
      body: '',
      labels: ['feature', 'api'],
      headRef: 'feat/login',
    });
    expect(await getPullRequestText(octokit, 'acme', 'api', 8)).toBeNull();
  });
});

describe('timeouts', () => {
  test('every REST call carries an abort signal', async () => {
    const { octokit, calls } = octokitWith({
      'GET /repos/acme/api/compare/a...b': { body: shaPage(0, 1) },
      'GET /repos/acme/api/pulls/7/commits': { body: '[]' },
      'GET /repos/acme/api/pulls/7': {
        body: JSON.stringify({ html_url: 'u', title: 't', head: { ref: 'h' } }),
      },
    });
    await compareCommitShas(octokit, 'acme', 'api', 'a', 'b');
    await listPullRequestCommitShas(octokit, 'acme', 'api', 7);
    await getPullRequestText(octokit, 'acme', 'api', 7);
    expect(calls).toHaveLength(3);
    for (const call of calls) expect(call.signal).toBeInstanceOf(AbortSignal);
  });
});
