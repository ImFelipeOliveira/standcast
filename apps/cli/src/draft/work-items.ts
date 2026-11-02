import { basename } from 'node:path';
import { type ActivityItem, clampTitle, parseLinearIssueUrl, type Ref } from '@standcast/core';
import type { SessionSummary } from './sessions';

export type WorkItem = {
  key: string;
  title: string;
  refs: Ref[];
  activity: ActivityItem[];
  sessions: SessionSummary[];
};

type RepoSession = SessionSummary & { repo: string | null };

type BuildInput = { activity: ActivityItem[]; sessions: RepoSession[] };

type Group = { activity: ActivityItem[]; sessions: SessionSummary[]; nodes: Set<string> };

const CARD_ID = /\b([a-z][a-z0-9]{1,9}-\d{1,6})\b/gi;
const PR_KINDS = new Set<ActivityItem['kind']>(['pr_opened', 'pr_merged', 'review']);
const CARD_KINDS = new Set<ActivityItem['kind']>(['card_started', 'card_done']);

function time(value: Date | string): number {
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function cardKey(item: ActivityItem): string {
  const parsed = parseLinearIssueUrl(item.url);
  return `card:${parsed ? parsed.identifier : item.url}`;
}

function cardIds(text: string | null | undefined, known: Set<string>): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const match of text.matchAll(CARD_ID)) {
    const id = (match[1] as string).toUpperCase();
    if (known.has(id) && !found.includes(id)) found.push(id);
  }
  return found;
}

function projectName(session: RepoSession): string {
  return session.repo ?? (basename(session.cwd) || session.cwd);
}

class Links {
  private parent = new Map<string, string>();

  add(node: string): void {
    if (!this.parent.has(node)) this.parent.set(node, node);
  }

  find(node: string): string {
    this.add(node);
    let root = node;
    while (this.parent.get(root) !== root) root = this.parent.get(root) as string;
    this.parent.set(node, root);
    return root;
  }

  join(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

function refsOf(activity: ActivityItem[]): Ref[] {
  const refs: Ref[] = [];
  const seen = new Set<string>();
  const push = (kind: Ref['kind'], item: ActivityItem) => {
    if (seen.has(item.url)) return;
    seen.add(item.url);
    refs.push({ kind, url: item.url, title: clampTitle(item.title) });
  };
  for (const item of activity) if (CARD_KINDS.has(item.kind)) push('card', item);
  for (const item of activity) if (PR_KINDS.has(item.kind)) push('pull_request', item);
  return refs;
}

function describe(group: Group): { key: string; title: string } {
  const card = group.activity.find((item) => CARD_KINDS.has(item.kind));
  if (card) return { key: cardKey(card), title: card.title };
  const pr = group.activity.find((item) => PR_KINDS.has(item.kind));
  if (pr) return { key: `pr:${pr.url}`, title: pr.title };
  const project = [...group.nodes].find((node) => node.startsWith('project:')) ?? 'project:';
  return { key: project, title: project.slice('project:'.length) };
}

export function buildWorkItems(input: BuildInput): WorkItem[] {
  const links = new Links();
  const known = new Set<string>();
  for (const item of input.activity) {
    if (!CARD_KINDS.has(item.kind)) continue;
    const parsed = parseLinearIssueUrl(item.url);
    if (parsed) known.add(parsed.identifier);
  }

  const ownPrs = input.activity
    .filter((item) => item.kind === 'pr_opened' || item.kind === 'pr_merged')
    .sort((a, b) => time(b.at) - time(a.at));

  const activityNodes = input.activity.map((item) => {
    if (CARD_KINDS.has(item.kind)) return cardKey(item);
    if (PR_KINDS.has(item.kind)) return `pr:${item.url}`;
    const repo = item.repo.toLowerCase();
    const pr = ownPrs.find((candidate) => candidate.repo.toLowerCase() === repo);
    return pr ? `pr:${pr.url}` : `project:${repo}`;
  });

  input.activity.forEach((item, index) => {
    const node = activityNodes[index] as string;
    links.add(node);
    if (!PR_KINDS.has(item.kind)) return;
    for (const id of [...cardIds(item.branch, known), ...cardIds(item.title, known)]) {
      links.join(node, `card:${id}`);
    }
  });

  const sessionNodes = input.sessions.map((session) => {
    const repo = session.repo?.toLowerCase() ?? null;
    const matched = ownPrs
      .filter(
        (pr) =>
          repo !== null &&
          session.branch !== null &&
          pr.repo.toLowerCase() === repo &&
          pr.branch === session.branch,
      )
      .map((pr) => `pr:${pr.url}`);
    for (const id of cardIds(session.branch, known)) matched.push(`card:${id}`);
    const [first, ...rest] = matched;
    if (!first) {
      const node = `project:${projectName(session)}`;
      links.add(node);
      return node;
    }
    for (const node of rest) links.join(first, node);
    return first;
  });

  const groups = new Map<string, Group>();
  const groupOf = (node: string): Group => {
    const root = links.find(node);
    let group = groups.get(root);
    if (!group) {
      group = { activity: [], sessions: [], nodes: new Set() };
      groups.set(root, group);
    }
    group.nodes.add(node);
    return group;
  };
  input.activity.forEach((item, index) => {
    groupOf(activityNodes[index] as string).activity.push(item);
  });
  input.sessions.forEach((session, index) => {
    const { repo: _repo, ...summary } = session;
    groupOf(sessionNodes[index] as string).sessions.push(summary);
  });

  const items = [...groups.values()].map((group) => {
    const activity = [...group.activity].sort((a, b) => time(b.at) - time(a.at));
    const sessions = [...group.sessions].sort((a, b) => time(b.endedAt) - time(a.endedAt));
    const latest = Math.max(
      0,
      ...activity.map((item) => time(item.at)),
      ...sessions.map((session) => time(session.endedAt)),
    );
    const { key, title } = describe({ ...group, activity });
    return { latest, item: { key, title, refs: refsOf(activity), activity, sessions } };
  });

  return items
    .sort((a, b) => b.latest - a.latest || a.item.key.localeCompare(b.item.key))
    .map(({ item }) => item);
}
