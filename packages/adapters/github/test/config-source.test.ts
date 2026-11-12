import { describe, expect, test } from 'bun:test';
import { Octokit } from '@octokit/core';
import {
  type ConfigRepository,
  fetchConfigSource,
  fetchRepositorySelection,
  REPOSITORY_SELECTION_TIMEOUT_MS,
} from '../src/config-source';
import { fixture, octokitWith } from './helpers';

const SOURCE = 'timezone: America/Sao_Paulo\n';
const PRIVATE_REPO = { body: JSON.stringify({ default_branch: 'trunk', private: true }) };
const DOT_GITHUB: ConfigRepository = { name: '.github', defaultBranch: 'main', private: false };

describe('fetchConfigSource', () => {
  test('config source found', async () => {
    const { octokit } = octokitWith({
      'GET /repos/acme/.github': { body: fixture('repo.json') },
      'GET /repos/acme/.github/contents/standcast.yml': { body: fixture('contents.json') },
    });
    expect(await fetchConfigSource(octokit, 'acme')).toEqual({
      found: true,
      source: SOURCE,
      repository: DOT_GITHUB,
    });
  });

  test('config source no_repo', async () => {
    const { octokit } = octokitWith({ 'GET /repos/acme/.github': { status: 404 } });
    expect(await fetchConfigSource(octokit, 'acme')).toEqual({
      found: false,
      reason: 'no_repo',
      repository: null,
    });
  });

  test('config source no_file', async () => {
    const { octokit } = octokitWith({
      'GET /repos/acme/.github': { body: fixture('repo.json') },
      'GET /repos/acme/.github/contents/standcast.yml': { status: 404 },
    });
    expect(await fetchConfigSource(octokit, 'acme')).toEqual({
      found: false,
      reason: 'no_file',
      repository: DOT_GITHUB,
    });
  });

  test('config source no_access on repo', async () => {
    const { octokit } = octokitWith({ 'GET /repos/acme/.github': { status: 403 } });
    expect(await fetchConfigSource(octokit, 'acme')).toMatchObject({
      found: false,
      reason: 'no_access',
    });
  });

  test('config source no_access on file', async () => {
    const { octokit } = octokitWith({
      'GET /repos/acme/.github': { body: fixture('repo.json') },
      'GET /repos/acme/.github/contents/standcast.yml': { status: 403 },
    });
    expect(await fetchConfigSource(octokit, 'acme')).toMatchObject({
      found: false,
      reason: 'no_access',
    });
  });

  test('rethrows unexpected errors', async () => {
    const { octokit } = octokitWith({ 'GET /repos/acme/.github-private': { status: 500 } });
    const error = await fetchConfigSource(octokit, 'acme').catch((e: unknown) => e);
    expect((error as { status?: number }).status).toBe(500);
  });
});

describe('fetchConfigSource precedence', () => {
  test('prefers .github-private when it has the file', async () => {
    const { octokit, calls } = octokitWith({
      'GET /repos/acme/.github-private': PRIVATE_REPO,
      'GET /repos/acme/.github-private/contents/standcast.yml': { body: fixture('contents.json') },
      'GET /repos/acme/.github': { body: fixture('repo.json') },
      'GET /repos/acme/.github/contents/standcast.yml': { status: 500 },
    });
    expect(await fetchConfigSource(octokit, 'acme')).toEqual({
      found: true,
      source: SOURCE,
      repository: { name: '.github-private', defaultBranch: 'trunk', private: true },
    });
    expect(calls.some((call) => call.url.pathname.startsWith('/repos/acme/.github/'))).toBe(false);
  });

  test('falls back to .github when .github-private has no file', async () => {
    const { octokit } = octokitWith({
      'GET /repos/acme/.github-private': PRIVATE_REPO,
      'GET /repos/acme/.github-private/contents/standcast.yml': { status: 404 },
      'GET /repos/acme/.github': { body: fixture('repo.json') },
      'GET /repos/acme/.github/contents/standcast.yml': { body: fixture('contents.json') },
    });
    expect(await fetchConfigSource(octokit, 'acme')).toEqual({
      found: true,
      source: SOURCE,
      repository: DOT_GITHUB,
    });
  });

  test('reports the private flag of a private .github', async () => {
    const { octokit } = octokitWith({
      'GET /repos/acme/.github': PRIVATE_REPO,
      'GET /repos/acme/.github/contents/standcast.yml': { body: fixture('contents.json') },
    });
    expect(await fetchConfigSource(octokit, 'acme')).toMatchObject({
      found: true,
      repository: { name: '.github', private: true },
    });
  });

  test('reports no_file in the preferred repository when no repository has the file', async () => {
    const { octokit } = octokitWith({
      'GET /repos/acme/.github-private': PRIVATE_REPO,
      'GET /repos/acme/.github': { body: fixture('repo.json') },
    });
    expect(await fetchConfigSource(octokit, 'acme')).toEqual({
      found: false,
      reason: 'no_file',
      repository: { name: '.github-private', defaultBranch: 'trunk', private: true },
    });
  });

  test('reports no_file when only .github-private exists without the file', async () => {
    const { octokit } = octokitWith({ 'GET /repos/acme/.github-private': PRIVATE_REPO });
    expect(await fetchConfigSource(octokit, 'acme')).toMatchObject({
      found: false,
      reason: 'no_file',
      repository: { name: '.github-private' },
    });
  });

  test('stops at no_access on .github-private instead of reading .github', async () => {
    const { octokit } = octokitWith({
      'GET /repos/acme/.github-private': PRIVATE_REPO,
      'GET /repos/acme/.github-private/contents/standcast.yml': { status: 403 },
      'GET /repos/acme/.github': { body: fixture('repo.json') },
      'GET /repos/acme/.github/contents/standcast.yml': { body: fixture('contents.json') },
    });
    expect(await fetchConfigSource(octokit, 'acme')).toMatchObject({
      found: false,
      reason: 'no_access',
    });
  });
});

describe('fetchConfigSource revision', () => {
  test('reads only the given repository at the given ref', async () => {
    const { octokit, calls } = octokitWith({
      'GET /repos/acme/.github-private': PRIVATE_REPO,
      'GET /repos/acme/.github-private/contents/standcast.yml': { body: fixture('contents.json') },
      'GET /repos/acme/.github': { body: fixture('repo.json') },
      'GET /repos/acme/.github/contents/standcast.yml': { body: fixture('contents.json') },
    });
    const result = await fetchConfigSource(octokit, 'acme', { repo: '.github', ref: 'deadbeef' });
    expect(result).toMatchObject({ found: true, repository: { name: '.github' } });
    const file = calls.find((call) => call.url.pathname.endsWith('standcast.yml'));
    expect(file?.url.pathname).toBe('/repos/acme/.github/contents/standcast.yml');
    expect(file?.url.searchParams.get('ref')).toBe('deadbeef');
    expect(calls.some((call) => call.url.pathname.includes('.github-private'))).toBe(false);
  });

  test('omits ref without a revision', async () => {
    const { octokit, calls } = octokitWith({
      'GET /repos/acme/.github': { body: fixture('repo.json') },
      'GET /repos/acme/.github/contents/standcast.yml': { body: fixture('contents.json') },
    });
    await fetchConfigSource(octokit, 'acme');
    const file = calls.find((call) => call.url.pathname.endsWith('standcast.yml'));
    expect(file?.url.searchParams.has('ref')).toBe(false);
  });
});

describe('fetchRepositorySelection', () => {
  test('returns selected when the installation has access to chosen repositories only', async () => {
    const { octokit, calls } = octokitWith({
      'GET /installation/repositories': {
        body: JSON.stringify({
          total_count: 1,
          repositories: [],
          repository_selection: 'selected',
        }),
      },
    });
    expect(await fetchRepositorySelection(octokit)).toBe('selected');
    expect(calls[0]?.url.searchParams.get('per_page')).toBe('1');
  });

  test('returns all when the installation covers every repository', async () => {
    const { octokit } = octokitWith({
      'GET /installation/repositories': {
        body: JSON.stringify({ total_count: 3, repositories: [], repository_selection: 'all' }),
      },
    });
    expect(await fetchRepositorySelection(octokit)).toBe('all');
  });

  test('returns null when github does not say', async () => {
    const { octokit } = octokitWith({
      'GET /installation/repositories': { body: JSON.stringify({ total_count: 0 }) },
    });
    expect(await fetchRepositorySelection(octokit)).toBeNull();
  });

  test('throws when github fails', async () => {
    const { octokit } = octokitWith({ 'GET /installation/repositories': { status: 500 } });
    await expect(fetchRepositorySelection(octokit)).rejects.toThrow();
  });

  test(
    'a request that never settles times out and falls back to null',
    async () => {
      const hanging = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
        return new Promise<Response>((_, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason));
        });
      }) as typeof fetch;
      const octokit = new Octokit({ request: { fetch: hanging } });
      const started = Date.now();
      const selection = await fetchRepositorySelection(octokit).catch(() => null);
      expect(selection).toBeNull();
      expect(Date.now() - started).toBeGreaterThanOrEqual(REPOSITORY_SELECTION_TIMEOUT_MS - 100);
      expect(Date.now() - started).toBeLessThan(REPOSITORY_SELECTION_TIMEOUT_MS + 1000);
    },
    REPOSITORY_SELECTION_TIMEOUT_MS + 3000,
  );
});
