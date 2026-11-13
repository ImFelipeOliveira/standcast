import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fullGitHistory, gitRunner } from './docs-git';

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

async function originWithTwoCommits(): Promise<{ root: string; origin: string }> {
  const root = await mkdtemp(join(tmpdir(), 'standcast-git-'));
  const origin = join(root, 'origin');
  spawnSync('git', ['init', '--quiet', origin]);
  for (const message of ['first', 'second']) {
    await writeFile(join(origin, 'page.md'), `# ${message}\n`);
    git(origin, 'add', 'page.md');
    git(
      origin,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '--quiet',
      '-m',
      message,
    );
  }
  return { root, origin };
}

function shallowClone(root: string, origin: string): string {
  const clone = join(root, 'clone');
  git(root, 'clone', '--quiet', '--depth', '1', `file://${origin}`, clone);
  expect(git(clone, 'rev-parse', '--is-shallow-repository')).toBe('true');
  return clone;
}

describe('full git history for last updated dates', () => {
  test('a full clone is left alone', async () => {
    const { root, origin } = await originWithTwoCommits();
    try {
      expect(fullGitHistory(gitRunner(origin))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('a shallow clone fetches the rest of its history', async () => {
    const { root, origin } = await originWithTwoCommits();
    try {
      const clone = shallowClone(root, origin);
      expect(fullGitHistory(gitRunner(clone))).toBe(true);
      expect(git(clone, 'rev-parse', '--is-shallow-repository')).toBe('false');
      expect(git(clone, 'rev-list', '--count', 'HEAD')).toBe('2');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('a shallow clone that cannot fetch reports no full history', async () => {
    const { root, origin } = await originWithTwoCommits();
    try {
      const clone = shallowClone(root, origin);
      await rm(origin, { recursive: true, force: true });
      expect(fullGitHistory(gitRunner(clone))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('a folder outside git reports no full history', async () => {
    const root = await mkdtemp(join(tmpdir(), 'standcast-nogit-'));
    try {
      expect(fullGitHistory(gitRunner(root))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
