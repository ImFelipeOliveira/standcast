import { describe, expect, spyOn, test } from 'bun:test';
import {
  type ActivityItem,
  clampTitle,
  DailySubmissionSchema,
  type Item,
  type PendingItem,
  type PullRequestTarget,
  parseConfig,
  TITLE_MAX,
} from '@standcast/core';
import {
  decideSuggestion,
  listPendingSuggestions,
  saveConnection,
  setIdentity,
  setMemberInstallations,
  syncSuggestions,
  upsertDaily,
} from '@standcast/db';
import { GitHubRateLimitError } from '@standcast/github';
import { LinearAuthError, LinearRateLimitError } from '@standcast/linear';
import { db, useCleanDb } from '../../../db/test/setup';
import {
  createMembershipCheck,
  type DraftWarningSource,
  getDraft,
  nullTracker,
  type ProjectTracker,
  submitDaily,
  warningCode,
} from '../../src';
import { config, daily, fakeDeps, INST, seedMember, seedOrg } from './fakes';

useCleanDb();

async function setup(cfg = config()) {
  await seedOrg(cfg);
  const member = await seedMember();
  await setMemberInstallations(db, member.id, [INST]);
  const fake = fakeDeps();
  return { ...fake, member, isMember: createMembershipCheck(fake.deps) };
}

const KEY = new Uint8Array(32).fill(7);

function trackerConfig() {
  const parsed = parseConfig(`
teams:
  - name: Alpha
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [alice]
    members: [alice, bob]
    chat: { provider: slack, channel: "#alpha" }
    tracker: { provider: linear, team: ENG }
`);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.config;
}

async function connectLinear() {
  await saveConnection(
    db,
    INST,
    'linear',
    'org-1',
    JSON.stringify({ accessToken: 'lin_at_1', refreshToken: null, expiresAt: null }),
    KEY,
    'Acme',
    'acme',
  );
}

const pr = (n: number, at: string): ActivityItem => ({
  kind: 'pr_opened',
  title: `PR ${n}`,
  url: `https://github.com/acme/api/pull/${n}`,
  repo: 'acme/api',
  at: new Date(at),
});

const node = (n: number, extra: Record<string, unknown>) => ({
  id: `i${n}`,
  identifier: `ENG-${n}`,
  url: `https://linear.app/acme/issue/ENG-${n}/card`,
  title: `Card ${n}`,
  startedAt: null,
  completedAt: null,
  ...extra,
});

async function setupCards() {
  const ctx = await setup(trackerConfig());
  await connectLinear();
  await setIdentity(db, INST, ctx.member.id, 'linear', 'u1');
  return ctx;
}

describe('getDraft with linear cards', () => {
  test('merges cards with pull requests newest first', async () => {
    const { deps, isMember, member, linear } = await setupCards();
    deps.github.listActivity = async () => [
      pr(1, '2026-10-27T15:00:00Z'),
      pr(2, '2026-10-27T11:00:00Z'),
    ];
    linear.state.activity = [
      node(1, { startedAt: '2026-10-27T13:00:00Z' }),
      node(2, { completedAt: '2026-10-27T17:00:00Z', startedAt: '2026-10-27T09:00:00Z' }),
    ];
    const draft = await getDraft(deps, isMember, member, 'acme');
    expect(draft.activity.map((a) => [a.kind, a.title])).toEqual([
      ['card_done', 'Card 2'],
      ['pr_opened', 'PR 1'],
      ['card_started', 'Card 1'],
      ['pr_opened', 'PR 2'],
    ]);
    expect(linear.calls.queries[0]?.variables.teamKey).toBe('ENG');
    expect(linear.calls.queries[0]?.variables.since).toBe('2026-10-27T03:00:00.000Z');
  });

  test('card titles are clamped', async () => {
    const { deps, isMember, member, linear } = await setupCards();
    const raw = `Fix\tthe ${'x'.repeat(300)}`;
    linear.state.activity = [node(1, { startedAt: '2026-10-27T13:00:00Z', title: raw })];
    const draft = await getDraft(deps, isMember, member, 'acme');
    expect(draft.activity[0]?.title).toBe(clampTitle(raw));
  });

  test('a person without a linear identity gets no linear call', async () => {
    const { deps, isMember, member, linear } = await setup(trackerConfig());
    await connectLinear();
    const draft = await getDraft(deps, isMember, member, 'acme');
    expect(draft.activity).toEqual([]);
    expect(linear.calls.queries).toEqual([]);
  });

  test('without a connection there is no linear call', async () => {
    const { deps, isMember, member, linear } = await setup(trackerConfig());
    await setIdentity(db, INST, member.id, 'linear', 'u1');
    const draft = await getDraft(deps, isMember, member, 'acme');
    expect(draft.activity).toEqual([]);
    expect(linear.calls.bearer).toEqual([]);
  });

  test('a tracker error leaves the draft without cards', async () => {
    const { deps, isMember, member, linear } = await setupCards();
    deps.github.listActivity = async () => [pr(1, '2026-10-27T15:00:00Z')];
    linear.state.graphqlStatus = 500;
    const spy = spyOn(console, 'error').mockImplementation(() => {});
    const draft = await getDraft(deps, isMember, member, 'acme');
    spy.mockRestore();
    expect(draft.activity.map((a) => a.title)).toEqual(['PR 1']);
  });

  test('the 50 item cap applies across both sources', async () => {
    const { deps, isMember, member, linear } = await setupCards();
    deps.github.listActivity = async () =>
      Array.from({ length: 40 }, (_, i) =>
        pr(i, new Date(Date.UTC(2026, 9, 27, 4, i)).toISOString()),
      );
    linear.state.activity = Array.from({ length: 20 }, (_, i) =>
      node(i, { startedAt: new Date(Date.UTC(2026, 9, 27, 6, i)).toISOString() }),
    );
    const draft = await getDraft(deps, isMember, member, 'acme');
    expect(draft.activity).toHaveLength(50);
    expect(draft.activity.filter((a) => a.kind === 'card_started')).toHaveLength(20);
    expect(draft.activity.filter((a) => a.kind === 'pr_opened')).toHaveLength(30);
  });
});

describe('getDraft concurrency', () => {
  test('github and linear calls start before either resolves', async () => {
    const { deps, isMember, member } = await setupCards();
    const started: string[] = [];
    let releaseGithub: (items: ActivityItem[]) => void = () => {};
    deps.github.listActivity = () => {
      started.push('github');
      return new Promise<ActivityItem[]>((resolve) => {
        releaseGithub = resolve;
      });
    };
    let releaseCards: (items: ActivityItem[]) => void = () => {};
    deps.trackerFor = async () => ({
      ...nullTracker,
      connected: true,
      listActivity: () => {
        started.push('linear');
        return new Promise<ActivityItem[]>((resolve) => {
          releaseCards = resolve;
        });
      },
    });
    const draft = getDraft(deps, isMember, member, 'acme');
    for (let i = 0; i < 100 && started.length < 2; i++) await new Promise((r) => setTimeout(r, 5));
    expect(started.sort()).toEqual(['github', 'linear']);
    releaseGithub([pr(1, '2026-10-27T15:00:00Z')]);
    releaseCards([]);
    expect((await draft).activity.map((a) => a.title)).toEqual(['PR 1']);
  });
});

describe('getDraft', () => {
  test('since window starts at the previous workday', async () => {
    const { deps, isMember, member, calls } = await setup();
    const draft = await getDraft(deps, isMember, member, 'acme');
    expect(draft).toEqual({
      org: 'acme',
      date: '2026-10-28',
      since: '2026-10-27T03:00:00.000Z',
      teams: ['Alpha'],
      activity: [],
      suggestions: [],
      plan: null,
      pending: { items: [], truncated: false },
      warnings: [],
    });
    expect(calls.activity[0]?.toISOString()).toBe('2026-10-27T03:00:00.000Z');
  });

  test('renamed member lists activity with the new login on the first request', async () => {
    const { deps, isMember, member, calls, users, orgMembers } = await setup(
      config('[alice-new, bob]'),
    );
    users.set(1, 'alice-new');
    orgMembers.add('alice-new');
    const draft = await getDraft(deps, isMember, member, 'acme');
    expect(draft.teams).toEqual(['Alpha']);
    expect(calls.activityLogins).toEqual(['alice-new']);
  });

  test('since window starts at the last daily submitted on the previous workday', async () => {
    const { deps, isMember, member } = await setup();
    const submittedAt = new Date('2026-10-27T20:00:00Z');
    await upsertDaily(db, {
      installationId: INST,
      memberId: member.id,
      date: '2026-10-27',
      payload: daily,
      submittedAt,
    });
    const draft = await getDraft(deps, isMember, member, 'acme');
    expect(draft.since).toBe(submittedAt.toISOString());
  });

  test('lists only the pending suggestions of the member', async () => {
    const { deps, isMember, member } = await setup();
    const bob = await seedMember('bob', 2);
    const signal = (n: number, kind: 'pr_no_review' | 'ci_failing') => ({
      kind,
      ref: { kind: 'pull_request' as const, url: `https://github.com/acme/api/pull/${n}` },
      fingerprint: `fp-${n}`,
      since: new Date('2026-10-26T00:00:00Z'),
    });
    const { created } = await syncSuggestions(
      db,
      INST,
      member.id,
      [],
      [signal(1, 'pr_no_review'), signal(2, 'ci_failing'), signal(3, 'ci_failing')],
    );
    await syncSuggestions(db, INST, bob.id, [], [signal(4, 'pr_no_review')]);
    const byFp = (fp: string) => {
      const row = created.find((c) => c.fingerprint === fp);
      if (!row) throw new Error('seed failed');
      return row;
    };
    await decideSuggestion(db, INST, member.id, byFp('fp-2').id, 'ignored');
    await decideSuggestion(db, INST, member.id, byFp('fp-3').id, 'confirmed');
    const draft = await getDraft(deps, isMember, member, 'acme');
    expect(draft.suggestions).toEqual([
      {
        id: byFp('fp-1').id,
        kind: 'pr_no_review',
        ref: { kind: 'pull_request', url: 'https://github.com/acme/api/pull/1' },
        since: byFp('fp-1').createdAt.toISOString(),
      },
    ]);
  });

  test('suggestion titles are clamped so the ref is valid in a submitted blocker', async () => {
    const { deps, isMember, member } = await setup();
    const url = 'https://github.com/acme/api/pull/9';
    const raw = `Fix\tthe ${'x'.repeat(242)}`;
    expect(Array.from(raw)).toHaveLength(250);
    await syncSuggestions(
      db,
      INST,
      member.id,
      [],
      [
        {
          kind: 'ci_failing',
          ref: { kind: 'pull_request', url, title: raw },
          fingerprint: 'fp-long',
          since: new Date('2026-10-26T00:00:00Z'),
        },
      ],
    );
    const draft = await getDraft(deps, isMember, member, 'acme');
    const ref = draft.suggestions[0]?.ref;
    if (!ref) throw new Error('missing suggestion');
    expect(ref.title).toBe(clampTitle(raw));
    expect(ref.title).not.toContain('\t');
    expect(Array.from(ref.title ?? '')).toHaveLength(TITLE_MAX);
    const blocker = { text: 'CI is red on the fix', ref };
    expect(DailySubmissionSchema.safeParse({ ...daily, blockers: [blocker] }).success).toBe(true);
    const result = await submitDaily(deps, isMember, member, { ...daily, blockers: [blocker] });
    expect(result.date).toBe('2026-10-28');
    expect(await listPendingSuggestions(db, INST, member.id)).toEqual([]);
  });
});

const PULL_ACME = 'https://github.com/acme/api/pull/7';
const PULL_OTHER = 'https://github.com/other/api/pull/8';
const CARD = 'https://linear.app/acme/issue/ENG-5/card';

const pullItem = (text: string, url: string): Item => ({
  text,
  ref: { kind: 'pull_request', url },
});

async function seedPlan(
  memberId: string,
  today: Item[],
  date = '2026-10-27',
  installationId = INST,
) {
  await upsertDaily(db, {
    installationId,
    memberId,
    date,
    payload: { ...daily, today },
    submittedAt: new Date(`${date}T20:00:00Z`),
  });
}

function quietErrors() {
  return spyOn(console, 'error').mockImplementation(() => {});
}

function connectedTracker(overrides: Partial<ProjectTracker>): ProjectTracker {
  return { ...nullTracker, connected: true, ...overrides };
}

const ownPr: PendingItem = {
  kind: 'own_pr',
  ref: { kind: 'pull_request', url: 'https://github.com/acme/api/pull/3', title: 'Own' },
  title: 'Own',
  repo: 'acme/api',
  since: '2026-10-26T10:00:00Z',
  draft: false,
  reviewDecision: null,
  checks: 'success',
};

const reviewPr: PendingItem = {
  kind: 'review_requested',
  ref: { kind: 'pull_request', url: 'https://github.com/acme/web/pull/4', title: 'Review' },
  title: 'Review',
  repo: 'acme/web',
  since: '2026-10-25T10:00:00Z',
  draft: false,
  reviewDecision: 'review_required',
  checks: 'pending',
};

describe('getDraft plan against done', () => {
  test('the draft carries the previous plan with statuses', async () => {
    const { deps, isMember, member } = await setup();
    await seedPlan(member.id, [
      pullItem('ship the api', PULL_ACME),
      pullItem('help other', PULL_OTHER),
      { text: 'think about it' },
    ]);
    const lookups: { login: string; since: Date; targets: PullRequestTarget[] }[] = [];
    const evidence = { kind: 'commit' as const, url: PULL_ACME, at: '2026-10-28T10:00:00.000Z' };
    deps.github.lookupPlannedPullRequests = async (_o, input) => {
      lookups.push(input);
      return new Map(
        input.targets.map((t) => [t.key, { ok: true as const, evidence: [evidence] }]),
      );
    };
    const draft = await getDraft(deps, isMember, member, 'acme');
    expect(draft.plan).toEqual({
      date: '2026-10-27',
      items: [
        { ...pullItem('ship the api', PULL_ACME), status: 'moved', evidence: [evidence] },
        { ...pullItem('help other', PULL_OTHER), status: 'unknown', evidence: [] },
        { text: 'think about it', status: 'unknown', evidence: [] },
      ],
    });
    expect(lookups).toEqual([
      {
        login: 'Alice',
        since: new Date('2026-10-27T03:00:00Z'),
        targets: [{ key: 'pr:acme/api#7', owner: 'acme', repo: 'api', number: 7 }],
      },
    ]);
    expect(draft.warnings).toEqual([]);
  });

  test('a resubmitted daily keeps the plan window from the start of its day', async () => {
    const { deps, isMember, member } = await setup();
    const today = [pullItem('ship the api', PULL_ACME)];
    for (const submittedAt of ['2026-10-27T12:00:00Z', '2026-10-27T21:00:00Z']) {
      await upsertDaily(db, {
        installationId: INST,
        memberId: member.id,
        date: '2026-10-27',
        payload: { ...daily, today },
        submittedAt: new Date(submittedAt),
      });
    }
    const commit = { kind: 'commit' as const, url: PULL_ACME, at: '2026-10-27T15:00:00.000Z' };
    const sinces: Date[] = [];
    deps.github.lookupPlannedPullRequests = async (_o, input) => {
      sinces.push(input.since);
      const evidence = new Date(commit.at) >= input.since ? [commit] : [];
      return new Map(input.targets.map((t) => [t.key, { ok: true as const, evidence }]));
    };
    const draft = await getDraft(deps, isMember, member, 'acme');
    expect(sinces).toEqual([new Date('2026-10-27T03:00:00Z')]);
    expect(draft.plan?.items.map((i) => [i.status, i.evidence])).toEqual([['moved', [commit]]]);
  });

  test('a daily submitted the next morning opens the window at the start of its date', async () => {
    const { deps, isMember, member } = await setup();
    await upsertDaily(db, {
      installationId: INST,
      memberId: member.id,
      date: '2026-10-27',
      payload: { ...daily, today: [pullItem('ship the api', PULL_ACME)] },
      submittedAt: new Date('2026-10-28T12:00:00Z'),
    });
    const sinces: Date[] = [];
    deps.github.lookupPlannedPullRequests = async (_o, input) => {
      sinces.push(input.since);
      return new Map(input.targets.map((t) => [t.key, { ok: true as const, evidence: [] }]));
    };
    await getDraft(deps, isMember, member, 'acme');
    expect(sinces).toEqual([new Date('2026-10-27T03:00:00Z')]);
  });

  test('the plan merges pull request and card lookups', async () => {
    const { deps, isMember, member, linear } = await setupCards();
    await seedPlan(member.id, [
      pullItem('ship the api', PULL_ACME),
      { text: 'move the card', ref: { kind: 'card', url: CARD } },
    ]);
    deps.github.lookupPlannedPullRequests = async (_o, input) =>
      new Map(input.targets.map((t) => [t.key, { ok: true as const, evidence: [] }]));
    linear.state.planned = [
      {
        identifier: 'ENG-5',
        url: CARD,
        history: { nodes: [{ createdAt: '2026-10-28T09:00:00Z', toState: { name: 'Done' } }] },
        comments: { nodes: [] },
      },
    ];
    const draft = await getDraft(deps, isMember, member, 'acme');
    expect(draft.plan?.items.map((i) => [i.text, i.status, i.evidence])).toEqual([
      ['ship the api', 'not_moved', []],
      [
        'move the card',
        'moved',
        [{ kind: 'state_changed', url: CARD, at: '2026-10-28T09:00:00.000Z' }],
      ],
    ]);
    const planned = linear.calls.queries.find((q) => q.name === 'PlannedCards');
    expect(planned?.variables).toMatchObject({
      t0: 'ENG',
      n0: 5,
      since: '2026-10-27T03:00:00.000Z',
    });
    expect(draft.warnings).toEqual([]);
  });

  test('the plan is null without a previous daily or when it is older than 7 days', async () => {
    const { deps, isMember, member } = await setup();
    let lookups = 0;
    deps.github.lookupPlannedPullRequests = async () => {
      lookups += 1;
      return new Map();
    };
    expect((await getDraft(deps, isMember, member, 'acme')).plan).toBeNull();
    await seedPlan(member.id, [pullItem('old', PULL_ACME)], '2026-10-20');
    expect((await getDraft(deps, isMember, member, 'acme')).plan).toBeNull();
    expect(lookups).toBe(0);
    await seedPlan(member.id, [pullItem('fresh', PULL_ACME)], '2026-10-21');
    expect((await getDraft(deps, isMember, member, 'acme')).plan?.date).toBe('2026-10-21');
    expect(lookups).toBe(1);
  });

  test('plan cards are unknown without a Linear identity', async () => {
    const { deps, isMember, member, linear } = await setup(trackerConfig());
    await connectLinear();
    await seedPlan(member.id, [{ text: 'move the card', ref: { kind: 'card', url: CARD } }]);
    const draft = await getDraft(deps, isMember, member, 'acme');
    expect(draft.plan?.items).toEqual([
      { text: 'move the card', ref: { kind: 'card', url: CARD }, status: 'unknown', evidence: [] },
    ]);
    expect(draft.warnings).toEqual([]);
    expect(linear.calls.queries.map((q) => q.name)).not.toContain('PlannedCards');
  });

  test('the draft never reads another installation previous daily', async () => {
    const { deps, isMember, member } = await setup();
    await seedOrg(config(), { id: 22, accountLogin: 'other' });
    await seedPlan(member.id, [pullItem('elsewhere', PULL_ACME)], '2026-10-27', 22);
    let lookups = 0;
    deps.github.lookupPlannedPullRequests = async () => {
      lookups += 1;
      return new Map();
    };
    const draft = await getDraft(deps, isMember, member, 'acme');
    expect(draft.plan).toBeNull();
    expect(lookups).toBe(0);
  });
});

describe('getDraft pending', () => {
  test('pending lists pull requests and cards from both sources', async () => {
    const { deps, isMember, member, linear } = await setupCards();
    const asked: string[][] = [];
    deps.github.listPendingPullRequests = async (_o, owner, login) => {
      asked.push([owner, login]);
      return { items: [ownPr, reviewPr], truncated: false };
    };
    linear.state.assigned = [
      {
        identifier: 'ENG-3',
        url: 'https://linear.app/acme/issue/ENG-3/card',
        title: 'Card 3',
        updatedAt: '2026-10-27T12:00:00Z',
        priority: 1,
        state: { name: 'Todo' },
      },
    ];
    const draft = await getDraft(deps, isMember, member, 'acme');
    expect(draft.pending).toEqual({
      items: [
        ownPr,
        reviewPr,
        {
          kind: 'card',
          ref: { kind: 'card', url: 'https://linear.app/acme/issue/ENG-3/card', title: 'Card 3' },
          title: 'Card 3',
          since: '2026-10-27T12:00:00Z',
          priority: 'urgent',
          state: 'Todo',
        },
      ],
      truncated: false,
    });
    expect(asked).toEqual([['acme', 'Alice']]);
    expect(draft.warnings).toEqual([]);
  });

  test('pending is truncated when either source is', async () => {
    const { deps, isMember, member } = await setup();
    deps.github.listPendingPullRequests = async () => ({ items: [ownPr], truncated: true });
    const draft = await getDraft(deps, isMember, member, 'acme');
    expect(draft.pending).toEqual({ items: [ownPr], truncated: true });
    deps.github.listPendingPullRequests = async () => ({ items: [], truncated: false });
    deps.trackerFor = async () =>
      connectedTracker({ listAssignedOpen: async () => ({ items: [], truncated: true }) });
    expect((await getDraft(deps, isMember, member, 'acme')).pending.truncated).toBe(true);
  });
});

describe('getDraft source warnings', () => {
  test('a failing source becomes a warning and the rest of the draft still returns', async () => {
    const { deps, isMember, member } = await setup();
    await syncSuggestions(
      db,
      INST,
      member.id,
      [],
      [
        {
          kind: 'pr_no_review',
          ref: { kind: 'pull_request', url: 'https://github.com/acme/api/pull/1' },
          fingerprint: 'fp-1',
          since: new Date('2026-10-26T00:00:00Z'),
        },
      ],
    );
    deps.github.listActivity = async () => {
      throw new Error('github down');
    };
    deps.github.listPendingPullRequests = async () => ({ items: [ownPr], truncated: false });
    const spy = quietErrors();
    const draft = await getDraft(deps, isMember, member, 'acme');
    spy.mockRestore();
    expect(draft.warnings).toEqual([{ source: 'github_activity', code: 'unavailable' }]);
    expect(draft.activity).toEqual([]);
    expect(draft.pending.items).toEqual([ownPr]);
    expect(draft.suggestions).toHaveLength(1);
  });

  test('a failing plan lookup leaves the planned items unknown', async () => {
    const { deps, isMember, member } = await setup();
    await seedPlan(member.id, [pullItem('ship the api', PULL_ACME)]);
    deps.github.lookupPlannedPullRequests = async () => {
      throw new GitHubRateLimitError(30);
    };
    const spy = quietErrors();
    const draft = await getDraft(deps, isMember, member, 'acme');
    spy.mockRestore();
    expect(draft.plan?.items.map((i) => i.status)).toEqual(['unknown']);
    expect(draft.warnings).toEqual([{ source: 'github_plan', code: 'rate_limited' }]);
  });

  const boom = async (): Promise<never> => {
    throw new Error('x');
  };
  type Deps = Awaited<ReturnType<typeof setup>>['deps'];
  const failures: [DraftWarningSource, (deps: Deps, tracker: Partial<ProjectTracker>) => void][] = [
    ['github_activity', (deps) => Object.assign(deps.github, { listActivity: boom })],
    ['github_pending', (deps) => Object.assign(deps.github, { listPendingPullRequests: boom })],
    ['github_plan', (deps) => Object.assign(deps.github, { lookupPlannedPullRequests: boom })],
    ['linear_activity', (_deps, tracker) => Object.assign(tracker, { listActivity: boom })],
    ['linear_pending', (_deps, tracker) => Object.assign(tracker, { listAssignedOpen: boom })],
    ['linear_plan', (_deps, tracker) => Object.assign(tracker, { lookupCards: boom })],
  ];

  for (const [source, fail] of failures) {
    test(`${source} failing alone gives one warning and the rest of the draft`, async () => {
      const { deps, isMember, member } = await setup();
      await seedPlan(member.id, [
        pullItem('ship the api', PULL_ACME),
        { text: 'move the card', ref: { kind: 'card', url: CARD } },
      ]);
      deps.github.listActivity = async () => [pr(1, '2026-10-27T15:00:00Z')];
      deps.github.listPendingPullRequests = async () => ({ items: [ownPr], truncated: false });
      deps.github.lookupPlannedPullRequests = async (_o, input) =>
        new Map(input.targets.map((t) => [t.key, { ok: true as const, evidence: [] }]));
      const tracker: Partial<ProjectTracker> = {
        lookupCards: async (_login, targets) =>
          new Map(targets.map((t) => [t.key, { ok: true as const, evidence: [] }])),
      };
      fail(deps, tracker);
      deps.trackerFor = async () => connectedTracker(tracker);
      const spy = quietErrors();
      const draft = await getDraft(deps, isMember, member, 'acme');
      spy.mockRestore();
      expect(draft.warnings).toEqual([{ source, code: 'unavailable' }]);
      expect(draft.activity.length).toBe(source === 'github_activity' ? 0 : 1);
      expect(draft.pending.items.length).toBe(source === 'github_pending' ? 0 : 1);
      expect(draft.plan?.items.map((i) => i.status)).toEqual([
        source === 'github_plan' ? 'unknown' : 'not_moved',
        source === 'linear_plan' ? 'unknown' : 'not_moved',
      ]);
    });
  }

  test('a tracker that fails to build is a linear warning and the draft continues', async () => {
    const { deps, isMember, member } = await setup(trackerConfig());
    deps.trackerFor = async () => {
      throw new LinearAuthError();
    };
    deps.github.listPendingPullRequests = async () => ({ items: [ownPr], truncated: false });
    const spy = quietErrors();
    const draft = await getDraft(deps, isMember, member, 'acme');
    spy.mockRestore();
    expect(draft.warnings).toEqual([{ source: 'linear_activity', code: 'auth' }]);
    expect(draft.pending.items).toEqual([ownPr]);
  });

  test('a disconnected tracker adds no warning', async () => {
    const { deps, isMember, member } = await setup(trackerConfig());
    const draft = await getDraft(deps, isMember, member, 'acme');
    expect(draft.warnings).toEqual([]);
  });

  test('warnings come in a fixed source order', async () => {
    const { deps, isMember, member } = await setup();
    deps.github.listPendingPullRequests = async () => {
      throw new Error('x');
    };
    const { promise: othersFailed, resolve: releaseActivity } = Promise.withResolvers<void>();
    deps.github.listActivity = async () => {
      await othersFailed;
      throw new Error('x');
    };
    deps.trackerFor = async () =>
      connectedTracker({
        listAssignedOpen: async () => {
          throw new LinearRateLimitError(null);
        },
      });
    const failed: unknown[] = [];
    const spy = spyOn(console, 'error').mockImplementation((_label, fields) => {
      failed.push((fields as { source?: unknown } | undefined)?.source);
      if (failed.includes('github_pending') && failed.includes('linear_pending')) {
        releaseActivity();
      }
    });
    const draft = await getDraft(deps, isMember, member, 'acme');
    spy.mockRestore();
    expect(failed).toHaveLength(3);
    expect(failed.at(-1)).toBe('github_activity');
    expect(draft.warnings).toEqual([
      { source: 'github_activity', code: 'unavailable' },
      { source: 'github_pending', code: 'unavailable' },
      { source: 'linear_pending', code: 'rate_limited' },
    ]);
  });

  test('source failures are logged without the error message', async () => {
    const { deps, isMember, member, linear } = await setupCards();
    await seedPlan(member.id, [pullItem('ship the api', PULL_ACME)]);
    const leaky = () =>
      Object.assign(new Error('Could not resolve to a Repository with the name acme/secret-repo'), {
        request: { variables: { own: 'is:pr author:alice org:acme secret-repo' } },
      });
    deps.github.listActivity = async () => {
      throw leaky();
    };
    deps.github.listPendingPullRequests = async () => {
      throw leaky();
    };
    deps.github.lookupPlannedPullRequests = async () => {
      throw leaky();
    };
    linear.state.graphqlStatus = 500;
    const logged: unknown[][] = [];
    const spy = spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logged.push(args);
    });
    const draft = await getDraft(deps, isMember, member, 'acme');
    spy.mockRestore();
    expect(draft.warnings.map((w) => w.source)).toEqual([
      'github_activity',
      'github_pending',
      'github_plan',
      'linear_activity',
      'linear_pending',
    ]);
    const output = Bun.inspect(logged);
    expect(output).not.toContain('secret-repo');
    expect(output).not.toContain('linear http');
    expect(logged).toContainEqual([
      'draft source failed',
      expect.objectContaining({
        installationId: String(INST),
        source: 'github_plan',
        code: 'unavailable',
      }),
    ]);
  });
});

describe('warningCode', () => {
  test('maps errors to stable codes', () => {
    const timeout = new DOMException('signal timed out', 'TimeoutError');
    expect(warningCode(new GitHubRateLimitError(30))).toBe('rate_limited');
    expect(warningCode(new LinearRateLimitError(null))).toBe('rate_limited');
    expect(warningCode(new LinearAuthError())).toBe('auth');
    expect(warningCode(timeout)).toBe('timeout');
    expect(warningCode(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe(
      'timeout',
    );
    expect(warningCode(Object.assign(new Error('wrapped'), { cause: timeout }))).toBe('timeout');
    expect(warningCode(new Error('boom'))).toBe('unavailable');
    expect(warningCode('boom')).toBe('unavailable');
    expect(warningCode(null)).toBe('unavailable');
  });
});
