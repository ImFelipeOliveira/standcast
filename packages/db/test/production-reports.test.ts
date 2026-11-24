import { describe, expect, test } from 'bun:test';
import {
  deleteProductionDataBefore,
  getLlmApiKey,
  getLlmSettings,
  getProductionReport,
  getTeamReport,
  listProductionBranches,
  listProductionPullRequests,
  listProductionReportsSince,
  markLlmKeyRejected,
  recordProductionPullRequests,
  saveProductionReport,
  upsertInstallation,
  upsertLlmSettings,
  upsertTeamReport,
} from '../src';
import { db, useCleanDb } from './setup';

useCleanDb();

const KEY = new Uint8Array(32).fill(5);
const INST = 21;
const T0 = new Date('2026-11-01T10:00:00Z');
const T1 = new Date('2026-11-08T10:00:00Z');

async function seed() {
  await upsertInstallation(db, { id: INST, accountLogin: 'acme', accountType: 'Organization' });
}

const teamInput = (over: Partial<Parameters<typeof upsertTeamReport>[1]> = {}) => ({
  installationId: INST,
  teamName: 'Sales',
  enabled: true,
  channel: '#sales',
  weekday: 'fri' as const,
  time: '09:00',
  productionBranch: 'main',
  ...over,
});

const pr = (number: number, reachedAt: Date, branch = 'main', recordedAt?: Date) => ({
  repository: 'acme/app',
  number,
  url: `https://github.com/acme/app/pull/${number}`,
  authorLogin: 'dev',
  branch,
  reachedAt,
  ...(recordedAt ? { recordedAt } : {}),
});

describe('production report repo', () => {
  test('llm key is encrypted, last four shown, kept on model change, rejection cleared by a new key', async () => {
    await seed();
    const row = await upsertLlmSettings(
      db,
      {
        installationId: INST,
        provider: 'deepseek',
        model: 'deepseek-chat',
        apiKey: 'sk-secretabcd',
      },
      KEY,
    );
    expect(row.keyLast4).toBe('abcd');
    expect(JSON.stringify(row)).not.toContain('secret');
    expect(await getLlmApiKey(db, INST, KEY)).toBe('sk-secretabcd');
    await markLlmKeyRejected(db, INST, T0);
    await upsertLlmSettings(
      db,
      { installationId: INST, provider: 'deepseek', model: 'deepseek-reasoner' },
      KEY,
    );
    const kept = await getLlmSettings(db, INST);
    expect(kept?.rejectedAt).not.toBeNull();
    expect(kept?.model).toBe('deepseek-reasoner');
    expect(await getLlmApiKey(db, INST, KEY)).toBe('sk-secretabcd');
    await upsertLlmSettings(
      db,
      { installationId: INST, provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-new1234' },
      KEY,
    );
    const fresh = await getLlmSettings(db, INST);
    expect(fresh?.rejectedAt).toBeNull();
    expect(fresh?.keyLast4).toBe('1234');
  });

  test('first llm save without a key throws', async () => {
    await seed();
    await expect(
      upsertLlmSettings(db, { installationId: INST, provider: 'deepseek', model: 'm' }, KEY),
    ).rejects.toThrow();
  });

  test('team report cutoff starts at creation and resets only when re-enabled', async () => {
    await seed();
    const created = await upsertTeamReport(db, teamInput(), T0);
    expect(created.cutoffAt).toEqual(T0);
    const edited = await upsertTeamReport(db, teamInput({ channel: '#other' }), T1);
    expect(edited.cutoffAt).toEqual(T0);
    expect(edited.channel).toBe('#other');
    await upsertTeamReport(db, teamInput({ enabled: false }), T1);
    expect((await getTeamReport(db, INST, 'Sales'))?.cutoffAt).toEqual(T0);
    const again = await upsertTeamReport(db, teamInput({ enabled: true }), T1);
    expect(again.cutoffAt).toEqual(T1);
  });

  test('production branches lists distinct branches of enabled reports only', async () => {
    await seed();
    await upsertTeamReport(db, teamInput({ teamName: 'A', productionBranch: 'main' }), T0);
    await upsertTeamReport(db, teamInput({ teamName: 'B', productionBranch: 'main' }), T0);
    await upsertTeamReport(db, teamInput({ teamName: 'C', productionBranch: 'release' }), T0);
    await upsertTeamReport(
      db,
      teamInput({ teamName: 'D', productionBranch: 'off', enabled: false }),
      T0,
    );
    expect((await listProductionBranches(db, INST)).sort()).toEqual(['main', 'release']);
  });

  test('recording the same pull request twice keeps the first reached_at', async () => {
    await seed();
    expect(await recordProductionPullRequests(db, INST, [pr(1, T0)])).toBe(1);
    expect(await recordProductionPullRequests(db, INST, [pr(1, T1), pr(2, T1)])).toBe(1);
    const rows = await listProductionPullRequests(db, {
      installationId: INST,
      branch: 'main',
      after: new Date(0),
      upTo: new Date(Date.now() + 86_400_000),
    });
    expect(rows.map((r) => [r.number, r.reachedAt])).toEqual([
      [1, T0],
      [2, T1],
    ]);
    expect(Math.abs((rows[0]?.recordedAt.getTime() ?? 0) - Date.now())).toBeLessThan(60_000);
  });

  test('a pull request is not a revert unless recorded as one', async () => {
    await seed();
    await recordProductionPullRequests(db, INST, [pr(1, T0), { ...pr(2, T0), isRevert: true }]);
    const rows = await listProductionPullRequests(db, {
      installationId: INST,
      branch: 'main',
      after: new Date(0),
      upTo: new Date(Date.now() + 86_400_000),
    });
    expect(rows.map((r) => [r.number, r.isRevert])).toEqual([
      [1, false],
      [2, true],
    ]);
  });

  test('listProductionPullRequests windows on recorded_at, excludes after, includes upTo, oldest reached first', async () => {
    await seed();
    const mid = new Date('2026-11-05T10:00:00Z');
    const old = new Date('2026-10-20T10:00:00Z');
    await recordProductionPullRequests(db, INST, [
      pr(1, mid, 'main', T0),
      pr(2, mid, 'main', T1),
      pr(3, old, 'main', T1),
      pr(4, mid, 'other', mid),
      pr(5, mid, 'main', new Date('2026-11-08T10:00:01Z')),
    ]);
    const rows = await listProductionPullRequests(db, {
      installationId: INST,
      branch: 'main',
      after: T0,
      upTo: T1,
    });
    expect(rows.map((r) => [r.number, r.recordedAt])).toEqual([
      [3, T1],
      [2, T1],
    ]);
  });

  test('saveProductionReport never overwrites an existing report', async () => {
    await seed();
    const base = {
      teamName: 'Sales',
      date: '2026-11-06',
      windowStart: T0,
      windowEnd: T1,
    };
    const first = await saveProductionReport(db, INST, {
      ...base,
      items: [{ kind: 'new', title: 'one', liveSince: '2026-11-05', links: [] }],
    });
    const second = await saveProductionReport(db, INST, { ...base, items: [] });
    expect(second.items).toEqual(first.items);
    expect(first.windowStart).toEqual(T0);
    expect((await getProductionReport(db, INST, 'Sales', '2026-11-06'))?.items).toEqual(
      first.items,
    );
    expect(await getProductionReport(db, INST, 'Sales', '2026-11-07')).toBeNull();
    expect(await listProductionReportsSince(db, INST, 'Sales', T0)).toHaveLength(1);
    expect(
      await listProductionReportsSince(db, INST, 'Sales', new Date('2099-01-01T00:00:00Z')),
    ).toHaveLength(0);
  });

  test('deleteProductionDataBefore removes old rows only', async () => {
    await seed();
    await recordProductionPullRequests(db, INST, [pr(1, T0), pr(2, T1)]);
    await saveProductionReport(db, INST, {
      teamName: 'Sales',
      date: '2026-11-06',
      windowStart: T0,
      windowEnd: T1,
      items: [],
    });
    const cutoff = new Date('2026-11-05T00:00:00Z');
    expect(await deleteProductionDataBefore(db, cutoff)).toEqual({ pullRequests: 1, reports: 0 });
    expect(await deleteProductionDataBefore(db, new Date(Date.now() + 86_400_000))).toEqual({
      pullRequests: 1,
      reports: 1,
    });
  });
});
