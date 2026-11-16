import { describe, expect, test } from 'bun:test';
import type { WorkerDeps } from '@standcast/orchestrator';
import { db, useCleanDb } from '../../../packages/db/test/setup';
import { sendAwayNoticeJob } from '../src/jobs/send-away-notice';

useCleanDb();

const job = {
  installationId: 11,
  periodId: '6f1c2a40-0000-4000-8000-000000000001',
  action: 'marked',
  byLogin: 'alice',
  date: '2026-10-28',
};

describe('sendAwayNoticeJob', () => {
  test('rejects a job without a valid delivery date', () => {
    const run = sendAwayNoticeJob({ db } as unknown as WorkerDeps);
    const { date: _date, ...withoutDate } = job;
    expect(() => run(withoutDate)).toThrow();
    expect(() => run({ ...job, date: '28/10' })).toThrow();
  });

  test('does nothing for an unknown installation', async () => {
    const run = sendAwayNoticeJob({ db } as unknown as WorkerDeps);
    await expect(run(job)).resolves.toBeUndefined();
  });
});
