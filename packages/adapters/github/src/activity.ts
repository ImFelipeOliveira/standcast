import type { Octokit } from '@octokit/core';
import { type ActivityItem, clampTitle, parsePullRequestUrl } from '@standcast/core';
import { httpStatus } from './errors';

const MAX_ITEMS = 50;
const PER_PAGE = 100;
const MAX_BRANCH_LOOKUPS = 20;
const BRANCH_LOOKUP_TIMEOUT_MS = 5000;

type IssueHit = {
  title: string;
  html_url: string;
  repository_url: string;
  created_at: string;
  updated_at?: string;
  pull_request?: { merged_at: string | null };
};

type CommitHit = {
  html_url: string;
  commit: { message: string; committer: { date: string } | null; author: { date: string } | null };
  repository: { full_name: string };
};

function iso(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}

function repoOf(hit: IssueHit): string {
  return hit.repository_url.split('/repos/')[1] ?? hit.repository_url;
}

async function scopeQualifier(octokit: Octokit, owner: string): Promise<string> {
  try {
    const response = await octokit.request('GET /users/{username}', { username: owner });
    return (response.data as { type?: string }).type === 'User' ? `user:${owner}` : `org:${owner}`;
  } catch (error) {
    if (httpStatus(error) === 404) return `org:${owner}`;
    throw error;
  }
}

async function searchIssues(octokit: Octokit, q: string): Promise<IssueHit[]> {
  const response = await octokit.request('GET /search/issues', {
    q,
    sort: 'updated',
    order: 'desc',
    per_page: PER_PAGE,
  });
  return (response.data as { items: IssueHit[] }).items;
}

async function searchCommits(octokit: Octokit, q: string): Promise<CommitHit[]> {
  const response = await octokit.request('GET /search/commits', {
    q,
    sort: 'committer-date',
    order: 'desc',
    per_page: PER_PAGE,
  });
  return (response.data as { items: CommitHit[] }).items;
}

function pullItem(kind: ActivityItem['kind'], hit: IssueHit, at: string): ActivityItem {
  return {
    kind,
    title: clampTitle(hit.title),
    url: hit.html_url,
    repo: repoOf(hit),
    at: new Date(at),
  };
}

function groupCommits(hits: CommitHit[]): ActivityItem[] {
  const byRepo = new Map<string, { hits: { hit: CommitHit; at: Date }[] }>();
  for (const hit of hits) {
    const date = hit.commit.committer?.date ?? hit.commit.author?.date;
    if (!date) continue;
    const group = byRepo.get(hit.repository.full_name) ?? { hits: [] };
    group.hits.push({ hit, at: new Date(date) });
    byRepo.set(hit.repository.full_name, group);
  }
  const items: ActivityItem[] = [];
  for (const [repo, group] of byRepo) {
    const latest = group.hits.reduce((a, b) => (b.at > a.at ? b : a));
    items.push({
      kind: 'commits',
      title: clampTitle(latest.hit.commit.message.split('\n')[0] ?? ''),
      url: latest.hit.html_url,
      repo,
      at: latest.at,
      count: group.hits.length,
    });
  }
  return items;
}

async function headBranch(octokit: Octokit, url: string): Promise<string | undefined> {
  const ref = parsePullRequestUrl(url);
  if (!ref) return undefined;
  const response = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
    owner: ref.owner,
    repo: ref.repo,
    pull_number: ref.number,
    request: { signal: AbortSignal.timeout(BRANCH_LOOKUP_TIMEOUT_MS) },
  });
  const branch = (response.data as { head?: { ref?: string } }).head?.ref;
  return branch || undefined;
}

async function attachBranches(octokit: Octokit, items: ActivityItem[]): Promise<void> {
  const byUrl = new Map<string, ActivityItem[]>();
  for (const item of items) {
    if (item.kind !== 'pr_opened' && item.kind !== 'pr_merged') continue;
    byUrl.set(item.url, [...(byUrl.get(item.url) ?? []), item]);
  }
  const urls = [...byUrl.keys()].slice(0, MAX_BRANCH_LOOKUPS);
  const results = await Promise.allSettled(urls.map((url) => headBranch(octokit, url)));
  results.forEach((result, index) => {
    if (result.status !== 'fulfilled' || !result.value) return;
    for (const item of byUrl.get(urls[index] as string) ?? []) item.branch = result.value;
  });
}

export async function listActivity(
  octokit: Octokit,
  owner: string,
  login: string,
  since: Date,
): Promise<ActivityItem[]> {
  const scope = await scopeQualifier(octokit, owner);
  const from = iso(since);
  const [opened, merged, reviewed, commits] = await Promise.all([
    searchIssues(octokit, `is:pr author:${login} ${scope} created:>=${from}`),
    searchIssues(octokit, `is:pr author:${login} ${scope} is:merged merged:>=${from}`),
    searchIssues(octokit, `is:pr reviewed-by:${login} -author:${login} ${scope} updated:>=${from}`),
    searchCommits(octokit, `author:${login} ${scope} committer-date:>=${from}`),
  ]);
  const mergedUrls = new Set(merged.map((hit) => hit.html_url));
  const items: ActivityItem[] = [
    ...opened
      .filter((hit) => !mergedUrls.has(hit.html_url))
      .map((hit) => pullItem('pr_opened', hit, hit.created_at)),
    ...merged.map((hit) =>
      pullItem('pr_merged', hit, hit.pull_request?.merged_at ?? hit.created_at),
    ),
    ...reviewed.map((hit) => pullItem('review', hit, hit.updated_at ?? hit.created_at)),
    ...groupCommits(commits),
  ];
  const result = items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, MAX_ITEMS);
  await attachBranches(octokit, result);
  return result;
}
