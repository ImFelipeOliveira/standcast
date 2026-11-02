import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSessions } from '../../src/draft/sessions';

const fixtures = join(import.meta.dir, '..', 'fixtures', 'claude');
const since = new Date('2026-10-31T00:00:00.000Z');
const until = new Date('2026-11-01T00:00:00.000Z');

const temps: string[] = [];

afterEach(async () => {
  for (const dir of temps.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'standcast-sessions-'));
  temps.push(dir);
  return dir;
}

function line(fields: Record<string, unknown>): string {
  return JSON.stringify({
    sessionId: 's1',
    timestamp: '2026-10-31T08:00:00.000Z',
    cwd: '/work/app',
    gitBranch: 'main',
    ...fields,
  });
}

describe('readSessions', () => {
  test('reads one session from fixture', async () => {
    const sessions = await readSessions({ dir: join(fixtures, 'basic'), since, until, env: {} });
    expect(sessions).toEqual([
      {
        id: 'a1',
        title: 'Fix cart total rounding',
        cwd: '/home/dev/shop',
        branch: 'feat/cart',
        startedAt: '2026-10-31T09:00:00.000Z',
        endedAt: '2026-10-31T09:10:00.000Z',
        prompts: ['Fix the cart total rounding', 'Now add a test for it'],
        files: ['src/cart.ts'],
      },
    ]);
  });

  test('ignores lines outside the window', async () => {
    const sessions = await readSessions({ dir: join(fixtures, 'basic'), since, until, env: {} });
    expect(sessions.map((s) => s.id)).toEqual(['a1']);
    const prompts = sessions.flatMap((s) => s.prompts);
    expect(prompts).not.toContain('Old prompt before the window');
    expect(prompts).not.toContain('Prompt after the window');

    const later = await readSessions({
      dir: join(fixtures, 'basic'),
      since: new Date('2026-10-31T09:05:00.000Z'),
      until,
      env: {},
    });
    expect(later.map((s) => s.prompts)).toEqual([['Now add a test for it']]);
    expect(later[0]?.files).toEqual([]);
  });

  test('skips files modified before since', async () => {
    const dir = await tempDir();
    await mkdir(join(dir, 'proj'));
    const file = join(dir, 'proj', 's1.jsonl');
    await writeFile(file, `${line({ type: 'user', message: { role: 'user', content: 'hi' } })}\n`);
    const old = new Date('2026-10-01T00:00:00.000Z');
    await utimes(file, old, old);
    expect(await readSessions({ dir, since, until, env: {} })).toEqual([]);
  });

  test('skips tool results, meta lines, command expansions and system reminders', async () => {
    const sessions = await readSessions({ dir: join(fixtures, 'filters'), since, until, env: {} });
    expect(sessions).toEqual([
      {
        id: 'c3',
        title: 'Rename the endpoint please',
        cwd: '/home/dev/api',
        branch: null,
        startedAt: '2026-10-31T10:00:00.000Z',
        endedAt: '2026-10-31T10:00:07.000Z',
        prompts: ['Rename the endpoint please'],
        files: ['/etc/outside.conf', 'nb/explore.ipynb'],
      },
    ]);
  });

  test('caps prompts at 5 and 300 chars, files at 20', async () => {
    const dir = await tempDir();
    await mkdir(join(dir, 'proj'));
    const lines: string[] = [];
    for (let i = 0; i < 7; i++) {
      lines.push(
        line({
          type: 'user',
          timestamp: `2026-10-31T08:0${i}:00.000Z`,
          message: { role: 'user', content: `prompt ${i} ${'x '.repeat(200)}` },
        }),
      );
    }
    const edits = Array.from({ length: 25 }, (_, i) => ({
      type: 'tool_use',
      id: `t${i}`,
      name: i % 2 === 0 ? 'Write' : 'MultiEdit',
      input: { file_path: `/work/app/src/f${i}.ts` },
    }));
    edits.push({
      type: 'tool_use',
      id: 'dup',
      name: 'Edit',
      input: { file_path: '/work/app/src/f0.ts' },
    });
    lines.push(
      line({
        type: 'assistant',
        timestamp: '2026-10-31T08:09:00.000Z',
        message: { role: 'assistant', content: edits },
      }),
    );
    await writeFile(join(dir, 'proj', 's1.jsonl'), `${lines.join('\n')}\n`);

    const [session] = await readSessions({ dir, since, until, env: {} });
    expect(session?.prompts).toHaveLength(5);
    for (const prompt of session?.prompts ?? []) expect(prompt.length).toBeLessThanOrEqual(300);
    expect(session?.prompts[0]?.startsWith('prompt 0 ')).toBe(true);
    expect(session?.prompts[4]?.startsWith('prompt 4 ')).toBe(true);
    expect(session?.title.length).toBe(120);
    expect(session?.title.startsWith('prompt 0 ')).toBe(true);
    expect(session?.files).toHaveLength(20);
    expect(new Set(session?.files).size).toBe(20);
    expect(session?.files[0]).toBe('src/f0.ts');
  });

  test('redacts secrets in prompts and titles', async () => {
    const sessions = await readSessions({ dir: join(fixtures, 'secrets'), since, until, env: {} });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.prompts).toEqual(['Use key [redacted] to call the API']);
    expect(sessions[0]?.title).toBe('Rotate [redacted] token');

    const dir = await tempDir();
    await mkdir(join(dir, 'proj'));
    await writeFile(
      join(dir, 'proj', 's1.jsonl'),
      `${line({ type: 'user', message: { role: 'user', content: 'token AKIAABCDEFGHIJKLMNOP now' } })}\n`,
    );
    const [fallback] = await readSessions({ dir, since, until, env: {} });
    expect(fallback?.title).toBe('token [redacted] now');
  });

  test('missing and malformed files', async () => {
    expect(
      await readSessions({ dir: join(fixtures, 'does-not-exist'), since, until, env: {} }),
    ).toEqual([]);

    const sessions = await readSessions({
      dir: join(fixtures, 'malformed'),
      since,
      until,
      env: {},
    });
    expect(sessions).toEqual([
      {
        id: 'e5',
        title: 'Write the release notes',
        cwd: '/home/dev/notes',
        branch: 'docs',
        startedAt: '2026-10-31T12:00:00.000Z',
        endedAt: '2026-10-31T12:02:00.000Z',
        prompts: ['Write the release notes'],
        files: [],
      },
    ]);

    const dir = await tempDir();
    await writeFile(join(dir, 'stray.jsonl'), 'not a project dir');
    expect(await readSessions({ dir, since, until, env: {} })).toEqual([]);
  });

  test('skips interrupted markers', async () => {
    const dir = await tempDir();
    await mkdir(join(dir, 'proj'));
    const lines = [
      line({
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text: '[Request interrupted by user]' }],
        },
      }),
      line({
        type: 'user',
        timestamp: '2026-10-31T08:01:00.000Z',
        message: { role: 'user', content: '[Request interrupted by user for tool use]' },
      }),
      line({
        type: 'user',
        timestamp: '2026-10-31T08:02:00.000Z',
        message: { role: 'user', content: 'Ship the fix' },
      }),
    ];
    await writeFile(join(dir, 'proj', 's1.jsonl'), `${lines.join('\n')}\n`);
    const [session] = await readSessions({ dir, since, until, env: {} });
    expect(session?.prompts).toEqual(['Ship the fix']);
  });

  test('reads only the tail of large files', async () => {
    const dir = await tempDir();
    await mkdir(join(dir, 'proj'));
    const lines: string[] = [];
    for (let i = 0; i < 40; i++) {
      lines.push(
        line({
          type: 'user',
          timestamp: `2026-10-31T08:${String(i).padStart(2, '0')}:00.000Z`,
          message: { role: 'user', content: `prompt ${String(i).padStart(2, '0')}` },
        }),
      );
    }
    const body = `${lines.join('\n')}\n`;
    await writeFile(join(dir, 'proj', 's1.jsonl'), body);
    const lineBytes = Buffer.byteLength(`${lines[0]}\n`);
    const tailBytes = lineBytes * 3 + 10;

    const [whole] = await readSessions(
      { dir, since, until, env: {} },
      { maxWholeBytes: body.length, tailBytes },
    );
    expect(whole?.prompts[0]).toBe('prompt 00');

    const [tail] = await readSessions(
      { dir, since, until, env: {} },
      { maxWholeBytes: body.length - 1, tailBytes },
    );
    expect(tail?.prompts).toEqual(['prompt 37', 'prompt 38', 'prompt 39']);
    expect(tail?.startedAt).toBe('2026-10-31T08:37:00.000Z');
  });

  test('uses STANDCAST_CLAUDE_DIR when dir is not given', async () => {
    const sessions = await readSessions({
      since,
      until,
      env: { STANDCAST_CLAUDE_DIR: join(fixtures, 'basic') },
    });
    expect(sessions.map((s) => s.id)).toEqual(['a1']);
  });

  test('sessions off', async () => {
    expect(
      await readSessions({
        dir: join(fixtures, 'basic'),
        since,
        until,
        env: { STANDCAST_SESSIONS: 'off' },
      }),
    ).toEqual([]);
  });
});
