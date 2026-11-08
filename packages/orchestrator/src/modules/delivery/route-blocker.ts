import {
  type BlockerRouteReason,
  buildBlockerRouted,
  type GitHubPullRef,
  type Item,
  ownersForFiles,
  parseCodeowners,
  parsePullRequestUrl,
  parseTeamReference,
  type Ref,
  type ResolvedTeam,
  type StandcastConfig,
  teamsForMember,
} from '@standcast/core';
import {
  claimDelivery,
  completeDelivery,
  type DeliveryKey,
  failDelivery,
  getDailyById,
  getInstallation,
  operationalConfig,
  reserveBlockerRoute,
} from '@standcast/db';
import type { WorkerDeps } from '../../deps';
import { logError } from '../../log-error';
import { isOwnTeam, resolveTeamsWithNotices } from '../../teams';
import {
  directMessageIdsFor,
  forgetStaleChatIdentity,
  membershipTimeout,
} from '../chat/chat-identity';
import type { CardOwners } from '../linear/project-tracker';
import { describeDeliveryError, isTerminalDeliveryError } from './delivery-error';
import { blockerRouteId } from './events';

export const ROUTE_BLOCKER_JOB = 'route-blocker';
const MAX_ROUTE_TARGETS = 5;
const MAX_MANAGER_CANDIDATES = 50;
const MAX_ROUTED_BLOCKERS_PER_DAILY = 10;

export type RouteBlockerJob = {
  installationId: number;
  dailyId: string;
  blockerIndex: number;
  blockerId?: string;
};

type RouteTarget = { reason: BlockerRouteReason; logins: string[] };

type RouteContext = {
  installationId: number;
  owner: string;
  config: StandcastConfig;
  author: string;
  firstTeam: ResolvedTeam;
  blocker: Item;
};

type Octokit = Awaited<ReturnType<WorkerDeps['github']['installationOctokit']>>;

function cleanLogins(logins: string[], excluded: string[], limit = MAX_ROUTE_TARGETS): string[] {
  const skip = new Set(excluded.map((l) => l.toLowerCase()));
  const result = new Set<string>();
  for (const login of logins) {
    const lower = login.replace(/^@/, '').toLowerCase();
    if (!lower || skip.has(lower)) continue;
    result.add(lower);
  }
  return [...result].slice(0, limit);
}

function managerTarget(ctx: RouteContext): RouteTarget {
  return {
    reason: 'manager',
    logins: cleanLogins(ctx.firstTeam.managerLogins, [ctx.author], MAX_MANAGER_CANDIDATES),
  };
}

function reachableFirst(logins: string[], reachable: (login: string) => boolean): string[] {
  const ordered = [...logins.filter(reachable), ...logins.filter((login) => !reachable(login))];
  return ordered.slice(0, MAX_ROUTE_TARGETS);
}

async function expandOwners(
  deps: WorkerDeps,
  octokit: Octokit,
  owner: string,
  entries: string[],
): Promise<string[]> {
  const logins: string[] = [];
  for (const entry of entries) {
    if (parseTeamReference(entry) === null) {
      if (!entry.includes('/')) logins.push(entry.replace(/^@/, ''));
    } else if (isOwnTeam(entry, owner)) {
      logins.push(...(await deps.github.resolveTeamMembers(octokit, owner, [entry])).logins);
    }
  }
  return logins;
}

async function pullRequestTarget(
  deps: WorkerDeps,
  ctx: RouteContext,
  pull: GitHubPullRef,
): Promise<RouteTarget | null> {
  try {
    return await lookupPullRequestTarget(deps, ctx, pull);
  } catch (error) {
    logError('blocker route github lookup failed', error, {
      status: String((error as { status?: unknown }).status),
    });
    return null;
  }
}

async function lookupPullRequestTarget(
  deps: WorkerDeps,
  ctx: RouteContext,
  pull: GitHubPullRef,
): Promise<RouteTarget | null> {
  const octokit = await deps.github.installationOctokit(ctx.installationId);
  const detail = await deps.github.getPullRequest(octokit, pull);
  if (!detail) return null;
  const excluded = [ctx.author, detail.author];
  const teamRefs = detail.requestedTeams.map((slug) => `@${ctx.owner}/${slug}`);
  const reviewers = cleanLogins(
    [...detail.requestedReviewers, ...(await expandOwners(deps, octokit, ctx.owner, teamRefs))],
    excluded,
  );
  if (reviewers.length > 0) return { reason: 'pr_reviewers', logins: reviewers };
  const source = await deps.github.fetchCodeowners(octokit, pull.owner, pull.repo, detail.baseRef);
  if (!source) return null;
  const files = await deps.github.listPullRequestFiles(octokit, pull);
  const entries = ownersForFiles(parseCodeowners(source), files);
  const owners = cleanLogins(await expandOwners(deps, octokit, ctx.owner, entries), excluded);
  return owners.length > 0 ? { reason: 'codeowners', logins: owners } : null;
}

async function cardTarget(
  deps: WorkerDeps,
  ctx: RouteContext,
  ref: Ref,
): Promise<RouteTarget | null> {
  let owners: CardOwners | null;
  try {
    const tracker = await deps.trackerFor(ctx.installationId, ctx.owner, ctx.config, ctx.firstTeam);
    owners = await tracker.cardOwners(ref);
  } catch (error) {
    logError('blocker route tracker lookup failed', error, {
      installationId: String(ctx.installationId),
    });
    return null;
  }
  if (!owners) return null;
  const blockers = cleanLogins(owners.blockers, [ctx.author]);
  if (blockers.length > 0) return { reason: 'card_blocker', logins: blockers };
  for (const login of [owners.assignee, owners.creator]) {
    const logins = cleanLogins(login ? [login] : [], [ctx.author]);
    if (logins.length > 0) return { reason: 'card_owner', logins };
  }
  return null;
}

export async function resolveRouteTarget(
  deps: WorkerDeps,
  ctx: RouteContext,
): Promise<RouteTarget> {
  const ref = ctx.blocker.ref;
  if (ref?.kind === 'pull_request') {
    const pull = parsePullRequestUrl(ref.url);
    if (pull && pull.owner.toLowerCase() === ctx.owner.toLowerCase()) {
      const found = await pullRequestTarget(deps, ctx, pull);
      if (found) return found;
    }
  }
  if (ref?.kind === 'card') {
    const found = await cardTarget(deps, ctx, ref);
    if (found) return found;
  }
  return managerTarget(ctx);
}

function findBlocker(blockers: Item[], job: RouteBlockerJob): Item | undefined {
  const atIndex = blockers[job.blockerIndex];
  if (!job.blockerId) return atIndex;
  if (atIndex && blockerRouteId(atIndex) === job.blockerId) return atIndex;
  return blockers.find((b) => blockerRouteId(b) === job.blockerId);
}

async function recordNoTarget(deps: WorkerDeps, key: DeliveryKey): Promise<void> {
  const claim = await claimDelivery(deps.db, key);
  if (claim.status === 'claimed') {
    await failDelivery(deps.db, key, claim.token, 'no_route_target');
  }
}

export async function routeBlocker(deps: WorkerDeps, job: RouteBlockerJob): Promise<void> {
  const installation = await getInstallation(deps.db, job.installationId);
  const config = operationalConfig(installation);
  if (!installation || !config) return;
  const daily = await getDailyById(deps.db, job.installationId, job.dailyId);
  const blocker = daily ? findBlocker(daily.payload.blockers, job) : undefined;
  if (!daily || !blocker) return;
  const author = daily.login.toLowerCase();
  const { teams, notices } = await resolveTeamsWithNotices(
    deps,
    installation.id,
    installation.accountLogin,
    config,
  );
  const firstTeam = teamsForMember(author, teams)[0];
  if (!firstTeam) return;
  const managersUnavailable = notices.some(
    (notice) => notice.team === firstTeam.name && notice.kind === 'managers_unavailable',
  );
  const blockerId = blockerRouteId(blocker);
  const reservation = await reserveBlockerRoute(deps.db, {
    installationId: job.installationId,
    date: daily.date,
    dailyId: job.dailyId,
    blockerId,
    limit: MAX_ROUTED_BLOCKERS_PER_DAILY,
  });
  if (reservation.status === 'capped') {
    console.error('blocker route cap reached', {
      installationId: String(job.installationId),
      dailyId: job.dailyId,
      limit: String(MAX_ROUTED_BLOCKERS_PER_DAILY),
    });
    return;
  }

  const ctx: RouteContext = {
    installationId: job.installationId,
    owner: installation.accountLogin,
    config,
    author,
    firstTeam,
    blocker,
  };
  const provider = firstTeam.chat.provider;
  let target = await resolveRouteTarget(deps, ctx);
  const fallback = managerTarget(ctx);
  const chat = await deps.chatFor(job.installationId, provider);
  const { ids, timedOut } = await directMessageIdsFor(
    deps,
    chat,
    job.installationId,
    config,
    provider,
    [...target.logins, ...fallback.logins, author],
  );
  const reachable = (login: string) => ids.has(login) || timedOut.has(login);
  if (target.reason !== 'manager' && !target.logins.some(reachable)) target = fallback;
  if (target.reason === 'manager' && managersUnavailable && !target.logins.some(reachable)) {
    throw new Error('blocker_route_managers_unavailable');
  }
  const previous = reservation.recipients;
  if (previous) {
    target = { ...target, logins: target.logins.filter((l) => previous.has(l)) };
    if (target.logins.length === 0) return;
  }
  if (target.reason === 'manager') {
    target = { ...target, logins: reachableFirst(target.logins, reachable) };
  }

  const keyFor = (suffix: string): DeliveryKey => ({
    installationId: job.installationId,
    teamName: '',
    date: daily.date,
    kind: 'blocker_route',
    subject: `${job.dailyId}:${blockerId}:${suffix}`,
  });
  if (target.logins.length === 0) {
    await recordNoTarget(deps, keyFor('-'));
    return;
  }

  const authorChatId = ids.get(author);
  let busy = false;
  let failure: unknown = null;
  for (const login of target.logins) {
    const key = keyFor(login);
    const claim = await claimDelivery(deps.db, key);
    if (claim.status === 'in_progress') busy = true;
    if (claim.status !== 'claimed') continue;
    try {
      if (!chat) {
        await failDelivery(deps.db, key, claim.token, 'no_chat_connection');
        continue;
      }
      if (timedOut.has(login)) throw membershipTimeout();
      const chatUserId = ids.get(login);
      if (!chatUserId) {
        await failDelivery(deps.db, key, claim.token, `no_chat_identity: ${login}`);
        continue;
      }
      const ref = await chat.sendDirect(
        chatUserId,
        buildBlockerRouted({
          lang: firstTeam.language,
          author: { login: daily.login, ...(authorChatId ? { chatUserId: authorChatId } : {}) },
          blocker,
          reason: target.reason,
          date: daily.date,
        }),
      );
      await completeDelivery(deps.db, key, claim.token, ref);
    } catch (error) {
      await failDelivery(deps.db, key, claim.token, describeDeliveryError(error, provider));
      const chatUserId = ids.get(login);
      if (chatUserId) {
        await forgetStaleChatIdentity(
          deps,
          job.installationId,
          config,
          provider,
          login,
          chatUserId,
          error,
        );
      }
      if (!isTerminalDeliveryError(error)) failure ??= error;
    }
  }
  if (failure) throw failure;
  if (busy) throw new Error('blocker_route_in_progress');
}
