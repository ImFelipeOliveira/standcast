import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { draftWithWork } from '../../src/draft/with-sessions';

const fixtures = join(import.meta.dir, '..', 'fixtures', 'claude');
const now = new Date('2026-11-01T00:00:00.000Z');

const DRAFT = {
  org: 'acme',
  date: '2026-11-01',
  since: '2026-10-31T00:00:00.000Z',
  teams: ['backend'],
  activity: [
    {
      kind: 'pr_opened' as const,
      title: 'Add rate limits',
      url: 'https://github.com/acme/api/pull/7',
      repo: 'acme/api',
      at: '2026-10-31T12:00:00.000Z',
    },
  ],
  suggestions: [],
};

describe('draftWithWork', () => {
  test('adds work items with the sessions in the draft window', async () => {
    const result = await draftWithWork(DRAFT, { now, env: {}, dir: join(fixtures, 'basic') });
    expect(result).toMatchObject(DRAFT);
    const sessions = result.work.flatMap((item) => item.sessions.map((s) => s.id));
    expect(sessions).toEqual(['a1']);
    const pr = result.work.find((item) => item.key === 'pr:https://github.com/acme/api/pull/7');
    expect(pr?.title).toBe('Add rate limits');
    expect(pr?.refs).toEqual([
      { kind: 'pull_request', url: 'https://github.com/acme/api/pull/7', title: 'Add rate limits' },
    ]);
  });

  test('sessions off builds work from activity only', async () => {
    const result = await draftWithWork(DRAFT, {
      now,
      env: { STANDCAST_SESSIONS: 'off' },
      dir: join(fixtures, 'basic'),
    });
    expect(result.work.map((item) => item.key)).toEqual(['pr:https://github.com/acme/api/pull/7']);
    expect(result.work.flatMap((item) => item.sessions)).toEqual([]);
  });

  test('reads STANDCAST_CLAUDE_DIR when no dir is given', async () => {
    const result = await draftWithWork(DRAFT, {
      now,
      env: { STANDCAST_CLAUDE_DIR: join(fixtures, 'basic') },
    });
    expect(result.work.flatMap((item) => item.sessions.map((s) => s.id))).toEqual(['a1']);
  });

  test('skips activity entries that are not activity items', async () => {
    const draft = {
      ...DRAFT,
      activity: [...DRAFT.activity, { kind: 'pull_request', title: 'odd' }, null, 'text'],
    };
    const result = await draftWithWork(draft, { now, env: { STANDCAST_SESSIONS: 'off' } });
    expect(result.activity).toEqual(draft.activity);
    expect(result.work.map((item) => item.key)).toEqual(['pr:https://github.com/acme/api/pull/7']);
  });
});
