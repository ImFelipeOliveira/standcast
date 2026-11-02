import type { TodayShipped } from '@standcast/orchestrator';

export type Ref = TodayShipped['ref'];

const GITHUB_URL =
  /^https:\/\/github\.com\/[\w.-]+\/([\w.-]+)\/(pull|issues|commit)\/([0-9a-f]{7,40}|\d+)(?:[/?#].*)?$/;

const LINEAR_URL =
  /^https:\/\/linear\.app\/([A-Za-z0-9][\w-]*)\/issue\/([A-Za-z][A-Za-z0-9]*-\d+)(?:\/[^?#]*)?(?:[?#].*)?$/;

function githubLabel(url: string): string | null {
  const match = GITHUB_URL.exec(url.trim());
  if (!match) return null;
  const [, repo, kind, id] = match as unknown as [string, string, string, string];
  if (kind === 'commit') return /^[0-9a-f]+$/.test(id) ? `${repo}@${id.slice(0, 7)}` : null;
  return /^\d+$/.test(id) ? `${repo}#${id}` : null;
}

function linearLabel(url: string): string | null {
  const match = LINEAR_URL.exec(url.trim());
  return match ? (match[2] as string).toUpperCase() : null;
}

export function refLabel(ref: Ref): string {
  return githubLabel(ref.url) ?? linearLabel(ref.url) ?? ref.title ?? ref.url;
}
