import type { ActivityItem } from '@standcast/core';
import { resolveRepo } from './repo';
import { readSessions } from './sessions';
import { buildWorkItems, type WorkItem } from './work-items';

export type Draft = { since: string; activity: unknown[] } & Record<string, unknown>;

type Options = { now: Date; env: Record<string, string | undefined>; dir?: string };

const KINDS = new Set<string>([
  'pr_opened',
  'pr_merged',
  'review',
  'commits',
  'card_started',
  'card_done',
]);

function isActivityItem(value: unknown): value is ActivityItem {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.kind === 'string' &&
    KINDS.has(item.kind) &&
    typeof item.title === 'string' &&
    typeof item.url === 'string' &&
    typeof item.repo === 'string' &&
    (item.branch === undefined || typeof item.branch === 'string')
  );
}

export async function draftWithWork<T extends Draft>(
  draft: T,
  opts: Options,
): Promise<T & { work: WorkItem[] }> {
  const activity = (Array.isArray(draft.activity) ? draft.activity : []).filter(isActivityItem);
  const summaries = await readSessions({
    dir: opts.dir,
    since: new Date(draft.since),
    until: opts.now,
    env: opts.env,
  });
  const sessions = await Promise.all(
    summaries.map(async (session) => ({ ...session, repo: await resolveRepo(session.cwd) })),
  );
  return { ...draft, work: buildWorkItems({ activity, sessions }) };
}
