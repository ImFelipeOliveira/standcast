import type { Octokit } from '@octokit/core';
import { CONFIG_FILE, CONFIG_REPOS, type ConfigRepo } from '@standcast/core';
import { httpStatus } from './errors';

export type ConfigSourceReason = 'no_repo' | 'no_access' | 'no_file';

export type ConfigRepository = { name: ConfigRepo; defaultBranch: string; private: boolean };

export type ConfigSource =
  | { found: true; source: string; repository: ConfigRepository }
  | { found: false; reason: ConfigSourceReason; repository: ConfigRepository | null };

export type ConfigRevision = { repo: ConfigRepo; ref: string };

function failureReason(error: unknown, missing: 'no_repo' | 'no_file'): ConfigSourceReason {
  const status = httpStatus(error);
  if (status === 404) return missing;
  if (status === 403) return 'no_access';
  throw error;
}

async function readRepository(
  octokit: Octokit,
  owner: string,
  name: ConfigRepo,
): Promise<ConfigRepository | ConfigSourceReason> {
  try {
    const response = await octokit.request('GET /repos/{owner}/{repo}', { owner, repo: name });
    const data = response.data as { default_branch?: string; private?: boolean };
    return { name, defaultBranch: data.default_branch || 'main', private: data.private === true };
  } catch (error) {
    return failureReason(error, 'no_repo');
  }
}

async function readFile(
  octokit: Octokit,
  owner: string,
  repository: ConfigRepository,
  ref: string | undefined,
): Promise<ConfigSource> {
  try {
    const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner,
      repo: repository.name,
      path: CONFIG_FILE,
      ...(ref ? { ref } : {}),
    });
    const data = response.data as { content?: string; encoding?: string };
    if (typeof data.content !== 'string') return { found: false, reason: 'no_file', repository };
    const source = Buffer.from(data.content, 'base64').toString('utf8');
    return { found: true, source, repository };
  } catch (error) {
    return { found: false, reason: failureReason(error, 'no_file'), repository };
  }
}

async function readSource(
  octokit: Octokit,
  owner: string,
  name: ConfigRepo,
  ref: string | undefined,
): Promise<ConfigSource> {
  const repository = await readRepository(octokit, owner, name);
  if (typeof repository === 'string') return { found: false, reason: repository, repository: null };
  return readFile(octokit, owner, repository, ref);
}

export async function fetchConfigSource(
  octokit: Octokit,
  owner: string,
  revision?: ConfigRevision,
): Promise<ConfigSource> {
  if (revision) return readSource(octokit, owner, revision.repo, revision.ref);
  const withoutFile: ConfigRepository[] = [];
  for (const name of CONFIG_REPOS) {
    const result = await readSource(octokit, owner, name, undefined);
    if (result.found || result.reason === 'no_access') return result;
    if (result.repository) withoutFile.push(result.repository);
  }
  const repository = withoutFile[0] ?? null;
  return { found: false, reason: repository ? 'no_file' : 'no_repo', repository };
}
