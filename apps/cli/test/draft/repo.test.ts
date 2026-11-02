import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { githubRepoFromRemote, resolveRepo } from '../../src/draft/repo';

describe('githubRepoFromRemote', () => {
  test('remote url forms', () => {
    expect(githubRepoFromRemote('https://github.com/Acme/App.git')).toBe('acme/app');
    expect(githubRepoFromRemote('https://github.com/acme/app')).toBe('acme/app');
    expect(githubRepoFromRemote('https://github.com/acme/app/')).toBe('acme/app');
    expect(githubRepoFromRemote('https://user:secret@github.com/acme/app.git')).toBe('acme/app');
    expect(githubRepoFromRemote('git@github.com:Acme/my.app.git')).toBe('acme/my.app');
    expect(githubRepoFromRemote('git@github.com:acme/app')).toBe('acme/app');
    expect(githubRepoFromRemote('ssh://git@github.com/acme/app.git')).toBe('acme/app');
    expect(githubRepoFromRemote('  ssh://git@github.com/acme/app\n')).toBe('acme/app');
    expect(githubRepoFromRemote('https://gitlab.com/acme/app.git')).toBeNull();
    expect(githubRepoFromRemote('git@bitbucket.org:acme/app.git')).toBeNull();
    expect(githubRepoFromRemote('https://github.com/acme')).toBeNull();
    expect(githubRepoFromRemote('https://github.com/acme/app/tree/main')).toBeNull();
    expect(githubRepoFromRemote('/local/path/app.git')).toBeNull();
    expect(githubRepoFromRemote('')).toBeNull();
  });
});

describe('resolveRepo', () => {
  test('no remote groups by folder', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'standcast-repo-'));
    try {
      expect(await resolveRepo(dir)).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('reads origin through git and memoizes per cwd', async () => {
    const calls: string[][] = [];
    const run = async (args: string[]) => {
      calls.push(args);
      return 'git@github.com:Acme/App.git\n';
    };
    expect(await resolveRepo('/work/memo-app', run)).toBe('acme/app');
    expect(await resolveRepo('/work/memo-app', run)).toBe('acme/app');
    expect(calls).toEqual([['-C', '/work/memo-app', 'remote', 'get-url', 'origin']]);
  });

  test('runner failure or non github remote is null', async () => {
    const failing = async () => {
      throw new Error('boom');
    };
    expect(await resolveRepo('/work/failing', failing)).toBeNull();
    expect(await resolveRepo('/work/none', async () => null)).toBeNull();
    expect(await resolveRepo('/work/gitlab', async () => 'https://gitlab.com/a/b.git')).toBeNull();
  });
  test('a failed lookup is retried, a found repo is cached', async () => {
    let calls = 0;
    const run = async () => {
      calls += 1;
      return calls === 1 ? null : 'git@github.com:acme/retry.git\n';
    };
    expect(await resolveRepo('/work/retry', run)).toBeNull();
    expect(await resolveRepo('/work/retry', run)).toBe('acme/retry');
    expect(await resolveRepo('/work/retry', run)).toBe('acme/retry');
    expect(calls).toBe(2);
  });
});
