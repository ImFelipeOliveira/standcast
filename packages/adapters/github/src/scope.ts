import type { Octokit } from '@octokit/core';
import { httpStatus } from './errors';
import { GITHUB_GRAPHQL_TIMEOUT_MS } from './graphql';

export async function scopeQualifier(octokit: Octokit, owner: string): Promise<string> {
  try {
    const response = await octokit.request('GET /users/{username}', {
      username: owner,
      request: { signal: AbortSignal.timeout(GITHUB_GRAPHQL_TIMEOUT_MS) },
    });
    return (response.data as { type?: string }).type === 'User' ? `user:${owner}` : `org:${owner}`;
  } catch (error) {
    if (httpStatus(error) === 404) return `org:${owner}`;
    throw error;
  }
}
