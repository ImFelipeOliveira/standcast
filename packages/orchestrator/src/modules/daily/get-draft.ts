import {
  type ActivityItem,
  activitySince,
  clampTitle,
  type Pending,
  type Plan,
  type Ref,
  type SignalKind,
} from '@standcast/core';
import { getLastDaily, listPendingSuggestions, type MemberRow } from '@standcast/db';
import type { Deps } from '../../deps';
import { type MembershipCheck, type OrgContext, resolveOrgContext } from '../access/org-context';
import { nullTracker, type ProjectTracker } from '../linear/project-tracker';
import { loadPending } from './draft-pending';
import { loadPlan } from './draft-plan';
import { type DraftWarn, type DraftWarning, fromSource, sortWarnings } from './draft-warnings';

const MAX_ACTIVITY = 50;

export type DraftSuggestion = { id: string; kind: SignalKind; ref: Ref; since: string };

export type Draft = {
  org: string;
  date: string;
  since: string;
  teams: string[];
  activity: ActivityItem[];
  suggestions: DraftSuggestion[];
  plan: Plan | null;
  pending: Pending;
  warnings: DraftWarning[];
};

export async function getDraft(
  deps: Deps,
  isMember: MembershipCheck,
  member: MemberRow,
  org: string | undefined,
): Promise<Draft> {
  const ctx = await resolveOrgContext(deps, isMember, member, org);
  const cal = ctx.mine[0];
  const lastDaily = await getLastDaily(deps.db, ctx.installationId, ctx.member.id, ctx.date);
  const since = activitySince({ date: ctx.date, cal, ...(lastDaily ? { lastDaily } : {}) });
  const warnings: DraftWarning[] = [];
  const warn: DraftWarn = (warning) => {
    warnings.push(warning);
  };
  const tracker = trackerOf(deps, ctx, warn);
  const [github, cards, suggestions, plan, pending] = await Promise.all([
    listGithubActivity(deps, ctx, since, warn),
    tracker.then((t) => listCards(ctx, t, since, warn)),
    listPendingSuggestions(deps.db, ctx.installationId, ctx.member.id),
    tracker.then((t) => loadPlan(deps, ctx, t, warn)),
    tracker.then((t) => loadPending(deps, ctx, t, warn)),
  ]);
  const activity = [...github, ...cards]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, MAX_ACTIVITY);
  return {
    org: ctx.owner,
    date: ctx.date,
    since: since.toISOString(),
    teams: ctx.mine.map((t) => t.name),
    activity,
    suggestions: suggestions.map((s) => ({
      id: s.id,
      kind: s.kind,
      ref: s.ref.title === undefined ? s.ref : { ...s.ref, title: clampTitle(s.ref.title) },
      since: s.createdAt.toISOString(),
    })),
    plan,
    pending,
    warnings: sortWarnings(warnings),
  };
}

function trackerOf(deps: Deps, ctx: OrgContext, warn: DraftWarn): Promise<ProjectTracker> {
  return fromSource('linear_activity', ctx, warn, nullTracker, () =>
    deps.trackerFor(ctx.installationId, ctx.owner, ctx.config, ctx.mine[0]),
  );
}

function listGithubActivity(
  deps: Deps,
  ctx: OrgContext,
  since: Date,
  warn: DraftWarn,
): Promise<ActivityItem[]> {
  return fromSource('github_activity', ctx, warn, [], async () => {
    const octokit = await deps.github.installationOctokit(ctx.installationId);
    return deps.github.listActivity(octokit, ctx.owner, ctx.member.login, since);
  });
}

function listCards(
  ctx: OrgContext,
  tracker: ProjectTracker,
  since: Date,
  warn: DraftWarn,
): Promise<ActivityItem[]> {
  return fromSource('linear_activity', ctx, warn, [], async () => {
    if (!tracker.connected) return [];
    const items = await tracker.listActivity(ctx.member.login, since);
    return items.map((item) => ({ ...item, title: clampTitle(item.title) }));
  });
}
