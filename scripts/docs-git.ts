import { spawnSync } from 'node:child_process';

export type GitRunner = (args: string[]) => { ok: boolean; stdout: string };

export function gitRunner(cwd: string): GitRunner {
  return (args) => {
    const result = spawnSync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout: 120_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: result.status === 0, stdout: (result.stdout ?? '').trim() };
  };
}

function isShallow(git: GitRunner): boolean | null {
  const result = git(['rev-parse', '--is-shallow-repository']);
  if (!result.ok) return null;
  return result.stdout === 'true';
}

export function fullGitHistory(
  git: GitRunner,
  { fetch = true }: { fetch?: boolean } = {},
): boolean {
  const shallow = isShallow(git);
  if (shallow === null) return false;
  if (!shallow) return true;
  if (!fetch) return false;
  git(['fetch', '--quiet', '--unshallow']);
  return isShallow(git) === false;
}
