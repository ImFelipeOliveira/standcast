import type { Pending } from '@standcast/core';
import type { Deps } from '../../deps';
import type { OrgContext } from '../access/org-context';
import type { ProjectTracker } from '../linear/project-tracker';
import { type DraftWarn, fromSource } from './draft-warnings';

const EMPTY: Pending = { items: [], truncated: false };

export async function loadPending(
  deps: Deps,
  ctx: OrgContext,
  tracker: ProjectTracker,
  warn: DraftWarn,
): Promise<Pending> {
  const login = ctx.member.login;
  const [pulls, cards] = await Promise.all([
    fromSource('github_pending', ctx, warn, EMPTY, async () => {
      const octokit = await deps.github.installationOctokit(ctx.installationId);
      return deps.github.listPendingPullRequests(octokit, ctx.owner, login);
    }),
    fromSource('linear_pending', ctx, warn, EMPTY, () => tracker.listAssignedOpen(login)),
  ]);
  return {
    items: [...pulls.items, ...cards.items],
    truncated: pulls.truncated || cards.truncated,
  };
}
