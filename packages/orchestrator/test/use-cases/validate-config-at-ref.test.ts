import { describe, expect, spyOn, test } from 'bun:test';
import { getInstallation } from '@standcast/db';
import { db, useCleanDb } from '../../../db/test/setup';
import { enqueueLoadConfig, loadConfig, validateConfigAtRef } from '../../src';
import { config, type FakeOptions, fakeDeps, found, INST, seedOrg } from './fakes';

useCleanDb();

const VALID = `teams:
  - name: Alpha
    language: pt-BR
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [alice]
    members: [alice, bob]
    chat: { provider: slack, channel: "#alpha" }
`;

const INVALID_DIGEST = `teams:
  - name: Alpha
    language: pt-BR
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "25:99"
    managers: [alice]
    members: [alice, bob]
    chat: { provider: slack, channel: "#alpha" }
`;

const MISSING_KEY = `teams:
  - name: Alpha
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    managers: [alice]
    members: [alice, bob]
    chat: { provider: slack, channel: "#alpha" }
`;

const WITH_OVERRIDES = `teams:
  - name: Alpha
    language: en
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [alice]
    members: ["@acme/alpha"]
    chat: { provider: slack, channel: "#alpha" }
members:
  alice:
    linear: alice@acme.com
`;

const job = { installationId: INST, owner: 'acme', repo: '.github' as const, headSha: 'abc123' };

async function run(source: FakeOptions['source'], extra: FakeOptions = {}, overrides = {}) {
  const fake = fakeDeps({ source, ...extra });
  const result = await validateConfigAtRef(fake.deps, { ...job, ...overrides });
  return { ...fake, result };
}

describe('validateConfigAtRef', () => {
  test('an invalid digest_at fails with an annotation on its line and the path in the summary', async () => {
    await seedOrg();
    const { result, calls } = await run(found(INVALID_DIGEST));
    expect(result).toBe('failure');
    expect(calls.configRefs).toEqual(['abc123']);
    expect(calls.createCheckRun).toHaveLength(1);
    const run0 = calls.createCheckRun[0];
    expect(run0?.owner).toBe('acme');
    expect(run0?.repo).toBe('.github');
    expect(run0?.headSha).toBe('abc123');
    expect(run0?.name).toBe('Standcast config');
    expect(run0?.conclusion).toBe('failure');
    expect(run0?.title).toBe('standcast.yml is invalid');
    expect(run0?.summary).toContain('teams.0.digest_at');
    expect(run0?.summary).toContain('1 error(s) found');
    expect(run0?.annotations).toHaveLength(1);
    expect(run0?.annotations[0]?.path).toBe('standcast.yml');
    expect(run0?.annotations[0]?.line).toBe(6);
    expect(run0?.annotations[0]?.message).toContain('teams.0.digest_at');
  });

  test('a missing key is annotated on its parent, and unparseable yaml on line 1', async () => {
    await seedOrg();
    const missing = await run(found(MISSING_KEY));
    expect(missing.result).toBe('failure');
    const annotation = missing.calls.createCheckRun[0]?.annotations.find((a) =>
      a.message.startsWith('teams.0.digest_at'),
    );
    expect(annotation?.line).toBe(2);
    const broken = await run(found('teams: ['));
    expect(broken.result).toBe('failure');
    expect(broken.calls.createCheckRun[0]?.annotations.map((a) => a.line)).toEqual([1]);
  });

  test('a valid config creates a success check run in the team language', async () => {
    await seedOrg();
    const { result, calls } = await run(found(VALID));
    expect(result).toBe('success');
    expect(calls.createCheckRun).toEqual([
      {
        owner: 'acme',
        repo: '.github',
        headSha: 'abc123',
        name: 'Standcast config',
        conclusion: 'success',
        title: 'standcast.yml válido',
        summary: 'standcast.yml válido',
        annotations: [],
      },
    ]);
  });

  test('a missing file is skipped without a check run', async () => {
    await seedOrg();
    const { result, calls } = await run({ found: false, reason: 'no_file', repository: null });
    expect(result).toBe('skipped');
    expect(calls.createCheckRun).toEqual([]);
  });

  test('no access to the config repo is logged and skipped', async () => {
    await seedOrg();
    const spy = spyOn(console, 'error').mockImplementation(() => {});
    const { result, calls } = await run({ found: false, reason: 'no_access', repository: null });
    const logged = spy.mock.calls;
    spy.mockRestore();
    expect(result).toBe('skipped');
    expect(calls.createCheckRun).toEqual([]);
    expect(logged).toEqual([
      [
        'config validation skipped',
        {
          name: 'ConfigAccessError',
          code: 'no_access',
          message: 'no access to the config repository',
        },
      ],
    ]);
  });

  test('a PR that does not touch standcast.yml is skipped without check-run calls', async () => {
    await seedOrg();
    const { result, calls } = await run(
      found(VALID),
      { files: { 'acme/.github#4': ['README.md'] } },
      { pullNumber: 4 },
    );
    expect(result).toBe('skipped');
    expect(calls.listPullRequestFiles).toEqual(['acme/.github#4']);
    expect(calls.config).toEqual([]);
    expect(calls.createCheckRun).toEqual([]);
  });

  test('a PR that touches standcast.yml is validated', async () => {
    await seedOrg();
    const { result, calls } = await run(
      found(VALID),
      { files: { 'acme/.github#4': ['standcast.yml'] } },
      { pullNumber: 4 },
    );
    expect(result).toBe('success');
    expect(calls.createCheckRun).toHaveLength(1);
  });

  test('an unknown installation or a foreign owner is skipped', async () => {
    const unknown = await run(found(VALID));
    expect(unknown.result).toBe('skipped');
    await seedOrg();
    const foreign = await run(found(VALID), {}, { owner: 'evil' });
    expect(foreign.result).toBe('skipped');
    expect(foreign.calls.config).toEqual([]);
    expect(foreign.calls.createCheckRun).toEqual([]);
  });

  test('validates the file in the repository that changed and creates the check run there', async () => {
    await seedOrg();
    const { result, calls } = await run(
      found(VALID, { name: '.github-private' }),
      { files: { 'acme/.github-private#7': ['standcast.yml'] } },
      { repo: '.github-private', pullNumber: 7 },
    );
    expect(result).toBe('success');
    expect(calls.listPullRequestFiles).toEqual(['acme/.github-private#7']);
    expect(calls.configRepos).toEqual(['.github-private']);
    expect(calls.configRefs).toEqual(['abc123']);
    expect(calls.createCheckRun[0]?.repo).toBe('.github-private');
  });

  test('identity overrides in a public repository fail on the members key', async () => {
    await seedOrg();
    const { result, calls } = await run(found(WITH_OVERRIDES, { private: false }));
    expect(result).toBe('failure');
    const check = calls.createCheckRun[0];
    expect(check?.conclusion).toBe('failure');
    expect(check?.title).toBe('standcast.yml exposes personal data');
    expect(check?.summary).toContain('The .github repository is public');
    expect(check?.summary).toContain('.github-private');
    expect(check?.summary).toContain('standcast login');
    expect(check?.annotations).toEqual([
      { path: 'standcast.yml', line: 10, message: check?.summary ?? '' },
    ]);
  });

  test('the public repository failure follows the team language', async () => {
    await seedOrg();
    const source = WITH_OVERRIDES.replace('language: en', 'language: pt-BR');
    const { calls } = await run(found(source, { private: false }));
    expect(calls.createCheckRun[0]?.title).toBe('standcast.yml expõe dados pessoais');
    expect(calls.createCheckRun[0]?.summary).toContain('O repositório .github é público');
  });

  test('identity overrides in a private repository pass', async () => {
    await seedOrg();
    const { result, calls } = await run(found(WITH_OVERRIDES, { private: true }));
    expect(result).toBe('success');
    expect(calls.createCheckRun[0]?.annotations).toEqual([]);
  });

  test('a public repository without identity overrides passes', async () => {
    await seedOrg();
    const source = WITH_OVERRIDES.replace(
      /members:\n {2}alice:\n {4}linear: .*\n$/,
      'members:\n  alice: {}\n',
    );
    const { result } = await run(found(source, { private: false }));
    expect(result).toBe('success');
  });

  test('a check run failure is logged and rethrown', async () => {
    await seedOrg();
    const spy = spyOn(console, 'error').mockImplementation(() => {});
    const fake = fakeDeps({
      source: found(VALID),
      checks: { createError: Object.assign(new Error('rate limited'), { code: 'E403' }) },
    });
    await expect(validateConfigAtRef(fake.deps, job)).rejects.toThrow('rate limited');
    const logged = JSON.stringify(spy.mock.calls);
    spy.mockRestore();
    expect(logged).toContain('rate limited');
    expect(logged).toContain('E403');
  });

  test('after an invalid push the operational config is still the previous one', async () => {
    const previous = config();
    await seedOrg(previous);
    const fake = fakeDeps({ source: found(INVALID_DIGEST) });
    expect(await validateConfigAtRef(fake.deps, job)).toBe('failure');
    await loadConfig(fake.deps, { installationId: INST, owner: 'acme' });
    const row = await getInstallation(db, INST);
    expect(row?.status).toBe('invalid');
    expect(row?.config).toEqual(previous);
  });
});

describe('loadConfig', () => {
  test('loads the installation config', async () => {
    await seedOrg(null);
    const fake = fakeDeps({ source: found(VALID) });
    await loadConfig(fake.deps, { installationId: INST, owner: 'acme' });
    expect((await getInstallation(db, INST))?.status).toBe('configured');
    expect(fake.calls.configRefs).toEqual([undefined]);
  });

  test('a load enqueued while one is active is kept, and a second queued one is dropped', async () => {
    await seedOrg(null);
    const fake = fakeDeps({ source: found(VALID) });
    const loadJob = { installationId: INST, owner: 'acme' };
    let runs = 0;
    await fake.queue.work(
      'load-config',
      async (data) => {
        runs++;
        if (runs === 1) {
          await enqueueLoadConfig(fake.deps, loadJob);
          await enqueueLoadConfig(fake.deps, loadJob);
        }
        await loadConfig(fake.deps, data as typeof loadJob);
      },
      { policies: ['stately'] },
    );
    await enqueueLoadConfig(fake.deps, loadJob);
    await fake.queue.drain();
    expect(runs).toBe(2);
    expect(fake.calls.config).toEqual(['acme', 'acme']);
  });

  test('an unknown installation or a foreign owner is ignored', async () => {
    const fake = fakeDeps({ source: found(VALID) });
    await loadConfig(fake.deps, { installationId: INST, owner: 'acme' });
    await seedOrg(null);
    await loadConfig(fake.deps, { installationId: INST, owner: 'evil' });
    expect(fake.calls.config).toEqual([]);
  });
});
