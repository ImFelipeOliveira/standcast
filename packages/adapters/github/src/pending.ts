import type { Octokit } from '@octokit/core';
import { clampTitle, type Pending, type PendingItem } from '@standcast/core';
import { queryGraphql } from './graphql';
import { scopeQualifier } from './scope';

export const PENDING_SEARCH_LIMIT = 50;

const PENDING_QUERY = `query PendingPullRequests($own: String!, $requested: String!) {
  own: search(type: ISSUE, query: $own, first: ${PENDING_SEARCH_LIMIT}) {
    nodes { ...PendingPullRequest }
  }
  requested: search(type: ISSUE, query: $requested, first: ${PENDING_SEARCH_LIMIT}) {
    nodes { ...PendingPullRequest }
  }
}
fragment PendingPullRequest on PullRequest {
  url
  title
  isDraft
  createdAt
  repository { nameWithOwner }
  reviewDecision
  commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
}`;

type PullNode = {
  url?: string;
  title?: string;
  isDraft?: boolean;
  createdAt?: string;
  repository?: { nameWithOwner?: string } | null;
  reviewDecision?: string | null;
  commits?: {
    nodes?: ({ commit?: { statusCheckRollup?: { state?: string } | null } | null } | null)[];
  } | null;
};

type SearchResult = { nodes?: (PullNode | null)[] } | null;
type PendingData = { own?: SearchResult; requested?: SearchResult };

const REVIEW_DECISIONS: Record<string, NonNullable<PendingItem['reviewDecision']>> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes_requested',
  REVIEW_REQUIRED: 'review_required',
};

const CHECK_STATES: Record<string, NonNullable<PendingItem['checks']>> = {
  SUCCESS: 'success',
  FAILURE: 'failure',
  ERROR: 'failure',
  PENDING: 'pending',
  EXPECTED: 'pending',
};

function checksOf(node: PullNode): PendingItem['checks'] {
  const state = node.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state;
  return (state && CHECK_STATES[state]) || null;
}

function itemOf(kind: PendingItem['kind'], node: PullNode): PendingItem | null {
  if (!node.url || !node.createdAt) return null;
  const title = clampTitle(node.title ?? '');
  const item: PendingItem = {
    kind,
    ref: { kind: 'pull_request', url: node.url, title },
    title,
    since: node.createdAt,
    draft: node.isDraft === true,
    reviewDecision: (node.reviewDecision && REVIEW_DECISIONS[node.reviewDecision]) || null,
    checks: checksOf(node),
  };
  const repo = node.repository?.nameWithOwner;
  return repo ? { ...item, repo } : item;
}

function itemsOf(kind: PendingItem['kind'], result: NonNullable<SearchResult>): PendingItem[] {
  return (result.nodes ?? []).flatMap((node) => {
    const item = node ? itemOf(kind, node) : null;
    return item ? [item] : [];
  });
}

export async function listPendingPullRequests(
  octokit: Octokit,
  owner: string,
  login: string,
): Promise<Pending> {
  const scope = await scopeQualifier(octokit, owner);
  const { data } = await queryGraphql<PendingData>(octokit, PENDING_QUERY, {
    own: `is:pr is:open author:${login} ${scope}`,
    requested: `is:pr is:open user-review-requested:${login} ${scope}`,
  });
  const { own, requested } = data;
  if (!own || !requested) throw new Error('GitHub pending search returned no results');
  const truncated = [own, requested].some(
    (result) => (result.nodes ?? []).length >= PENDING_SEARCH_LIMIT,
  );
  return {
    items: [...itemsOf('own_pr', own), ...itemsOf('review_requested', requested)],
    truncated,
  };
}
