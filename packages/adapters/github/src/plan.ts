import type { Octokit } from '@octokit/core';
import type {
  PlanEvidence,
  PlanEvidenceKind,
  PlanLookupResult,
  PullRequestTarget,
} from '@standcast/core';
import { type GraphqlError, queryGraphql } from './graphql';

const PLANNED_PULL_REQUEST_FRAGMENT = `fragment PlannedPullRequest on PullRequest {
  url
  merged
  mergedAt
  closedAt
  commits(last: 100) { nodes { commit { committedDate author { user { login } } } } }
  reviews(author: $login, last: 20) { nodes { submittedAt url } }
}`;

type PlannedPull = {
  url?: string;
  merged?: boolean;
  mergedAt?: string | null;
  closedAt?: string | null;
  commits?: {
    nodes?: ({
      commit?: { committedDate?: string; author?: { user?: { login?: string } | null } | null };
    } | null)[];
  } | null;
  reviews?: { nodes?: ({ submittedAt?: string | null; url?: string } | null)[] } | null;
};

type PlanData = Record<string, { pullRequest?: PlannedPull | null } | null | undefined>;

function buildQuery(count: number): string {
  const declarations = ['$login: String!'];
  const fields: string[] = [];
  for (let index = 0; index < count; index++) {
    declarations.push(`$o${index}: String!`, `$r${index}: String!`, `$n${index}: Int!`);
    fields.push(
      `  p${index}: repository(owner: $o${index}, name: $r${index}) { pullRequest(number: $n${index}) { ...PlannedPullRequest } }`,
    );
  }
  return `query PlannedPullRequests(${declarations.join(', ')}) {\n${fields.join('\n')}\n}\n${PLANNED_PULL_REQUEST_FRAGMENT}`;
}

function variablesOf(login: string, targets: PullRequestTarget[]): Record<string, string | number> {
  const variables: Record<string, string | number> = { login };
  targets.forEach((target, index) => {
    variables[`o${index}`] = target.owner;
    variables[`r${index}`] = target.repo;
    variables[`n${index}`] = target.number;
  });
  return variables;
}

function failedAliases(errors: GraphqlError[]): { all: boolean; aliases: Set<string> } {
  const aliases = new Set<string>();
  let all = false;
  for (const error of errors) {
    const head = Array.isArray(error.path) ? error.path[0] : undefined;
    if (typeof head === 'string') aliases.add(head);
    else all = true;
  }
  return { all, aliases };
}

function inWindow(value: string | null | undefined, since: Date): Date | null {
  if (!value) return null;
  const at = new Date(value);
  return at.getTime() >= since.getTime() ? at : null;
}

function latest(
  kind: PlanEvidenceKind,
  candidates: { at: Date | null; url: string }[],
): PlanEvidence | null {
  let best: { at: Date; url: string } | null = null;
  for (const candidate of candidates) {
    if (!candidate.at) continue;
    if (!best || candidate.at > best.at) best = { at: candidate.at, url: candidate.url };
  }
  return best ? { kind, url: best.url, at: best.at.toISOString() } : null;
}

function evidenceOf(pull: PlannedPull, login: string, since: Date): PlanEvidence[] {
  const url = pull.url ?? '';
  const person = login.toLowerCase();
  const commits = (pull.commits?.nodes ?? []).flatMap((node) => {
    const commit = node?.commit;
    if (commit?.author?.user?.login?.toLowerCase() !== person) return [];
    return [{ at: inWindow(commit.committedDate, since), url }];
  });
  const reviews = (pull.reviews?.nodes ?? []).flatMap((node) =>
    node ? [{ at: inWindow(node.submittedAt, since), url: node.url ?? url }] : [],
  );
  const merged = pull.merged ? [{ at: inWindow(pull.mergedAt, since), url }] : [];
  const closed = pull.merged ? [] : [{ at: inWindow(pull.closedAt, since), url }];
  return [
    latest('commit', commits),
    latest('review', reviews),
    latest('merged', merged),
    latest('closed', closed),
  ].filter((evidence): evidence is PlanEvidence => evidence !== null);
}

function hasUnattributedCommits(pull: PlannedPull, since: Date): boolean {
  return (pull.commits?.nodes ?? []).some((node) => {
    const commit = node?.commit;
    return !!commit && !commit.author?.user && inWindow(commit.committedDate, since) !== null;
  });
}

function resultOf(pull: PlannedPull, login: string, since: Date): PlanLookupResult {
  const evidence = evidenceOf(pull, login, since);
  if (evidence.length === 0 && hasUnattributedCommits(pull, since)) return { ok: false };
  return { ok: true, evidence };
}

export async function lookupPlannedPullRequests(
  octokit: Octokit,
  input: { login: string; since: Date; targets: PullRequestTarget[] },
): Promise<Map<string, PlanLookupResult>> {
  const results = new Map<string, PlanLookupResult>();
  if (input.targets.length === 0) return results;
  const { data, errors } = await queryGraphql<PlanData>(
    octokit,
    buildQuery(input.targets.length),
    variablesOf(input.login, input.targets),
  );
  const failed = failedAliases(errors);
  input.targets.forEach((target, index) => {
    const alias = `p${index}`;
    const pull = data[alias]?.pullRequest;
    if (failed.all || failed.aliases.has(alias) || !pull) {
      results.set(target.key, { ok: false });
      return;
    }
    results.set(target.key, resultOf(pull, input.login, input.since));
  });
  return results;
}
