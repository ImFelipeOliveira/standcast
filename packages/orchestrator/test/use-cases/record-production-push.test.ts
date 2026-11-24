import { describe, expect, spyOn, test } from 'bun:test';
import { listProductionPullRequests, upsertTeamReport } from '@standcast/db';
import { db, useCleanDb } from '../../../db/test/setup';
import { handleGitHubEvent, recordProductionPush } from '../../src';
import { fakeDeps, seedOrg } from './fakes';

const INST = 21;
const NOW = new Date('2026-11-24T12:00:00.000Z');

const pushTo = (ref: string, over: Record<string, unknown> = {}) => ({
  ref,
  before: 'b',
  after: 'a',
  repository: { name: 'api', default_branch: 'main', owner: { login: 'acme' } },
  installation: { id: INST },
  commits: [{ added: [], modified: ['src/x.ts'], removed: [] }],
  ...over,
});

const enableReport = (productionBranch = 'main', teamName = 'Sales') =>
  upsertTeamReport(
    db,
    {
      installationId: INST,
      teamName,
      enabled: true,
      channel: '#sales',
      weekday: 'fri',
      time: '09:00',
      productionBranch,
    },
    NOW,
  );

const pr = (number: number, baseRef: string, headRef: string) => ({
  number,
  url: `https://github.com/acme/api/pull/${number}`,
  title: `PR ${number}`,
  author: 'dev',
  baseRef,
  headRef,
  mergedAt: '2026-11-24T10:00:00Z',
});

const job = {
  installationId: INST,
  owner: 'acme',
  repo: 'api',
  branch: 'main',
  before: 'b',
  after: 'a',
  receivedAt: '2026-11-24T12:00:00.000Z',
};

useCleanDb();

describe('enqueueProductionPush', () => {
  test('push to an enabled production branch of any repo enqueues one job keyed by after', async () => {
    await seedOrg(undefined, { id: INST });
    await enableReport();
    const { deps, queue } = fakeDeps({});
    await handleGitHubEvent(deps, 'push', pushTo('refs/heads/main'));
    expect(queue.enqueued).toContainEqual(
      expect.objectContaining({
        name: 'record-production-push',
        data: expect.objectContaining({
          repo: 'api',
          branch: 'main',
          before: 'b',
          after: 'a',
          receivedAt: deps.now().toISOString(),
        }),
      }),
    );
    await handleGitHubEvent(deps, 'push', pushTo('refs/heads/main'));
    expect(queue.enqueued.filter((j) => j.name === 'record-production-push')).toHaveLength(1);
  });

  test('push to another branch, a created or deleted branch, or with no enabled report enqueues nothing', async () => {
    await seedOrg(undefined, { id: INST });
    const { deps, queue } = fakeDeps({});
    await handleGitHubEvent(deps, 'push', pushTo('refs/heads/main'));
    await enableReport();
    await handleGitHubEvent(deps, 'push', pushTo('refs/heads/dev'));
    await handleGitHubEvent(deps, 'push', pushTo('refs/heads/main', { created: true }));
    await handleGitHubEvent(deps, 'push', pushTo('refs/heads/main', { deleted: true }));
    await handleGitHubEvent(deps, 'push', pushTo('refs/heads/main', { before: '0'.repeat(40) }));
    await handleGitHubEvent(deps, 'push', pushTo('refs/tags/v1'));
    expect(queue.enqueued.filter((j) => j.name === 'record-production-push')).toEqual([]);
  });

  test('the same commit pushed to two production branches enqueues one job per branch', async () => {
    await seedOrg(undefined, { id: INST });
    await enableReport('main');
    await enableReport('release', 'Support');
    const { deps, queue } = fakeDeps({});
    await handleGitHubEvent(deps, 'push', pushTo('refs/heads/main'));
    await handleGitHubEvent(deps, 'push', pushTo('refs/heads/release'));
    const jobs = queue.enqueued.filter((j) => j.name === 'record-production-push');
    expect(jobs.map((j) => (j.data as { branch: string }).branch)).toEqual(['main', 'release']);
  });

  test('a push to the config repository enqueues nothing', async () => {
    await seedOrg(undefined, { id: INST });
    await enableReport();
    const { deps, queue } = fakeDeps({});
    const repository = { name: '.github', default_branch: 'main', owner: { login: 'acme' } };
    await handleGitHubEvent(deps, 'push', pushTo('refs/heads/main', { repository }));
    expect(queue.enqueued.filter((j) => j.name === 'record-production-push')).toEqual([]);
  });
});

describe('recordProductionPush', () => {
  const stored = async () =>
    listProductionPullRequests(db, {
      installationId: INST,
      branch: 'main',
      after: new Date(0),
      upTo: new Date(Date.now() + 86_400_000),
    });

  test('records merged pull requests found from compared commits with reached_at = receivedAt', async () => {
    await seedOrg(undefined, { id: INST });
    const { deps } = fakeDeps({
      production: {
        compareCommitShas: async () => ({ shas: ['c1'], truncated: false }),
        mergedPullRequestsForCommits: async () => [pr(7, 'main', 'feat')],
      },
    });
    expect(await recordProductionPush(deps, job)).toBe(1);
    const rows = await stored();
    expect(rows.map((r) => r.number)).toEqual([7]);
    expect(rows[0]?.reachedAt).toEqual(new Date(job.receivedAt));
    expect(rows[0]?.repository).toBe('api');
  });

  test('a pull request whose title starts with Revert " is recorded as a revert', async () => {
    await seedOrg(undefined, { id: INST });
    const { deps } = fakeDeps({
      production: {
        compareCommitShas: async () => ({ shas: ['c1'], truncated: false }),
        mergedPullRequestsForCommits: async () => [
          pr(7, 'main', 'feat'),
          { ...pr(8, 'main', 'revert-7'), title: 'Revert "PR 7"' },
          { ...pr(9, 'main', 'docs'), title: 'Docs: Revert "x" explained' },
        ],
      },
    });
    await recordProductionPush(deps, job);
    expect((await stored()).map((r) => [r.number, r.isRevert])).toEqual([
      [7, false],
      [8, true],
      [9, false],
    ]);
  });

  test('a pull request merged into the production branch is expanded one level (squash release)', async () => {
    await seedOrg(undefined, { id: INST });
    const { deps } = fakeDeps({
      production: {
        compareCommitShas: async () => ({ shas: ['sq'], truncated: false }),
        mergedPullRequestsForCommits: async (_o, _ow, _r, shas) => {
          if (shas.includes('sq')) return [pr(50, 'main', 'dev')];
          return shas.flatMap((s) => (s === 'c1' ? [pr(41, 'dev', 'f1')] : [pr(42, 'dev', 'f2')]));
        },
        listPullRequestCommitShas: async () => ({ shas: ['c1', 'c2'], truncated: false }),
      },
    });
    await recordProductionPush(deps, job);
    expect((await stored()).map((r) => r.number).sort()).toEqual([41, 42, 50]);
  });

  test('a squash release with more commits than the cap is logged', async () => {
    await seedOrg(undefined, { id: INST });
    const { deps } = fakeDeps({
      production: {
        compareCommitShas: async () => ({ shas: ['sq'], truncated: false }),
        mergedPullRequestsForCommits: async (_o, _ow, _r, shas) =>
          shas.includes('sq') ? [pr(50, 'main', 'dev')] : [],
        listPullRequestCommitShas: async () => ({ shas: ['c1'], truncated: true }),
      },
    });
    const logged: unknown[][] = [];
    const spy = spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logged.push(args);
    });
    try {
      await recordProductionPush(deps, job);
    } finally {
      spy.mockRestore();
    }
    expect(logged.map((args) => args[0])).toEqual([
      'production push pull request commits truncated',
    ]);
  });

  test('compare fallback still records the head commit pull request', async () => {
    await seedOrg(undefined, { id: INST });
    const { deps } = fakeDeps({
      production: {
        compareCommitShas: async () => ({ shas: ['a'], truncated: true }),
        mergedPullRequestsForCommits: async () => [pr(9, 'main', 'feat')],
      },
    });
    expect(await recordProductionPush(deps, job)).toBe(1);
  });

  test('ignores an unknown installation or owner mismatch', async () => {
    await seedOrg(undefined, { id: INST });
    const { deps } = fakeDeps({
      production: {
        compareCommitShas: async () => ({ shas: ['a'], truncated: false }),
        mergedPullRequestsForCommits: async () => [pr(9, 'main', 'feat')],
      },
    });
    expect(await recordProductionPush(deps, { ...job, owner: 'other' })).toBe(0);
  });
});
