import { describe, expect, test } from 'bun:test';
import type { WorkerDeps } from '@standcast/orchestrator';
import { db, useCleanDb } from '../../../packages/db/test/setup';
import { sendBlockerAlertsJob } from '../src/jobs/send-blocker-alerts';

useCleanDb();

describe('sendBlockerAlertsJob', () => {
  test('rejects a job without a team or a valid date', () => {
    const run = sendBlockerAlertsJob({ db } as unknown as WorkerDeps);
    expect(() => run({ installationId: 11, teamName: '', date: '2026-10-28' })).toThrow();
    expect(() => run({ installationId: 11, teamName: 'Alpha', date: '28/10' })).toThrow();
  });

  test('does nothing for an unknown installation', async () => {
    const run = sendBlockerAlertsJob({ db } as unknown as WorkerDeps);
    await expect(
      run({ installationId: 11, teamName: 'Alpha', date: '2026-10-28' }),
    ).resolves.toBeUndefined();
  });
});
