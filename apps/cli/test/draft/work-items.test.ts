import { describe, expect, test } from 'bun:test';
import type { ActivityItem } from '@standcast/core';
import type { SessionSummary } from '../../src/draft/sessions';
import { buildWorkItems } from '../../src/draft/work-items';

type Session = SessionSummary & { repo: string | null };

function session(fields: Partial<Session> & { id: string }): Session {
  return {
    title: `session ${fields.id}`,
    cwd: '/work/app',
    branch: null,
    startedAt: '2026-10-31T08:00:00.000Z',
    endedAt: '2026-10-31T09:00:00.000Z',
    prompts: ['do the thing'],
    files: [],
    repo: 'acme/app',
    ...fields,
  };
}

function pr(fields: Partial<ActivityItem> & { url: string }): ActivityItem {
  return {
    kind: 'pr_opened',
    title: 'Some change',
    repo: 'acme/app',
    at: new Date('2026-10-31T10:00:00.000Z'),
    ...fields,
  };
}

function card(id: string, fields: Partial<ActivityItem> = {}): ActivityItem {
  return {
    kind: 'card_started',
    title: `Card ${id}`,
    url: `https://linear.app/acme/issue/${id}/some-slug`,
    repo: '',
    at: new Date('2026-10-31T07:00:00.000Z'),
    ...fields,
  };
}

describe('buildWorkItems', () => {
  test('session joins its pull request by repo and branch', () => {
    const items = buildWorkItems({
      activity: [
        pr({ url: 'https://github.com/Acme/App/pull/1', repo: 'Acme/App', branch: 'feat/login' }),
      ],
      sessions: [
        session({ id: 's1', branch: 'feat/login' }),
        session({ id: 's2', branch: 'feat/login', repo: 'acme/other' }),
      ],
    });
    const prItem = items.find((i) => i.key === 'pr:https://github.com/Acme/App/pull/1');
    expect(prItem?.sessions.map((s) => s.id)).toEqual(['s1']);
    expect(prItem?.title).toBe('Some change');
    expect(prItem?.refs).toEqual([
      { kind: 'pull_request', url: 'https://github.com/Acme/App/pull/1', title: 'Some change' },
    ]);
    const other = items.find((i) => i.key === 'project:acme/other');
    expect(other?.sessions.map((s) => s.id)).toEqual(['s2']);
    expect(items).toHaveLength(2);
  });

  test('pull request and card merge through the branch', () => {
    const items = buildWorkItems({
      activity: [
        pr({
          url: 'https://github.com/acme/app/pull/2',
          title: 'Login',
          branch: 'felipe/eng-42-login',
        }),
        pr({
          kind: 'pr_merged',
          url: 'https://github.com/acme/app/pull/3',
          title: 'Follow up for ENG-42',
          branch: 'cleanup',
          at: new Date('2026-10-31T11:00:00.000Z'),
        }),
        card('ENG-42', { title: 'Add login' }),
      ],
      sessions: [session({ id: 's1', branch: 'eng-42-spike', repo: null, cwd: '/tmp/spike' })],
    });
    expect(items).toHaveLength(1);
    const [item] = items;
    expect(item?.key).toBe('card:ENG-42');
    expect(item?.title).toBe('Add login');
    expect(item?.activity).toHaveLength(3);
    expect(item?.sessions.map((s) => s.id)).toEqual(['s1']);
    expect(item?.refs).toEqual([
      { kind: 'card', url: 'https://linear.app/acme/issue/ENG-42/some-slug', title: 'Add login' },
      {
        kind: 'pull_request',
        url: 'https://github.com/acme/app/pull/3',
        title: 'Follow up for ENG-42',
      },
      { kind: 'pull_request', url: 'https://github.com/acme/app/pull/2', title: 'Login' },
    ]);
  });

  test('card ids only from known cards', () => {
    const items = buildWorkItems({
      activity: [
        pr({
          url: 'https://github.com/acme/app/pull/4',
          title: 'Fix UTF-8 and ISO-8601',
          branch: 'release-2026',
        }),
        card('ENG-7'),
      ],
      sessions: [session({ id: 's1', branch: 'abc-123-thing', repo: 'acme/web' })],
    });
    expect(items.map((i) => i.key).sort()).toEqual([
      'card:ENG-7',
      'pr:https://github.com/acme/app/pull/4',
      'project:acme/web',
    ]);
    expect(items.find((i) => i.key === 'card:ENG-7')?.activity).toHaveLength(1);
  });

  test('commits join the pr item of the same repo', () => {
    const commits: ActivityItem = {
      kind: 'commits',
      title: '3 commits',
      url: 'https://github.com/acme/app/commits',
      repo: 'acme/app',
      at: new Date('2026-10-31T11:00:00.000Z'),
      count: 3,
    };
    const lonely: ActivityItem = {
      ...commits,
      url: 'https://github.com/acme/lib/commits',
      repo: 'acme/lib',
    };
    const items = buildWorkItems({
      activity: [pr({ url: 'https://github.com/acme/app/pull/5', branch: 'x' }), commits, lonely],
      sessions: [],
    });
    expect(items.find((i) => i.key === 'pr:https://github.com/acme/app/pull/5')?.activity).toEqual([
      commits,
      pr({ url: 'https://github.com/acme/app/pull/5', branch: 'x' }),
    ]);
    const lib = items.find((i) => i.key === 'project:acme/lib');
    expect(lib?.activity).toEqual([lonely]);
    expect(lib?.title).toBe('acme/lib');
    expect(lib?.refs).toEqual([]);
    expect(items).toHaveLength(2);
  });

  test('unmatched sessions group per project', () => {
    const items = buildWorkItems({
      activity: [],
      sessions: [
        session({ id: 's1', repo: 'acme/app', branch: 'main' }),
        session({ id: 's2', repo: 'acme/app', branch: 'spike', cwd: '/elsewhere/app' }),
        session({ id: 's3', repo: null, cwd: '/home/me/notes' }),
        session({ id: 's4', repo: null, cwd: '/home/me/notes/' }),
      ],
    });
    expect(items.map((i) => [i.key, i.title, i.sessions.map((s) => s.id).sort()])).toEqual([
      ['project:acme/app', 'acme/app', ['s1', 's2']],
      ['project:notes', 'notes', ['s3', 's4']],
    ]);
  });

  test('ordering newest first', () => {
    const items = buildWorkItems({
      activity: [
        pr({ url: 'https://github.com/acme/app/pull/6', at: new Date('2026-10-31T09:00:00.000Z') }),
        card('ENG-9', { at: new Date('2026-10-31T15:00:00.000Z') }),
      ],
      sessions: [
        session({ id: 'old', repo: 'acme/web', endedAt: '2026-10-31T08:00:00.000Z' }),
        session({ id: 'new', repo: 'acme/web', endedAt: '2026-10-31T12:00:00.000Z' }),
        session({ id: 'mid', repo: 'acme/api', endedAt: '2026-10-31T10:00:00.000Z' }),
      ],
    });
    expect(items.map((i) => i.key)).toEqual([
      'card:ENG-9',
      'project:acme/web',
      'project:acme/api',
      'pr:https://github.com/acme/app/pull/6',
    ]);
    expect(items[1]?.sessions.map((s) => s.id)).toEqual(['new', 'old']);
  });
  test('two pull requests on the same branch merge into one item', () => {
    const items = buildWorkItems({
      activity: [
        pr({ url: 'https://github.com/acme/app/pull/10', title: 'First try', branch: 'feat/pay' }),
        pr({
          kind: 'pr_merged',
          url: 'https://github.com/acme/app/pull/11',
          title: 'Second try',
          branch: 'feat/pay',
          at: new Date('2026-10-31T12:00:00.000Z'),
        }),
      ],
      sessions: [session({ id: 's1', branch: 'feat/pay' })],
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.sessions.map((s) => s.id)).toEqual(['s1']);
    expect(items[0]?.refs.map((r) => r.url)).toEqual([
      'https://github.com/acme/app/pull/11',
      'https://github.com/acme/app/pull/10',
    ]);
  });

  test('two pull requests on the same branch merge without a session', () => {
    const items = buildWorkItems({
      activity: [
        pr({ url: 'https://github.com/acme/app/pull/12', branch: 'feat/pay' }),
        pr({ url: 'https://github.com/acme/app/pull/13', branch: 'feat/pay' }),
        pr({ url: 'https://github.com/acme/web/pull/14', repo: 'acme/web', branch: 'feat/pay' }),
      ],
      sessions: [],
    });
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.activity.length).sort()).toEqual([1, 2]);
  });

  test('accepts iso string dates', () => {
    const items = buildWorkItems({
      activity: [
        pr({
          url: 'https://github.com/acme/app/pull/15',
          at: '2026-10-31T20:00:00.000Z' as unknown as Date,
        }),
        card('ENG-11', { at: '2026-10-31T06:00:00.000Z' as unknown as Date }),
      ],
      sessions: [],
    });
    expect(items.map((i) => i.key)).toEqual([
      'pr:https://github.com/acme/app/pull/15',
      'card:ENG-11',
    ]);
  });

  test('a review is its own pull request item', () => {
    const review = pr({
      kind: 'review',
      url: 'https://github.com/acme/web/pull/16',
      title: 'Teammate change',
      repo: 'acme/web',
    });
    const items = buildWorkItems({ activity: [review], sessions: [] });
    expect(items).toEqual([
      {
        key: 'pr:https://github.com/acme/web/pull/16',
        title: 'Teammate change',
        refs: [
          {
            kind: 'pull_request',
            url: 'https://github.com/acme/web/pull/16',
            title: 'Teammate change',
          },
        ],
        activity: [review],
        sessions: [],
      },
    ]);
  });
});
