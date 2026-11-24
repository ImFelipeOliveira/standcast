import type { Octokit } from '@octokit/core';
import { httpStatus } from './errors';
import { queryGraphql } from './graphql';

const PER_PAGE = 100;
const REQUEST_TIMEOUT_MS = 5000;
const MAX_PULL_COMMIT_PAGES = 3;

export const MAX_COMPARE_PAGES = 10;
export const COMMIT_BATCH = 50;

export type MergedPullRequest = {
  number: number;
  url: string;
  title: string;
  author: string;
  baseRef: string;
  headRef: string;
  mergedAt: string;
};

export type PullRequestText = {
  number: number;
  url: string;
  title: string;
  body: string;
  labels: string[];
  headRef: string;
};

export async function compareCommitShas(
  octokit: Octokit,
  owner: string,
  repo: string,
  base: string,
  head: string,
): Promise<{ shas: string[]; truncated: boolean }> {
  const shas: string[] = [];
  let full = false;
  try {
    for (let page = 1; page <= MAX_COMPARE_PAGES; page++) {
      const response = await octokit.request('GET /repos/{owner}/{repo}/compare/{basehead}', {
        owner,
        repo,
        basehead: `${base}...${head}`,
        per_page: PER_PAGE,
        page,
        request: { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
      });
      const commits = (response.data as { commits?: { sha: string }[] }).commits ?? [];
      for (const commit of commits) shas.push(commit.sha);
      full = commits.length >= PER_PAGE;
      if (!full) break;
    }
  } catch (error) {
    const status = httpStatus(error);
    if (status === 404 || status === 422) {
      return { shas: shas.length > 0 ? shas : [head], truncated: true };
    }
    throw error;
  }
  return { shas, truncated: full };
}

type AssociatedPull = {
  number: number;
  url: string;
  title: string;
  merged: boolean;
  mergedAt: string | null;
  baseRefName: string;
  headRefName: string;
  author: { login: string } | null;
};

type CommitData = Record<
  string,
  { associatedPullRequests?: { nodes?: (AssociatedPull | null)[] } | null } | null | undefined
>;

function commitsQuery(count: number): string {
  const declarations = ['$owner: String!', '$repo: String!'];
  const fields: string[] = [];
  for (let index = 0; index < count; index++) {
    declarations.push(`$s${index}: GitObjectID!`);
    fields.push(
      `    c${index}: object(oid: $s${index}) { ... on Commit { associatedPullRequests(first: 5) { nodes { number url title merged mergedAt baseRefName headRefName author { login } } } } }`,
    );
  }
  return `query MergedPullRequests(${declarations.join(', ')}) {\n  repository(owner: $owner, name: $repo) {\n${fields.join('\n')}\n  }\n}`;
}

export async function mergedPullRequestsForCommits(
  octokit: Octokit,
  owner: string,
  repo: string,
  shas: string[],
): Promise<MergedPullRequest[]> {
  const found = new Map<number, MergedPullRequest>();
  for (let start = 0; start < shas.length; start += COMMIT_BATCH) {
    const batch = shas.slice(start, start + COMMIT_BATCH);
    const variables: Record<string, string | number> = { owner, repo };
    batch.forEach((sha, index) => {
      variables[`s${index}`] = sha;
    });
    const { data } = await queryGraphql<{ repository?: CommitData | null }>(
      octokit,
      commitsQuery(batch.length),
      variables,
    );
    for (const commit of Object.values(data.repository ?? {})) {
      for (const node of commit?.associatedPullRequests?.nodes ?? []) {
        if (!node?.merged || found.has(node.number)) continue;
        found.set(node.number, {
          number: node.number,
          url: node.url,
          title: node.title,
          author: node.author?.login ?? '',
          baseRef: node.baseRefName,
          headRef: node.headRefName,
          mergedAt: node.mergedAt ?? '',
        });
      }
    }
  }
  return [...found.values()];
}

export async function listPullRequestCommitShas(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
): Promise<{ shas: string[]; truncated: boolean }> {
  const shas: string[] = [];
  let full = false;
  for (let page = 1; page <= MAX_PULL_COMMIT_PAGES; page++) {
    const response = await octokit.request(
      'GET /repos/{owner}/{repo}/pulls/{pull_number}/commits',
      {
        owner,
        repo,
        pull_number: number,
        per_page: PER_PAGE,
        page,
        request: { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
      },
    );
    const batch = response.data as { sha: string }[];
    for (const commit of batch) shas.push(commit.sha);
    full = batch.length >= PER_PAGE;
    if (!full) break;
  }
  return { shas, truncated: full };
}

export async function getPullRequestText(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
): Promise<PullRequestText | null> {
  try {
    const response = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
      owner,
      repo,
      pull_number: number,
      request: { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    });
    const data = response.data as {
      html_url: string;
      title: string;
      body?: string | null;
      labels?: { name: string }[];
      head: { ref: string };
    };
    return {
      number,
      url: data.html_url,
      title: data.title,
      body: data.body ?? '',
      labels: (data.labels ?? []).map((label) => label.name),
      headRef: data.head.ref,
    };
  } catch (error) {
    if (httpStatus(error) === 404) return null;
    throw error;
  }
}
