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
const DIGIT_RUN = /\d{4}-\d{2}-\d{2}(?!\d)|\+?\(?\d(?:(?!\d{4}-\d{2}-\d{2})[\d\s.\-()])*/g;
const MIN_CONTACT_DIGITS = 8;
const CONVENTIONAL_PREFIX =
  /^(feat|fix|chore|ci|build|test|docs|style|refactor|perf|revert|hotfix|bugfix)(\([^)]*\))?!?:\s*/i;
const FIX_TITLE = /^\s*(fix|fixes|fixed|hotfix|bugfix)(?=[(!:\s])/i;

export type ItemPullRequest = PullRequestText & { repository: string; reachedAt: Date };

export type ItemSource = {
  pullRequests: [ItemPullRequest, ...ItemPullRequest[]];
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
  return text
    .replace(EMAIL, '')
    .replace(DIGIT_RUN, (run) => {
      const core = run.replace(/[\s.\-(]+$/, '');
      const digits = core.replace(/\D/g, '').length;
      if (/^\d{4}-\d{2}-\d{2}$/.test(core) || digits < MIN_CONTACT_DIGITS) return run;
      return run.slice(core.length);
    })
    .replace(/ {2,}/g, ' ')
    .trim();
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
  const first = pullRequests[0];
  const isBug = (label: string) => label.toLowerCase() === 'bug';
  const fixed =
    pullRequests.some((pr) => FIX_TITLE.test(pr.title) || pr.labels.some(isBug)) ||
    (card?.labels.some(isBug) ?? false);
  const kind: ReportItemKind = fixed ? 'fixed' : 'new';
  const oldest = Math.min(...pullRequests.map((pr) => pr.reachedAt.getTime()));
  const stripped = first.title.replace(CONVENTIONAL_PREFIX, '') || first.title;
  const title =
    stripContacts(stripped) ||
    stripContacts(card?.title ?? '') ||
    (githubRefLabel(first.url) ?? first.url);
  return { kind, title, liveSince: new Date(oldest).toISOString(), links: itemLinks(source) };
}
