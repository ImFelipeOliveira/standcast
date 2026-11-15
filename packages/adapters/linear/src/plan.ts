import {
  type CardTarget,
  cardKey,
  type PlanEvidence,
  type PlanEvidenceKind,
  type PlanLookupResult,
  parseLinearIssueUrl,
} from '@standcast/core';
import { z } from 'zod';
import { nodesOf } from './activity';
import type { LinearClient } from './client';

export const PLANNED_PAGE_SIZE = 10;
const HISTORY_PAGE_SIZE = 50;
const COMMENT_PAGE_SIZE = 20;

const IDENTIFIER = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/;

type Split = { target: CardTarget; teamKey: string; number: number };

const plannedNode = z.object({
  identifier: z.string().min(1),
  url: z.string().min(1),
  history: z
    .object({
      nodes: z.array(
        z.object({
          createdAt: z.string(),
          toState: z.object({ name: z.string() }).nullish(),
        }),
      ),
    })
    .nullish(),
  comments: z
    .object({
      nodes: z.array(z.object({ createdAt: z.string(), url: z.string().nullish() })),
    })
    .nullish(),
});

type PlannedNode = z.infer<typeof plannedNode>;

function splitTargets(targets: CardTarget[]): Split[] {
  return targets.flatMap((target) => {
    const match = IDENTIFIER.exec(target.identifier);
    if (!match) return [];
    return [
      { target, teamKey: (match[1] as string).toUpperCase(), number: Number(match[2] as string) },
    ];
  });
}

function buildQuery(count: number): string {
  const declarations = ['$userId: ID!', '$since: DateTimeOrDuration!'];
  const branches: string[] = [];
  for (let index = 0; index < count; index++) {
    declarations.push(`$t${index}: String!`, `$n${index}: Float!`);
    branches.push(`        { team: { key: { eq: $t${index} } }, number: { eq: $n${index} } }`);
  }
  return `query PlannedCards(${declarations.join(', ')}) {
  issues(
    filter: {
      assignee: { id: { eq: $userId } }
      or: [
${branches.join('\n')}
      ]
    }
    first: ${PLANNED_PAGE_SIZE}
  ) {
    nodes {
      identifier
      url
      history(first: ${HISTORY_PAGE_SIZE}) { nodes { createdAt toState { name } } }
      comments(filter: { user: { id: { eq: $userId } }, createdAt: { gte: $since } }, first: ${COMMENT_PAGE_SIZE}) {
        nodes { createdAt url }
      }
    }
  }
}`;
}

function variablesOf(
  userId: string,
  since: Date,
  splits: Split[],
): Record<string, string | number> {
  const variables: Record<string, string | number> = { userId, since: since.toISOString() };
  splits.forEach((split, index) => {
    variables[`t${index}`] = split.teamKey;
    variables[`n${index}`] = split.number;
  });
  return variables;
}

function inWindow(value: string, since: Date): Date | null {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
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

function evidenceOf(issue: PlannedNode, since: Date): PlanEvidence[] {
  const changes = (issue.history?.nodes ?? []).flatMap((node) =>
    node.toState ? [{ at: inWindow(node.createdAt, since), url: issue.url }] : [],
  );
  const comments = (issue.comments?.nodes ?? []).map((node) => ({
    at: inWindow(node.createdAt, since),
    url: node.url || issue.url,
  }));
  return [latest('state_changed', changes), latest('comment', comments)].filter(
    (evidence): evidence is PlanEvidence => evidence !== null,
  );
}

function keyOf(url: string, identifier: string): string | null {
  const parsed = parseLinearIssueUrl(url);
  return parsed ? cardKey(parsed.workspace, identifier) : null;
}

function historyMayBeTruncated(issue: PlannedNode, since: Date): boolean {
  const nodes = issue.history?.nodes ?? [];
  if (nodes.length < HISTORY_PAGE_SIZE) return false;
  const times = nodes.map((node) => new Date(node.createdAt).getTime());
  if (times.some((time) => Number.isNaN(time))) return true;
  return Math.min(...times) >= since.getTime();
}

function commentsMayBeTruncated(issue: PlannedNode): boolean {
  return (issue.comments?.nodes ?? []).length >= COMMENT_PAGE_SIZE;
}

function resultOf(issue: PlannedNode, since: Date): PlanLookupResult {
  const evidence = evidenceOf(issue, since);
  if (evidence.length > 0) return { ok: true, evidence };
  if (historyMayBeTruncated(issue, since) || commentsMayBeTruncated(issue)) return { ok: false };
  return { ok: true, evidence };
}

export async function lookupPlannedCards(
  client: LinearClient,
  input: { userId: string; since: Date; targets: CardTarget[] },
): Promise<Map<string, PlanLookupResult>> {
  const results = new Map<string, PlanLookupResult>();
  const splits = splitTargets(input.targets).slice(0, PLANNED_PAGE_SIZE);
  if (splits.length === 0) return results;
  const data = await client.query<unknown>(
    buildQuery(splits.length),
    variablesOf(input.userId, input.since, splits),
  );
  const found = new Map<string, PlannedNode>();
  for (const raw of nodesOf(data)) {
    const parsed = plannedNode.safeParse(raw);
    if (!parsed.success) continue;
    const key = keyOf(parsed.data.url, parsed.data.identifier);
    if (key) found.set(key, parsed.data);
  }
  for (const { target } of splits) {
    const key = keyOf(target.url, target.identifier);
    const issue = key ? found.get(key) : undefined;
    results.set(target.key, issue ? resultOf(issue, input.since) : { ok: false });
  }
  return results;
}
