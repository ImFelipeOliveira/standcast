import type { Octokit } from '@octokit/core';
import { httpStatus } from './errors';

export async function scopeQualifier(octokit: Octokit, owner: string): Promise<string> {
  try {
    const response = await octokit.request('GET /users/{username}', { username: owner });
    return (response.data as { type?: string }).type === 'User' ? `user:${owner}` : `org:${owner}`;
  } catch (error) {
    if (httpStatus(error) === 404) return `org:${owner}`;
    throw error;
  }
}
