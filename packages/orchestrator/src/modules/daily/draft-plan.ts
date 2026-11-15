import {
  buildPlan,
  type Plan,
  type PlanLookupResult,
  planIsFresh,
  planTargets,
  startOfLocalDay,
} from '@standcast/core';
import { getPreviousDaily } from '@standcast/db';
import type { Deps } from '../../deps';
import type { OrgContext } from '../access/org-context';
import type { ProjectTracker } from '../linear/project-tracker';
import { type DraftWarn, fromSource } from './draft-warnings';

type Lookups = Map<string, PlanLookupResult>;

export async function loadPlan(
  deps: Deps,
  ctx: OrgContext,
  tracker: ProjectTracker,
  warn: DraftWarn,
): Promise<Plan | null> {
  const previous = await getPreviousDaily(deps.db, ctx.installationId, ctx.member.id, ctx.date);
  if (!previous || !planIsFresh(previous.date, ctx.date)) return null;
  const targets = planTargets(previous.today, ctx.owner);
  const login = ctx.member.login;
  const since = new Date(
    Math.min(
      previous.firstSubmittedAt.getTime(),
      startOfLocalDay(previous.date, ctx.mine[0].timezone).getTime(),
    ),
  );
  const none: Lookups = new Map();
  const [pulls, cards] = await Promise.all([
    fromSource('github_plan', ctx, warn, none, async (): Promise<Lookups> => {
      if (targets.pullRequests.length === 0) return none;
      const octokit = await deps.github.installationOctokit(ctx.installationId);
      return deps.github.lookupPlannedPullRequests(octokit, {
        login,
        since,
        targets: targets.pullRequests,
      });
    }),
    fromSource('linear_plan', ctx, warn, none, async (): Promise<Lookups> => {
      if (targets.cards.length === 0) return none;
      return tracker.lookupCards(login, targets.cards, since);
    }),
  ]);
  return buildPlan({
    date: previous.date,
    items: previous.today,
    results: new Map([...pulls, ...cards]),
  });
}
