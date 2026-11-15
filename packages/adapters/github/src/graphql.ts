import type { Octokit } from '@octokit/core';
import { asRateLimitError } from './errors';

export const GITHUB_GRAPHQL_TIMEOUT_MS = 5000;

export type GraphqlError = { path?: unknown };
export type GraphqlResult<T> = { data: T; errors: GraphqlError[] };

function partialData(error: unknown): GraphqlResult<unknown> | null {
  if (typeof error !== 'object' || error === null) return null;
  const { data, errors } = error as { data?: unknown; errors?: unknown };
  if (typeof data !== 'object' || data === null || !Array.isArray(errors)) return null;
  return { data, errors: errors as GraphqlError[] };
}

export async function queryGraphql<T>(
  octokit: Octokit,
  query: string,
  variables: Record<string, string | number>,
): Promise<GraphqlResult<T>> {
  try {
    const data = await octokit.graphql<T>(query, {
      ...variables,
      request: { signal: AbortSignal.timeout(GITHUB_GRAPHQL_TIMEOUT_MS) },
    });
    return { data, errors: [] };
  } catch (error) {
    const partial = partialData(error);
    if (partial) return partial as GraphqlResult<T>;
    throw asRateLimitError(error);
  }
}
