import { addCalendarDays } from './calendar';
import type { Item, Ref } from './daily';
import { parsePullRequestUrl } from './github-ref';
import { parseLinearIssueUrl } from './linear-ref';

export const PLAN_LOOKUP_CAP = 10;
export const PLAN_MAX_AGE_DAYS = 7;
export const PULL_REQUEST_NUMBER_MAX = 2147483647;

export type PlanStatus = 'moved' | 'not_moved' | 'unknown';
export type PlanEvidenceKind =
  | 'commit'
  | 'review'
  | 'merged'
  | 'closed'
  | 'state_changed'
  | 'comment';
export type PlanEvidence = { kind: PlanEvidenceKind; url: string; at: string };
export type PlanItem = { text: string; ref?: Ref; status: PlanStatus; evidence: PlanEvidence[] };
export type Plan = { date: string; items: PlanItem[] };

export type PullRequestTarget = { key: string; owner: string; repo: string; number: number };
export type CardTarget = { key: string; identifier: string; url: string };
export type PlanLookupResult = { ok: true; evidence: PlanEvidence[] } | { ok: false };

export type PendingKind = 'own_pr' | 'review_requested' | 'card';
export type PendingItem = {
  kind: PendingKind;
  ref: Ref;
  title: string;
  repo?: string;
  since: string;
  draft?: boolean;
  state?: string;
  priority?: 'urgent' | 'high' | 'medium' | 'low' | 'none';
  reviewDecision?: 'approved' | 'changes_requested' | 'review_required' | null;
  checks?: 'success' | 'failure' | 'pending' | null;
};
export type Pending = { items: PendingItem[]; truncated: boolean };

export function pullRequestKey(owner: string, repo: string, number: number): string {
  return `pr:${owner.toLowerCase()}/${repo.toLowerCase()}#${number}`;
}

export function cardKey(workspace: string, identifier: string): string {
  return `card:${workspace.toLowerCase()}/${identifier.toUpperCase()}`;
}

function keyOf(item: Item): string | null {
  const url = item.ref?.url;
  if (!url) return null;
  const pull = parsePullRequestUrl(url);
  if (pull) return pullRequestKey(pull.owner, pull.repo, pull.number);
  const issue = parseLinearIssueUrl(url);
  return issue ? cardKey(issue.workspace, issue.identifier) : null;
}

export function planTargets(
  items: Item[],
  owner: string,
): { pullRequests: PullRequestTarget[]; cards: CardTarget[] } {
  const wanted = owner.toLowerCase();
  const pullRequests = new Map<string, PullRequestTarget>();
  const cards = new Map<string, CardTarget>();
  for (const item of items) {
    const url = item.ref?.url;
    if (!url) continue;
    const pull = parsePullRequestUrl(url);
    if (pull) {
      if (pull.owner.toLowerCase() !== wanted || pull.number > PULL_REQUEST_NUMBER_MAX) continue;
      const key = pullRequestKey(pull.owner, pull.repo, pull.number);
      if (pullRequests.has(key) || pullRequests.size >= PLAN_LOOKUP_CAP) continue;
      pullRequests.set(key, {
        key,
        owner: pull.owner.toLowerCase(),
        repo: pull.repo.toLowerCase(),
        number: pull.number,
      });
      continue;
    }
    const issue = parseLinearIssueUrl(url);
    if (!issue) continue;
    const key = cardKey(issue.workspace, issue.identifier);
    if (cards.has(key) || cards.size >= PLAN_LOOKUP_CAP) continue;
    cards.set(key, { key, identifier: issue.identifier, url });
  }
  return { pullRequests: [...pullRequests.values()], cards: [...cards.values()] };
}

export function buildPlan(input: {
  date: string;
  items: Item[];
  results: Map<string, PlanLookupResult>;
}): Plan {
  const items = input.items.map((item): PlanItem => {
    const key = keyOf(item);
    const result = key ? input.results.get(key) : undefined;
    const base = item.ref ? { text: item.text, ref: item.ref } : { text: item.text };
    if (!result?.ok) return { ...base, status: 'unknown', evidence: [] };
    return {
      ...base,
      status: result.evidence.length > 0 ? 'moved' : 'not_moved',
      evidence: result.evidence,
    };
  });
  return { date: input.date, items };
}

export function planIsFresh(planDate: string, today: string): boolean {
  return planDate >= addCalendarDays(today, -PLAN_MAX_AGE_DAYS);
}
