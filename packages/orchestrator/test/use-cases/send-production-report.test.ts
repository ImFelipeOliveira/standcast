import { describe, expect, test } from 'bun:test';
import {
  ChatDeliveryError,
  parseConfig,
  type StandcastConfig,
  type TextModel,
  TextModelError,
} from '@standcast/core';
import {
  claimDelivery,
  getDelivery,
  getLlmSettings,
  getProductionReport,
  getTeamReport,
  markDeliverySent,
  recordProductionPullRequests,
  saveProductionReport,
  upsertLlmSettings,
  upsertTeamReport,
} from '@standcast/db';
import type { PullRequestText } from '@standcast/github';
import { db, useCleanDb } from '../../../db/test/setup';
import {
  enqueueProductionReportsIfDue,
  nullTracker,
  POST_REPORT_ITEM_JOB,
  type PostReportItemJob,
  postReportItem,
  REPLY_SPACING_MS,
  runTick,
  SEND_PRODUCTION_REPORT_JOB,
  sendProductionReport,
  WINDOW_SETTLE_MS,
} from '../../src';
import { config, type FakeOptions, fakeChat, fakeDeps, INST, linkSpace, seedOrg } from './fakes';

useCleanDb();

const DATE = '2026-11-27';
const NOW = new Date('2026-11-27T12:05:00.000Z');
const SETTLED = new Date(NOW.getTime() - WINDOW_SETTLE_MS);
const CUTOFF = new Date('2026-11-20T12:00:00.000Z');
const INSIDE = '2026-11-23T12:00:00.000Z';
const job = { installationId: INST, teamName: 'Alpha', date: DATE };
const reportKey = { ...job, kind: 'production_report' as const };

const pr = (number: number, title: string, over: Partial<PullRequestText> = {}) => ({
  number,
  url: `https://github.com/acme/api/pull/${number}`,
  title,
  body: '',
  labels: [],
  headRef: `branch-${number}`,
  ...over,
});

type Pull = {
  text: PullRequestText;
  author?: string;
  branch?: string;
  reachedAt?: string;
  recordedAt?: string;
};

const record = (pulls: Pull[]) =>
  recordProductionPullRequests(
    db,
    INST,
    pulls.map((p) => ({
      repository: 'api',
      number: p.text.number,
      url: p.text.url,
      authorLogin: p.author ?? 'alice',
      branch: p.branch ?? 'main',
      reachedAt: new Date(p.reachedAt ?? INSIDE),
      recordedAt: new Date(p.recordedAt ?? p.reachedAt ?? INSIDE),
    })),
  );

const enableReport = (over: { enabled?: boolean; teamName?: string; channel?: string } = {}) =>
  upsertTeamReport(
    db,
    {
      installationId: INST,
      teamName: over.teamName ?? 'Alpha',
      enabled: over.enabled ?? true,
      channel: over.channel ?? '#reports',
      weekday: 'fri',
      time: '09:00',
      productionBranch: 'main',
    },
    CUTOFF,
  );

function rewriter(
  answer: (user: string) => string | Promise<string> = () => '{"kind":"new","title":"Rewritten"}',
) {
  const calls: string[] = [];
  const textModel: TextModel = {
    completeJson: async ({ user }) => {
      calls.push(user);
      return answer(user);
    },
  };
  return { calls, textModel };
}

async function setup(pulls: Pull[], opts: FakeOptions & { cfg?: StandcastConfig } = {}) {
  await seedOrg(opts.cfg ?? config());
  await enableReport();
  await record(pulls);
  const texts = new Map(pulls.map((p) => [p.text.number, p.text]));
  const fake = fakeDeps({
    production: { getPullRequestText: async (_o, _owner, _repo, n) => texts.get(n) ?? null },
    ...opts,
  });
  const chat = fakeChat();
  fake.deps.chatFor = async () => chat.chat;
  fake.setNow(NOW);
  return { ...fake, ...chat };
}

const storedItems = async () => (await getProductionReport(db, INST, 'Alpha', DATE))?.items ?? [];

const replyJobs = (queue: { enqueued: { name: string; data: object; startAfter?: Date }[] }) =>
  queue.enqueued
    .filter((j) => j.name === POST_REPORT_ITEM_JOB)
    .map((j) => ({ data: j.data as PostReportItemJob, startAfter: j.startAfter }));

describe('enqueueProductionReportsIfDue', () => {
  test('tick enqueues once when weekday and time are due in the team time zone', async () => {
    const { deps, queue, setNow } = await setup([]);
    const reportJobs = () => queue.enqueued.filter((j) => j.name === SEND_PRODUCTION_REPORT_JOB);
    setNow(new Date('2026-11-27T09:05:00.000Z'));
    await runTick(deps);
    expect(reportJobs()).toEqual([]);
    setNow(new Date('2026-11-26T12:05:00.000Z'));
    await runTick(deps);
    expect(reportJobs()).toEqual([]);
    setNow(NOW);
    await runTick(deps);
    await runTick(deps);
    expect(reportJobs()).toEqual([{ name: SEND_PRODUCTION_REPORT_JOB, data: job }]);
  });

  test('tick skips a disabled report, a report whose team left standcast.yml, and a sent delivery', async () => {
    await seedOrg(config());
    await enableReport({ enabled: false });
    await enableReport({ teamName: 'Gone' });
    const disabled = fakeDeps();
    await enqueueProductionReportsIfDue(disabled.deps, { id: INST, config: config() }, NOW);
    expect(disabled.queue.enqueued).toEqual([]);

    await enableReport();
    await markDeliverySent(db, reportKey);
    const sent = fakeDeps();
    await enqueueProductionReportsIfDue(sent.deps, { id: INST, config: config() }, NOW);
    expect(sent.queue.enqueued).toEqual([]);
  });
});

describe('sendProductionReport', () => {
  test('only pull requests of team members on the team branch inside the window are reported', async () => {
    const { deps } = await setup([
      { text: pr(1, 'feat: member on main') },
      { text: pr(2, 'feat: outsider'), author: 'carol' },
      { text: pr(3, 'feat: other branch'), branch: 'release' },
      { text: pr(4, 'feat: before the window'), reachedAt: '2026-11-19T12:00:00.000Z' },
      { text: pr(5, 'feat: after the window'), reachedAt: '2026-11-27T12:06:00.000Z' },
      { text: pr(8, 'feat: still settling'), reachedAt: '2026-11-27T12:04:30.000Z' },
      { text: pr(6, 'feat: member in another case'), author: 'Bob' },
      { text: pr(7, 'feat: gone from GitHub') },
    ]);
    const found = deps.githubProduction.getPullRequestText;
    deps.githubProduction.getPullRequestText = async (o, owner, repo, n) =>
      n === 7 ? null : found(o, owner, repo, n);
    await sendProductionReport(deps, job);
    const items = await storedItems();
    expect(items.map((i) => i.links.map((l) => l.label))).toEqual([['api#1'], ['api#6']]);
  });

  test('internal titles and bots are left out before the model is called', async () => {
    const model = rewriter();
    const { deps } = await setup(
      [
        { text: pr(1, 'feat: export') },
        { text: pr(2, 'chore: bump deps') },
        { text: pr(3, 'Update dependency x'), author: 'renovate[bot]' },
      ],
      { cfg: config('[alice, bob, "renovate[bot]"]'), textModel: model.textModel },
    );
    await sendProductionReport(deps, job);
    expect(model.calls).toHaveLength(1);
    expect((await storedItems()).map((i) => i.title)).toEqual(['Rewritten']);
  });

  test('pull requests that share a card become one item with both links', async () => {
    const { deps } = await setup([
      { text: pr(1, 'feat: export', { headRef: 'feat/eng-12-export' }) },
      { text: pr(2, 'feat: export filters', { body: 'Closes ENG-12' }) },
      { text: pr(3, 'feat: unrelated') },
    ]);
    const lookups: string[] = [];
    deps.trackerFor = async () => ({
      ...nullTracker,
      cardText: async (identifier) => {
        lookups.push(identifier);
        return identifier === 'ENG-12'
          ? {
              identifier: 'ENG-12',
              url: 'https://linear.app/acme/issue/ENG-12/export',
              title: 'Export',
              description: '',
              labels: [],
            }
          : null;
      },
    });
    await sendProductionReport(deps, job);
    const items = await storedItems();
    expect(items.map((i) => i.links.map((l) => l.label))).toEqual([
      ['api#1', 'api#2', 'ENG-12'],
      ['api#3'],
    ]);
    expect(lookups.filter((id) => id === 'ENG-12')).toHaveLength(1);
  });

  test('a feature and its revert in the same window both disappear', async () => {
    const { deps } = await setup([
      { text: pr(1, 'feat: export') },
      { text: pr(2, 'Revert "feat: export"', { body: 'Reverts acme/api#1' }) },
      { text: pr(3, 'feat: import') },
    ]);
    await sendProductionReport(deps, job);
    expect((await storedItems()).map((i) => i.title)).toEqual(['import']);
  });

  test('a revert of an item reported in an earlier report becomes Removed with the stored title', async () => {
    const { deps } = await setup([
      { text: pr(10, 'Revert "feat: export"', { body: 'Reverts acme/api#9' }) },
      { text: pr(11, 'feat: import'), reachedAt: '2026-11-24T12:00:00.000Z' },
    ]);
    await saveProductionReport(db, INST, {
      teamName: 'Alpha',
      date: '2026-11-20',
      windowStart: new Date('2026-11-13T12:00:00.000Z'),
      windowEnd: CUTOFF,
      items: [
        {
          kind: 'new',
          title: 'Export to CSV',
          liveSince: '2026-11-18T12:00:00.000Z',
          links: [{ label: 'api#9', url: 'https://github.com/acme/api/pull/9' }],
        },
      ],
    });
    await sendProductionReport(deps, job);
    expect(await storedItems()).toEqual([
      {
        kind: 'new',
        title: 'import',
        liveSince: '2026-11-24T12:00:00.000Z',
        links: [{ label: 'api#11', url: 'https://github.com/acme/api/pull/11' }],
      },
      {
        kind: 'removed',
        title: 'Export to CSV',
        liveSince: INSIDE,
        links: [{ label: 'api#10', url: 'https://github.com/acme/api/pull/10' }],
      },
    ]);
  });

  test('a revert of a revert in the same window removes nothing and both reverts drop', async () => {
    const { deps } = await setup([
      { text: pr(10, 'Revert "feat: export"', { body: 'Reverts acme/api#9' }) },
      { text: pr(11, 'Revert "Revert "feat: export""', { body: 'Reverts acme/api#10' }) },
      { text: pr(12, 'feat: import') },
    ]);
    await saveProductionReport(db, INST, {
      teamName: 'Alpha',
      date: '2026-11-20',
      windowStart: new Date('2026-11-13T12:00:00.000Z'),
      windowEnd: CUTOFF,
      items: [
        {
          kind: 'new',
          title: 'Export to CSV',
          liveSince: '2026-11-18T12:00:00.000Z',
          links: [{ label: 'api#9', url: 'https://github.com/acme/api/pull/9' }],
        },
      ],
    });
    await sendProductionReport(deps, job);
    expect((await storedItems()).map((i) => [i.kind, i.title])).toEqual([['new', 'import']]);
  });

  test('a pull request recorded after the window end with an old reached_at goes in the next report', async () => {
    const { deps, setNow } = await setup([{ text: pr(1, 'feat: export') }]);
    await sendProductionReport(deps, job);
    await record([{ text: pr(2, 'feat: import'), recordedAt: NOW.toISOString() }]);
    deps.githubProduction.getPullRequestText = async (_o, _owner, _repo, n) =>
      pr(n, n === 1 ? 'feat: export' : 'feat: import');
    const next = { ...job, date: '2026-12-04' };
    setNow(new Date('2026-12-04T12:05:00.000Z'));
    await sendProductionReport(deps, next);
    const nextItems = (await getProductionReport(db, INST, 'Alpha', next.date))?.items ?? [];
    expect(nextItems.map((i) => [i.title, i.liveSince])).toEqual([['import', INSIDE]]);
    expect((await storedItems()).map((i) => i.title)).toEqual(['export']);
  });

  test('a revert of something never reported is dropped', async () => {
    const { deps, posted } = await setup([
      { text: pr(10, 'Revert "feat: export"', { body: 'Reverts acme/api#99' }) },
    ]);
    await sendProductionReport(deps, job);
    expect(await storedItems()).toEqual([]);
    expect(posted).toEqual([]);
  });

  test('main message posted once, then one reply job per item with spaced startAfter and the chunk thread', async () => {
    const { deps, queue, posted } = await setup([
      { text: pr(1, 'feat: export') },
      { text: pr(2, 'fix: import crash') },
    ]);
    await sendProductionReport(deps, job);
    await sendProductionReport(deps, job);
    expect(posted).toHaveLength(1);
    expect(posted[0]?.channel).toBe('#reports');
    expect(posted[0]?.msg.fallbackText).toContain('Live in production · Alpha');
    const jobs = replyJobs(queue);
    expect(jobs.map((j) => j.data.index)).toEqual([0, 1]);
    expect(jobs.map((j) => j.data.thread)).toEqual([
      { channel: 'C1', id: '1.0' },
      { channel: 'C1', id: '1.0' },
    ]);
    expect(jobs[0]?.startAfter?.getTime()).toBe(NOW.getTime());
    expect((jobs[1]?.startAfter?.getTime() ?? 0) - (jobs[0]?.startAfter?.getTime() ?? 0)).toBe(
      REPLY_SPACING_MS,
    );
    expect((await getDelivery(db, reportKey))?.ref).toEqual({ channel: 'C1', id: '1.0' });
  });

  test('cutoff moves to the window end once every chunk is posted', async () => {
    const { deps, queue, posted, hooks, failWith, setNow } = await setup([
      { text: pr(1, `feat: ${'a'.repeat(1500)}`) },
      { text: pr(2, `feat: ${'b'.repeat(1500)}`) },
    ]);
    hooks.afterSend = async () => {
      failWith(new ChatDeliveryError('ratelimited', 'slow down'));
    };
    await expect(sendProductionReport(deps, job)).rejects.toBeInstanceOf(ChatDeliveryError);
    expect(posted).toHaveLength(1);
    expect((await getTeamReport(db, INST, 'Alpha'))?.cutoffAt).toEqual(CUTOFF);
    expect(replyJobs(queue)).toEqual([]);

    hooks.afterSend = undefined;
    failWith(null);
    setNow(new Date(NOW.getTime() + 60_000));
    await sendProductionReport(deps, job);
    expect(posted).toHaveLength(2);
    expect((await getTeamReport(db, INST, 'Alpha'))?.cutoffAt).toEqual(SETTLED);
    expect(replyJobs(queue).map((j) => [j.data.index, j.data.thread])).toEqual([
      [0, { channel: 'C1', id: '1.0' }],
      [1, { channel: 'C1', id: '2.0' }],
    ]);
  });

  test('empty window posts nothing, completes the delivery and moves the cutoff', async () => {
    const { deps, posted } = await setup([]);
    await sendProductionReport(deps, job);
    expect(posted).toEqual([]);
    expect((await getDelivery(db, reportKey))?.status).toBe('sent');
    expect((await getTeamReport(db, INST, 'Alpha'))?.cutoffAt).toEqual(SETTLED);
  });

  test('a retry reuses the stored report and does not repost a chunk already sent', async () => {
    let title = 'First';
    const model = rewriter(() => `{"kind":"new","title":"${title} ${'x'.repeat(110)}"}`);
    const pulls = Array.from({ length: 30 }, (_, i) => ({ text: pr(i + 1, `feat: item ${i}`) }));
    const { deps, posted, hooks, failWith } = await setup(pulls, { textModel: model.textModel });
    hooks.afterSend = async () => {
      failWith(new ChatDeliveryError('ratelimited', 'slow down'));
    };
    await expect(sendProductionReport(deps, job)).rejects.toBeInstanceOf(ChatDeliveryError);
    const calls = model.calls.length;
    expect(calls).toBe(30);

    title = 'Second';
    hooks.afterSend = undefined;
    failWith(null);
    await sendProductionReport(deps, job);
    expect(model.calls).toHaveLength(calls);
    expect(posted).toHaveLength(2);
    expect(posted[1]?.msg.fallbackText).toContain('First');
    expect(posted[1]?.msg.fallbackText).not.toContain('Second');
  });

  test('rejected key marks the settings rejected and the report still goes out raw', async () => {
    const model = rewriter(() => {
      throw new TextModelError('rejected_key', 'bad key');
    });
    const { deps, posted } = await setup(
      [{ text: pr(1, 'feat: export') }, { text: pr(2, 'feat: import') }],
      { textModel: model.textModel },
    );
    await upsertLlmSettings(
      db,
      { installationId: INST, provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-test' },
      deps.encryptionKey,
    );
    await sendProductionReport(deps, job);
    expect((await getLlmSettings(db, INST))?.rejectedAt).toEqual(NOW);
    expect((await storedItems()).map((i) => i.title)).toEqual(['export', 'import']);
    expect(posted).toHaveLength(1);
  });

  test('a GitHub failure on one pull request degrades it to a raw link', async () => {
    const model = rewriter();
    const { deps } = await setup(
      [{ text: pr(1, 'feat: export') }, { text: pr(2, 'feat: import') }],
      {
        textModel: model.textModel,
      },
    );
    const found = deps.githubProduction.getPullRequestText;
    deps.githubProduction.getPullRequestText = async (o, owner, repo, n) => {
      if (n === 2) throw new Error('github down');
      return found(o, owner, repo, n);
    };
    await sendProductionReport(deps, job);
    expect(model.calls).toHaveLength(1);
    expect((await storedItems()).map((i) => i.title)).toEqual(['Rewritten', 'api#2']);
  });

  test('no chat connection or unlinked Google Chat space fails the delivery without posting', async () => {
    const { deps, posted } = await setup([{ text: pr(1, 'feat: export') }]);
    deps.chatFor = async () => null;
    await sendProductionReport(deps, job);
    expect(posted).toEqual([]);
    expect(await getDelivery(db, reportKey)).toMatchObject({
      status: 'failed',
      error: 'no_chat_connection',
    });

    const parsed = parseConfig(`
teams:
  - name: Alpha
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [alice]
    members: [alice, bob]
    chat: { provider: google-chat, channel: spaces/TEAM }
`);
    if (!parsed.ok) throw new Error('bad config');
    await seedOrg(parsed.config);
    await enableReport({ channel: 'spaces/REPORTS' });
    await linkSpace('spaces/TEAM');
    const google = fakeChat();
    deps.chatFor = async () => google.chat;
    await sendProductionReport(deps, job);
    expect(google.posted).toEqual([]);
    const row = await getDelivery(db, reportKey);
    expect(row?.status).toBe('failed');
    expect(row?.error?.startsWith('space_not_linked')).toBe(true);
  });
});

describe('postReportItem', () => {
  test('reply job posts the stored item in the thread and a retry posts the same text', async () => {
    let fields = '"whatChanges":"Export to CSV from the list"';
    const model = rewriter(() => `{"kind":"new","title":"Export",${fields}}`);
    const { deps, queue, replies, failWith } = await setup([{ text: pr(1, 'feat: export') }], {
      textModel: model.textModel,
    });
    await sendProductionReport(deps, job);
    const [reply] = replyJobs(queue);
    if (!reply) throw new Error('no reply job');
    fields = '"whatChanges":"Something else"';

    failWith(new ChatDeliveryError('ratelimited', 'slow down'));
    await expect(postReportItem(deps, reply.data)).rejects.toBeInstanceOf(ChatDeliveryError);
    failWith(null);
    await postReportItem(deps, reply.data);
    await postReportItem(deps, reply.data);

    expect(replies).toHaveLength(1);
    expect(replies[0]?.ref).toEqual({ channel: 'C1', id: '1.0' });
    const text = replies[0]?.msg.fallbackText ?? '';
    expect(text).toContain('New · Export');
    expect(text).toContain('What changes: Export to CSV from the list');
    expect(text).toContain('https://github.com/acme/api/pull/1');
    const key = { ...job, kind: 'production_report_item' as const, subject: '0' };
    expect((await getDelivery(db, key))?.status).toBe('sent');
  });

  test('a reply whose delivery is in progress elsewhere throws so the job is retried', async () => {
    const { deps, queue, replies } = await setup([{ text: pr(1, 'feat: export') }]);
    await sendProductionReport(deps, job);
    const [reply] = replyJobs(queue);
    if (!reply) throw new Error('no reply job');
    await claimDelivery(db, { ...job, kind: 'production_report_item', subject: '0' });
    await expect(postReportItem(deps, reply.data)).rejects.toThrow(
      'production_report_item_in_progress',
    );
    expect(replies).toEqual([]);
  });

  test('no message contains an author login', async () => {
    const model = rewriter((user) => {
      if (user.includes('import')) throw new TextModelError('timeout', 'slow');
      return '{"kind":"new","title":"Export by @alice","whatChanges":"Thanks @alice and (@bob) for it"}';
    });
    const { deps, queue, posted, replies } = await setup(
      [
        { text: pr(1, 'feat: export', { body: 'by alice' }) },
        { text: pr(2, 'fix: import crash, thanks @bob'), author: 'bob' },
      ],
      { textModel: model.textModel },
    );
    await sendProductionReport(deps, job);
    for (const reply of replyJobs(queue)) await postReportItem(deps, reply.data);
    expect(replies).toHaveLength(2);
    const allPostedText = JSON.stringify([...posted, ...replies]);
    expect(allPostedText).not.toContain('alice');
    expect(allPostedText).not.toContain('bob');
  });
});
