export type GitRunner = (args: string[]) => Promise<string | null>;

const REMOTE_PATTERNS = [
  /^https?:\/\/(?:[^@/\s]+@)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i,
  /^git@github\.com:([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i,
  /^ssh:\/\/git@github\.com(?::\d+)?\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i,
];

const GIT_TIMEOUT_MS = 2000;

export function githubRepoFromRemote(url: string): string | null {
  const trimmed = url.trim();
  for (const pattern of REMOTE_PATTERNS) {
    const match = pattern.exec(trimmed);
    if (match) return `${match[1]}/${match[2]}`.toLowerCase();
  }
  return null;
}

const runGit: GitRunner = async (args) => {
  const child = Bun.spawn(['git', ...args], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'ignore',
    timeout: GIT_TIMEOUT_MS,
  });
  const [output, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  return code === 0 ? output : null;
};

const caches = new WeakMap<GitRunner, Map<string, Promise<string | null>>>();

async function lookup(cwd: string, run: GitRunner): Promise<string | null> {
  try {
    const output = await run(['-C', cwd, 'remote', 'get-url', 'origin']);
    return output ? githubRepoFromRemote(output) : null;
  } catch {
    return null;
  }
}

export function resolveRepo(cwd: string, run: GitRunner = runGit): Promise<string | null> {
  let cache = caches.get(run);
  if (!cache) {
    cache = new Map();
    caches.set(run, cache);
  }
  const cached = cache.get(cwd);
  if (cached) return cached;
  const pending = lookup(cwd, run);
  cache.set(cwd, pending);
  return pending;
}
