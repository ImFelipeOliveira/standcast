import { describe, expect, test } from 'bun:test';
import type { WorkerDeps } from '@standcast/orchestrator';
import { db, useCleanDb } from '../../../packages/db/test/setup';
import { postReportItemJob } from '../src/jobs/post-report-item';
import { recordProductionPushJob } from '../src/jobs/record-production-push';
import { sendProductionReportJob } from '../src/jobs/send-production-report';

useCleanDb();

const deps = { db } as unknown as WorkerDeps;
const thread = { channel: 'C1', id: 't1' };

describe('production report jobs', () => {
  test('recordProductionPushJob rejects a malformed payload', () => {
    const run = recordProductionPushJob(deps);
    const valid = {
      installationId: 11,
      owner: 'acme',
      repo: 'api',
      branch: 'main',
      before: 'a1',
      after: 'b2',
      receivedAt: '2026-11-24T10:00:00.000Z',
    };
    expect(() => run({ ...valid, repo: '' })).toThrow();
    expect(() => run({ ...valid, receivedAt: 'yesterday' })).toThrow();
  });

  test('sendProductionReportJob rejects a malformed payload and passes a valid one', async () => {
    const run = sendProductionReportJob(deps);
    expect(() => run({ installationId: 11, teamName: '', date: '2026-11-24' })).toThrow();
    expect(() => run({ installationId: 11, teamName: 'Alpha', date: '24/11' })).toThrow();
    await expect(
      run({ installationId: 11, teamName: 'Alpha', date: '2026-11-24' }),
    ).resolves.toBeUndefined();
  });

  test('postReportItemJob rejects a malformed payload and passes a valid one', async () => {
    const run = postReportItemJob(deps);
    const valid = { installationId: 11, teamName: 'Alpha', date: '2026-11-24', index: 0, thread };
    expect(() => run({ ...valid, index: -1 })).toThrow();
    expect(() => run({ ...valid, thread: { channel: '', id: 't1' } })).toThrow();
    await expect(run(valid)).resolves.toBeUndefined();
  });
});
