import { describe, expect, test } from 'bun:test';
import { upsertInstallation } from '@standcast/db';
import type { CheckRunInput, ConfigRevision } from '@standcast/github';
import type { WorkerDeps } from '@standcast/orchestrator';
import { db, useCleanDb } from '../../../packages/db/test/setup';
import { validateConfigJob } from '../src/jobs/validate-config';

useCleanDb();

const INST = 11;

const VALID = `teams:
  - name: Alpha
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [alice]
    members: [alice]
    chat: { provider: slack, channel: "#alpha" }
`;

function harness() {
  const revisions: (ConfigRevision | undefined)[] = [];
  const checkRuns: CheckRunInput[] = [];
  const deps = {
    db,
    github: {
      installationOctokit: async () => ({}),
      fetchConfigSource: async (_o: unknown, _owner: string, revision?: ConfigRevision) => {
        revisions.push(revision);
        return {
          found: true,
          source: VALID,
          repository: { name: revision?.repo, defaultBranch: 'main', private: true },
        };
      },
      createCheckRun: async (_o: unknown, input: CheckRunInput) => {
        checkRuns.push(input);
      },
    },
  } as unknown as WorkerDeps;
  return { run: validateConfigJob(deps), revisions, checkRuns };
}

describe('validateConfigJob', () => {
  test('validates in the repository named by the job', async () => {
    await upsertInstallation(db, { id: INST, accountLogin: 'acme', accountType: 'Organization' });
    const { run, revisions, checkRuns } = harness();
    await run({ installationId: INST, owner: 'acme', repo: '.github-private', headSha: 'abc' });
    expect(revisions).toEqual([{ repo: '.github-private', ref: 'abc' }]);
    expect(checkRuns.map((check) => check.repo)).toEqual(['.github-private']);
  });

  test('a job enqueued before the repository was carried validates .github', async () => {
    await upsertInstallation(db, { id: INST, accountLogin: 'acme', accountType: 'Organization' });
    const { run, revisions } = harness();
    await run({ installationId: INST, owner: 'acme', headSha: 'abc' });
    expect(revisions).toEqual([{ repo: '.github', ref: 'abc' }]);
  });

  test('rejects a repository that is not a config repository', async () => {
    const { run, revisions } = harness();
    await expect(
      run({ installationId: INST, owner: 'acme', repo: 'website', headSha: 'abc' }),
    ).rejects.toThrow();
    expect(revisions).toEqual([]);
  });
});
