import { describe, expect, test } from 'bun:test';
import type { Item } from '../src/daily';
import {
  buildPlan,
  PLAN_LOOKUP_CAP,
  type PlanLookupResult,
  planIsFresh,
  planTargets,
} from '../src/daily-plan';

const pr = (url: string, text = 'work'): Item => ({ text, ref: { kind: 'pull_request', url } });
const card = (url: string, text = 'work'): Item => ({ text, ref: { kind: 'card', url } });

describe('planTargets', () => {
  test('keeps pull requests of the owner and cards, deduplicated', () => {
    const targets = planTargets(
      [
        pr('https://github.com/acme/api/pull/7'),
        pr('https://github.com/ACME/api/pull/7/'),
        pr('https://github.com/other/lib/pull/1'),
        card('https://linear.app/acme/issue/eng-12/x'),
      ],
      'acme',
    );
    expect(targets.pullRequests).toEqual([
      { key: 'pr:acme/api#7', owner: 'acme', repo: 'api', number: 7 },
    ]);
    expect(targets.cards).toHaveLength(1);
    expect(targets.cards[0]?.key).toBe('card:acme/ENG-12');
    expect(targets.cards[0]?.identifier).toBe('ENG-12');
  });

  test('keeps the same identifier in two workspaces as two cards', () => {
    const acme = card('https://linear.app/acme/issue/ENG-12/x');
    const other = card('https://linear.app/other/issue/ENG-12/y');
    for (const items of [
      [acme, other],
      [other, acme],
    ]) {
      expect(
        planTargets(items, 'acme')
          .cards.map((target) => target.key)
          .sort(),
      ).toEqual(['card:acme/ENG-12', 'card:other/ENG-12']);
    }
  });

  test('caps each kind at PLAN_LOOKUP_CAP', () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      pr(`https://github.com/acme/api/pull/${i + 1}`),
    );
    expect(planTargets(items, 'acme').pullRequests).toHaveLength(PLAN_LOOKUP_CAP);
  });

  test('skips pull request numbers above the GraphQL Int range', () => {
    const targets = planTargets(
      [
        pr('https://github.com/acme/api/pull/2147483648'),
        pr('https://github.com/acme/api/pull/99999999999999999999'),
        pr('https://github.com/acme/api/pull/2147483647'),
      ],
      'acme',
    );
    expect(targets.pullRequests.map((t) => t.number)).toEqual([2147483647]);
  });
});

describe('buildPlan', () => {
  const evidence = [
    { kind: 'commit' as const, url: 'https://github.com/acme/api/commit/abc1234', at: 't' },
  ];
  const results = new Map<string, PlanLookupResult>([
    ['pr:acme/api#7', { ok: true, evidence }],
    ['card:acme/ENG-12', { ok: true, evidence: [] }],
    ['pr:acme/api#9', { ok: false }],
  ]);

  test('marks moved, not_moved and unknown', () => {
    const plan = buildPlan({
      date: '2026-11-14',
      items: [
        pr('https://github.com/acme/api/pull/7'),
        card('https://linear.app/acme/issue/ENG-12/x'),
        { text: 'no ref' },
        { text: 'issue', ref: { kind: 'issue', url: 'https://github.com/acme/api/issues/3' } },
        pr('https://github.com/other/lib/pull/1'),
        pr('https://github.com/acme/api/pull/9'),
      ],
      results,
    });
    expect(plan.date).toBe('2026-11-14');
    expect(plan.items.map((i) => i.status)).toEqual([
      'moved',
      'not_moved',
      'unknown',
      'unknown',
      'unknown',
      'unknown',
    ]);
    expect(plan.items[0]?.evidence).toEqual(evidence);
  });

  test('gives two items on the same pull request the same status', () => {
    const plan = buildPlan({
      date: '2026-11-14',
      items: [
        pr('https://github.com/acme/api/pull/7', 'a'),
        pr('https://github.com/ACME/api/pull/7/files', 'b'),
      ],
      results,
    });
    expect(plan.items.map((i) => i.status)).toEqual(['moved', 'moved']);
  });
});

describe('buildPlan across Linear workspaces', () => {
  test('never applies one workspace result to the same identifier in another', () => {
    const acme = card('https://linear.app/acme/issue/ENG-12/x', 'acme');
    const other = card('https://linear.app/Other/issue/eng-12', 'other');
    const evidence = [{ kind: 'state_changed' as const, url: acme.ref?.url ?? '', at: 't' }];
    const results = new Map<string, PlanLookupResult>([
      ['card:acme/ENG-12', { ok: true, evidence }],
    ]);
    for (const items of [
      [acme, other],
      [other, acme],
    ]) {
      const plan = buildPlan({ date: '2026-11-14', items, results });
      const status = Object.fromEntries(plan.items.map((item) => [item.text, item.status]));
      expect(status).toEqual({ acme: 'moved', other: 'unknown' });
    }
  });
});

describe('planIsFresh', () => {
  test('accepts plans up to the max age', () => {
    expect(planIsFresh('2026-11-07', '2026-11-14')).toBe(true);
    expect(planIsFresh('2026-11-06', '2026-11-14')).toBe(false);
  });
});
