import { describe, expect, test } from 'bun:test';
import {
  awayLogins,
  cancelAwayPeriod,
  createAwayPeriod,
  getAwayPeriod,
  listAwayPeriods,
  upsertInstallation,
  upsertMember,
} from '../src';
import { db, useCleanDb } from './setup';

useCleanDb();

const INST = 100;
const OTHER = 200;

async function seed() {
  await upsertInstallation(db, { id: INST, accountLogin: 'acme', accountType: 'Organization' });
  await upsertInstallation(db, { id: OTHER, accountLogin: 'other', accountType: 'Organization' });
  const ana = await upsertMember(db, { githubUserId: 1, login: 'Ana', email: null });
  return { ana };
}

async function create(by: string, login: string, from: string, until: string) {
  return createAwayPeriod(db, {
    installationId: INST,
    login,
    from,
    until,
    createdBy: by,
  });
}

describe('away periods', () => {
  test('awayLogins covers from and until inclusively', async () => {
    const { ana } = await seed();
    await create(ana.id, 'Alice', '2026-12-01', '2026-12-05');
    const at = (d: string) => awayLogins(db, INST, ['alice', 'bob'], d);
    expect(await at('2026-12-01')).toEqual(new Set(['alice']));
    expect(await at('2026-12-05')).toEqual(new Set(['alice']));
    expect(await at('2026-11-30')).toEqual(new Set());
    expect(await at('2026-12-06')).toEqual(new Set());
  });

  test('awayLogins with no logins is empty', async () => {
    expect(await awayLogins(db, INST, [], '2026-12-01')).toEqual(new Set());
  });

  test('logins are matched case-insensitively', async () => {
    const { ana } = await seed();
    const row = await create(ana.id, 'Alice', '2026-12-01', '2026-12-05');
    expect(row).not.toBe('overlap');
    if (row !== 'overlap') expect(row.login).toBe('alice');
    expect(await awayLogins(db, INST, ['ALICE'], '2026-12-02')).toEqual(new Set(['alice']));
  });

  test('an overlapping active period is refused and a cancelled one is not', async () => {
    const { ana } = await seed();
    const first = await create(ana.id, 'alice', '2026-12-01', '2026-12-05');
    if (first === 'overlap') throw new Error('unexpected');
    expect(await create(ana.id, 'alice', '2026-12-04', '2026-12-10')).toBe('overlap');
    expect(await create(ana.id, 'alice', '2026-12-05', '2026-12-10')).toBe('overlap');
    expect(typeof (await create(ana.id, 'alice', '2026-12-06', '2026-12-10'))).toBe('object');
    expect(typeof (await create(ana.id, 'bob', '2026-12-04', '2026-12-10'))).toBe('object');
    await cancelAwayPeriod(db, { installationId: INST, id: first.id, cancelledBy: ana.id });
    expect(typeof (await create(ana.id, 'alice', '2026-12-04', '2026-12-05'))).toBe('object');
  });

  test('concurrent creates of the same period yield one row', async () => {
    const { ana } = await seed();
    const r = await Promise.all([
      create(ana.id, 'alice', '2026-12-01', '2026-12-05'),
      create(ana.id, 'alice', '2026-12-01', '2026-12-05'),
    ]);
    expect(r.filter((x) => x === 'overlap')).toHaveLength(1);
  });

  test('cancel is compare-and-swap', async () => {
    const { ana } = await seed();
    const row = await create(ana.id, 'alice', '2026-12-01', '2026-12-05');
    if (row === 'overlap') throw new Error('unexpected');
    const r = await Promise.all([
      cancelAwayPeriod(db, { installationId: INST, id: row.id, cancelledBy: ana.id }),
      cancelAwayPeriod(db, { installationId: INST, id: row.id, cancelledBy: ana.id }),
    ]);
    expect(r.filter((x) => x !== null)).toHaveLength(1);
    const got = await getAwayPeriod(db, INST, row.id);
    expect(got?.cancelledBy).toBe(ana.id);
    expect(got?.cancelledAt).toBeInstanceOf(Date);
  });

  test('another installation never sees the period', async () => {
    const { ana } = await seed();
    const row = await create(ana.id, 'alice', '2026-12-01', '2026-12-05');
    if (row === 'overlap') throw new Error('unexpected');
    expect(await awayLogins(db, OTHER, ['alice'], '2026-12-02')).toEqual(new Set());
    expect(await getAwayPeriod(db, OTHER, row.id)).toBeNull();
    expect(await listAwayPeriods(db, OTHER, 'alice', '2026-11-01')).toEqual([]);
    expect(
      await cancelAwayPeriod(db, { installationId: OTHER, id: row.id, cancelledBy: ana.id }),
    ).toBeNull();
  });

  test('listAwayPeriods hides past and cancelled periods', async () => {
    const { ana } = await seed();
    await create(ana.id, 'alice', '2026-11-01', '2026-11-05');
    const cancelled = await create(ana.id, 'alice', '2026-12-01', '2026-12-05');
    const kept2 = await create(ana.id, 'alice', '2027-01-10', '2027-01-12');
    const kept1 = await create(ana.id, 'alice', '2026-11-20', '2026-11-25');
    if (cancelled === 'overlap' || kept1 === 'overlap' || kept2 === 'overlap') throw new Error('x');
    await cancelAwayPeriod(db, { installationId: INST, id: cancelled.id, cancelledBy: ana.id });
    const rows = await listAwayPeriods(db, INST, 'Alice', '2026-11-16');
    expect(rows.map((r) => r.id)).toEqual([kept1.id, kept2.id]);
  });
});
