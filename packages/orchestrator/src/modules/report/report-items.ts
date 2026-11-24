import {
  githubRefLabel,
  parseLinearIssueUrl,
  type ReportItem,
  type ReportItemKind,
  type ReportLink,
} from '@standcast/core';
import type { PullRequestText } from '@standcast/github';
import type { CardText } from '../linear/project-tracker';

const INTERNAL = /^(chore|ci|build|test|docs|style|refactor)(\([^)]*\))?!?:/i;
const CARD_KEY = /\b([A-Za-z][A-Za-z0-9]{0,9})-(\d{1,7})\b/g;
const LINEAR_URL = /https?:\/\/linear\.app\/\S+/g;
const REVERT = /^Reverts\s+([\w.-]+)\/([\w.-]+)#(\d+)/m;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,3}\)[\s.-]?|\d{2,3}[\s.-])?\d{4,5}[\s.-]?\d{4}\b/g;
const CONVENTIONAL_PREFIX = /^\w+(\([^)]*\))?!?:\s*/;
const FIX_TITLE = /^\s*fix(?=[(!:\s])/i;

export type ItemSource = {
  pullRequests: (PullRequestText & { repository: string; reachedAt: Date })[];
  card: CardText | null;
};

export function isInternal(title: string, author: string): boolean {
  return INTERNAL.test(title) || author.endsWith('[bot]');
}

export function cardIdentifiers(...texts: string[]): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    for (const url of text.match(LINEAR_URL) ?? []) {
      const ref = parseLinearIssueUrl(url.replace(/[).,;]+$/, ''));
      if (ref) found.add(ref.identifier.toUpperCase());
    }
    for (const m of text.matchAll(CARD_KEY)) found.add(`${m[1]}-${m[2]}`.toUpperCase());
  }
  return [...found].slice(0, 3);
}

export function revertTarget(body: string): { owner: string; repo: string; number: number } | null {
  const m = REVERT.exec(body);
  return m ? { owner: m[1] as string, repo: m[2] as string, number: Number(m[3]) } : null;
}

export function stripContacts(text: string): string {
  return text.replace(EMAIL, '').replace(PHONE, '').replace(/ {2,}/g, ' ').trim();
}

export function itemLinks({ pullRequests, card }: ItemSource): ReportLink[] {
  const links = pullRequests.map((pr) => ({
    label: githubRefLabel(pr.url) ?? pr.url,
    url: pr.url,
  }));
  return card ? [...links, { label: card.identifier, url: card.url }] : links;
}

export function rawItem(source: ItemSource): ReportItem {
  const { pullRequests, card } = source;
  const original = pullRequests[0]?.title ?? card?.title ?? '';
  const stripped = original.replace(CONVENTIONAL_PREFIX, '');
  const isBug = (label: string) => label.toLowerCase() === 'bug';
  const fixed =
    pullRequests.some((pr) => FIX_TITLE.test(pr.title) || pr.labels.some(isBug)) ||
    (card?.labels.some(isBug) ?? false);
  const kind: ReportItemKind = fixed ? 'fixed' : 'new';
  const oldest = Math.min(...pullRequests.map((pr) => pr.reachedAt.getTime()));
  return {
    kind,
    title: stripContacts(stripped || original),
    liveSince: new Date(oldest).toISOString(),
    links: itemLinks(source),
  };
}
