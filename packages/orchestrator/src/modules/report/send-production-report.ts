import {
  buildProductionReport,
  type ChatProvider,
  githubRefLabel,
  isDue,
  type Language,
  localDate,
  type MessageRef,
  type ReportItem,
  type StandcastConfig,
  type TeamConfig,
  weekdayOf,
} from '@standcast/core';
import {
  claimDelivery,
  completeDelivery,
  type DeliveryKey,
  failDelivery,
  getDelivery,
  getInstallation,
  getProductionReport,
  getTeamReport,
  listProductionPullRequests,
  listProductionReportsSince,
  listTeamReports,
  MAX_DELIVERY_ATTEMPTS,
  markLlmKeyRejected,
  operationalConfig,
  type ProductionPullRequestRow,
  type ProductionReportRow,
  saveProductionReport,
  setTeamReportCutoff,
  type TeamReportRow,
} from '@standcast/db';
import type { Octokit, PullRequestText } from '@standcast/github';
import type { WorkerDeps } from '../../deps';
import { logError } from '../../log-error';
import { resolveMemberTeams } from '../../teams';
import { isChannelLinked } from '../chat/chat';
import { describeDeliveryError, spaceNotLinked } from '../delivery/delivery-error';
import type { CardText } from '../linear/project-tracker';
import { describeItem } from './describe-item';
import { POST_REPORT_ITEM_JOB, type PostReportItemJob } from './post-report-item';
import {
  cardIdentifiers,
  type ItemPullRequest,
  type ItemSource,
  isInternal,
  rawItem,
  revertTarget,
} from './report-items';

export const SEND_PRODUCTION_REPORT_JOB = 'send-production-report';
export const REPLY_SPACING_MS = 1500;
export const DESCRIBE_CONCURRENCY = 4;
export const REPORT_LOOKBACK_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;
const KIND_ORDER = { new: 0, fixed: 1, removed: 2 };

export type SendProductionReportJob = { installationId: number; teamName: string; date: string };

type Context = {
  installation: { id: number; accountLogin: string };
  config: StandcastConfig;
  team: TeamConfig;
  report: TeamReportRow;
  date: string;
  windowEnd: Date;
};

const reportKey = (job: SendProductionReportJob): DeliveryKey => ({
  ...job,
  kind: 'production_report',
});

export async function enqueueProductionReportsIfDue(
  deps: Pick<WorkerDeps, 'db' | 'queue'>,
  installation: { id: number; config: StandcastConfig },
  now: Date,
): Promise<void> {
  for (const report of await listTeamReports(deps.db, installation.id)) {
    const team = installation.config.teams.find((t) => t.name === report.teamName);
    if (!report.enabled || !team) continue;
    const date = localDate(now, team.timezone);
    if (weekdayOf(date) !== report.weekday) continue;
    if (!isDue(now, date, report.time, team.timezone)) continue;
    const job = { installationId: installation.id, teamName: team.name, date };
    const row = await getDelivery(deps.db, reportKey(job));
    if (row?.status === 'sent') continue;
    if (row?.status === 'failed' && row.attempts >= MAX_DELIVERY_ATTEMPTS) continue;
    await deps.queue.enqueue(SEND_PRODUCTION_REPORT_JOB, job, {
      singletonKey: `production-report:${installation.id}:${team.name}:${date}`,
    });
  }
}

async function pullRequestText(
  deps: WorkerDeps,
  octokit: Octokit,
  owner: string,
  row: ProductionPullRequestRow,
): Promise<PullRequestText | null> {
  try {
    return await deps.githubProduction.getPullRequestText(
      octokit,
      owner,
      row.repository,
      row.number,
    );
  } catch (error) {
    logError('production report pull request failed', error, { repository: row.repository });
    return { number: row.number, url: row.url, title: '', body: '', labels: [], headRef: '' };
  }
}

async function teamPullRequests(deps: WorkerDeps, ctx: Context): Promise<ItemPullRequest[]> {
  const { installation, team, report } = ctx;
  const [resolved] = await resolveMemberTeams(deps, installation.id, installation.accountLogin, {
    ...ctx.config,
    teams: [team],
  });
  const members = new Set(resolved?.memberLogins.map((login) => login.toLowerCase()));
  const rows = (
    await listProductionPullRequests(deps.db, {
      installationId: installation.id,
      branch: report.productionBranch,
      after: report.cutoffAt,
      upTo: ctx.windowEnd,
    })
  ).filter((row) => members.has(row.authorLogin.toLowerCase()));
  if (rows.length === 0) return [];
  const octokit = await deps.github.installationOctokit(installation.id);
  const pulls: ItemPullRequest[] = [];
  for (const row of rows) {
    const text = await pullRequestText(deps, octokit, installation.accountLogin, row);
    if (!text || isInternal(text.title, row.authorLogin)) continue;
    pulls.push({ ...text, repository: row.repository, reachedAt: row.reachedAt });
  }
  return pulls;
}

async function applyReverts(
  deps: WorkerDeps,
  ctx: Context,
  pulls: ItemPullRequest[],
): Promise<{ kept: ItemPullRequest[]; removed: ReportItem[] }> {
  const since = new Date(ctx.windowEnd.getTime() - REPORT_LOOKBACK_DAYS * DAY_MS);
  const earlier = (
    await listProductionReportsSince(deps.db, ctx.installation.id, ctx.team.name, since)
  )
    .filter((r) => r.date !== ctx.date)
    .flatMap((r) => r.items)
    .filter((item) => item.kind !== 'removed');
  const inWindow = new Set(pulls.map((pr) => pr.url.toLowerCase()));
  const dropped = new Set<string>();
  const removed: ReportItem[] = [];
  for (const pr of pulls) {
    const target = revertTarget(pr.body);
    if (!target) continue;
    const url =
      `https://github.com/${target.owner}/${target.repo}/pull/${target.number}`.toLowerCase();
    dropped.add(pr.url.toLowerCase());
    if (inWindow.has(url)) {
      dropped.add(url);
      continue;
    }
    const reported = earlier.find((item) => item.links.some((l) => l.url.toLowerCase() === url));
    if (!reported) continue;
    removed.push({
      kind: 'removed',
      title: reported.title,
      liveSince: pr.reachedAt.toISOString(),
      links: [{ label: githubRefLabel(pr.url) ?? pr.url, url: pr.url }],
    });
  }
  return { kept: pulls.filter((pr) => !dropped.has(pr.url.toLowerCase())), removed };
}

async function groupByCard(
  deps: WorkerDeps,
  ctx: Context,
  pulls: ItemPullRequest[],
): Promise<ItemSource[]> {
  if (pulls.length === 0) return [];
  const { installation } = ctx;
  const tracker = await deps.trackerFor(
    installation.id,
    installation.accountLogin,
    ctx.config,
    ctx.team,
  );
  const cards = new Map<string, CardText | null>();
  const groups = new Map<string, ItemSource>();
  for (const pr of pulls) {
    let card: CardText | null = null;
    for (const identifier of cardIdentifiers(pr.headRef, pr.title, pr.body)) {
      if (!cards.has(identifier)) cards.set(identifier, await tracker.cardText(identifier));
      card = cards.get(identifier) ?? null;
      if (card) break;
    }
    const key = card?.identifier ?? pr.url;
    const group = groups.get(key);
    if (group) group.pullRequests.push(pr);
    else groups.set(key, { pullRequests: [pr], card });
  }
  return [...groups.values()];
}

async function describeAll(
  deps: WorkerDeps,
  installationId: number,
  sources: ItemSource[],
  lang: Language,
): Promise<ReportItem[]> {
  if (sources.length === 0) return [];
  let model = await deps.textModelFor(installationId);
  let rejected = false;
  const items: (ReportItem | null)[] = [];
  const pending = [...sources.entries()];
  const lane = async () => {
    for (let next = pending.shift(); next; next = pending.shift()) {
      const [index, source] = next;
      const described = await describeItem(
        source.pullRequests[0].title ? model : null,
        source,
        lang,
      );
      if (described === 'internal') {
        items[index] = null;
      } else if ('error' in described) {
        model = null;
        rejected = true;
        items[index] = rawItem(source);
      } else {
        items[index] = described;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(DESCRIBE_CONCURRENCY, sources.length) }, lane));
  if (rejected) await markLlmKeyRejected(deps.db, installationId, deps.now());
  return items.filter((item): item is ReportItem => item !== null);
}

async function buildReport(deps: WorkerDeps, ctx: Context): Promise<ProductionReportRow> {
  const pulls = await teamPullRequests(deps, ctx);
  const { kept, removed } = await applyReverts(deps, ctx, pulls);
  const sources = await groupByCard(deps, ctx, kept);
  const described = await describeAll(deps, ctx.installation.id, sources, ctx.team.language);
  const items = [...described, ...removed].sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.liveSince.localeCompare(b.liveSince),
  );
  return saveProductionReport(deps.db, ctx.installation.id, {
    teamName: ctx.team.name,
    date: ctx.date,
    windowStart: ctx.report.cutoffAt,
    windowEnd: ctx.windowEnd,
    items,
  });
}

async function postOnce(
  deps: WorkerDeps,
  key: DeliveryKey,
  provider: ChatProvider,
  post: () => Promise<MessageRef>,
): Promise<MessageRef | null> {
  const claim = await claimDelivery(deps.db, key);
  if (claim.status === 'in_progress') throw new Error('production_report_post_in_progress');
  if (claim.status === 'already_sent') {
    const row = await getDelivery(deps.db, key);
    return row?.status === 'sent' ? row.ref : null;
  }
  try {
    const ref = await post();
    await completeDelivery(deps.db, key, claim.token, ref);
    return ref;
  } catch (error) {
    await failDelivery(deps.db, key, claim.token, describeDeliveryError(error, provider));
    throw error;
  }
}

export async function sendProductionReport(
  deps: WorkerDeps,
  job: SendProductionReportJob,
): Promise<void> {
  const installation = await getInstallation(deps.db, job.installationId);
  const config = operationalConfig(installation);
  if (!installation || !config) return;
  const team = config.teams.find((t) => t.name === job.teamName);
  const report = await getTeamReport(deps.db, job.installationId, job.teamName);
  if (!team || !report?.enabled) return;

  const key = reportKey(job);
  const claim = await claimDelivery(deps.db, key);
  if (claim.status !== 'claimed') return;
  const windowEnd = deps.now();
  const provider = team.chat.provider;
  try {
    const chat = await deps.chatFor(job.installationId, provider);
    if (!chat) {
      await failDelivery(deps.db, key, claim.token, 'no_chat_connection');
      return;
    }
    if (!(await isChannelLinked(deps, job.installationId, provider, report.channel))) {
      const reason = describeDeliveryError(spaceNotLinked(), provider);
      await failDelivery(deps.db, key, claim.token, reason);
      return;
    }
    const stored =
      (await getProductionReport(deps.db, job.installationId, job.teamName, job.date)) ??
      (await buildReport(deps, { installation, config, team, report, date: job.date, windowEnd }));
    if (stored.items.length === 0) {
      await setTeamReportCutoff(deps.db, job.installationId, job.teamName, stored.windowEnd);
      await completeDelivery(deps.db, key, claim.token, null);
      return;
    }
    const chunks = buildProductionReport({
      lang: team.language,
      team: team.name,
      from: localDate(stored.windowStart, team.timezone),
      to: job.date,
      items: stored.items,
    });
    const threads: { ref: MessageRef; items: number[] }[] = [];
    for (const [index, chunk] of chunks.entries()) {
      const ref = await postOnce(
        deps,
        { ...key, kind: 'production_report_post', subject: String(index) },
        provider,
        () => chat.postToChannel(report.channel, chunk.message),
      );
      if (ref) threads.push({ ref, items: chunk.items });
    }
    await setTeamReportCutoff(deps.db, job.installationId, job.teamName, stored.windowEnd);
    const start = deps.now().getTime();
    const replies: PostReportItemJob[] = threads.flatMap(({ ref, items }) =>
      items.map((index) => ({ ...job, index, thread: ref })),
    );
    for (const [position, reply] of replies.entries()) {
      await deps.queue.enqueue(POST_REPORT_ITEM_JOB, reply, {
        singletonKey: `report-item:${job.installationId}:${job.teamName}:${job.date}:${reply.index}`,
        startAfter: new Date(start + position * REPLY_SPACING_MS),
      });
    }
    await completeDelivery(deps.db, key, claim.token, threads.at(-1)?.ref ?? null);
  } catch (error) {
    await failDelivery(deps.db, key, claim.token, describeDeliveryError(error, provider));
    throw error;
  }
}
