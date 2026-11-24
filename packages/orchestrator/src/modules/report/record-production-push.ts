import { isConfigRepo } from '@standcast/core';
import {
  getInstallation,
  listProductionBranches,
  recordProductionPullRequests,
} from '@standcast/db';
import type { Deps, WorkerDeps } from '../../deps';
import { logError } from '../../log-error';
import type { GitHubEventPayload } from '../github/handle-github-event';

export const RECORD_PRODUCTION_PUSH_JOB = 'record-production-push';

export type RecordProductionPushJob = {
  installationId: number;
  owner: string;
  repo: string;
  branch: string;
  before: string;
  after: string;
  receivedAt: string;
};

const BRANCH_PREFIX = 'refs/heads/';

export async function enqueueProductionPush(
  deps: Pick<Deps, 'db' | 'queue' | 'now'>,
  payload: GitHubEventPayload,
): Promise<void> {
  const installationId = payload.installation?.id;
  const repo = payload.repository?.name;
  const login = payload.repository?.owner?.login;
  const { ref, before, after } = payload;
  if (installationId === undefined || !repo || !login || !after) return;
  if (payload.deleted || payload.created) return;
  if (!before || /^0+$/.test(before)) return;
  if (!ref?.startsWith(BRANCH_PREFIX) || isConfigRepo(repo)) return;
  const branch = ref.slice(BRANCH_PREFIX.length);
  if (!(await listProductionBranches(deps.db, installationId)).includes(branch)) return;
  const installation = await getInstallation(deps.db, installationId);
  if (!installation || installation.accountLogin.toLowerCase() !== login.toLowerCase()) return;
  const job: RecordProductionPushJob = {
    installationId,
    owner: installation.accountLogin,
    repo,
    branch,
    before,
    after,
    receivedAt: deps.now().toISOString(),
  };
  await deps.queue.enqueue(RECORD_PRODUCTION_PUSH_JOB, job, {
    singletonKey: `production-push:${installationId}:${repo}:${branch}:${after}`,
  });
}

export async function recordProductionPush(
  deps: WorkerDeps,
  job: RecordProductionPushJob,
): Promise<number> {
  const installation = await getInstallation(deps.db, job.installationId);
  if (!installation || installation.accountLogin.toLowerCase() !== job.owner.toLowerCase()) {
    return 0;
  }
  const { githubProduction: github } = deps;
  const octokit = await deps.github.installationOctokit(job.installationId);
  const { shas, truncated } = await github.compareCommitShas(
    octokit,
    job.owner,
    job.repo,
    job.before,
    job.after,
  );
  if (truncated) {
    logError('production push compare truncated', new Error('compare truncated'), {
      repo: job.repo,
      branch: job.branch,
    });
  }
  const found = new Map(
    (await github.mergedPullRequestsForCommits(octokit, job.owner, job.repo, shas)).map((pr) => [
      pr.number,
      pr,
    ]),
  );
  for (const pr of [...found.values()].filter((p) => p.baseRef === job.branch)) {
    const inner = await github.listPullRequestCommitShas(octokit, job.owner, job.repo, pr.number);
    if (inner.truncated) {
      logError('production push pull request commits truncated', new Error('commits truncated'), {
        repo: job.repo,
        branch: job.branch,
      });
    }
    for (const nested of await github.mergedPullRequestsForCommits(
      octokit,
      job.owner,
      job.repo,
      inner.shas,
    )) {
      if (!found.has(nested.number)) found.set(nested.number, nested);
    }
  }
  return recordProductionPullRequests(
    deps.db,
    job.installationId,
    [...found.values()].map((pr) => ({
      repository: job.repo,
      number: pr.number,
      url: pr.url,
      authorLogin: pr.author,
      branch: job.branch,
      isRevert: pr.title.startsWith('Revert "'),
      reachedAt: new Date(job.receivedAt),
    })),
  );
}
