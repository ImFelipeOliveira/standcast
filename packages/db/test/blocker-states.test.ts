import { describe, expect, test } from 'bun:test';
import {
  getBlockerState,
  isBlockerStateCurrent,
  listResolvedBlockerStates,
  setBlockerStateResolved,
  upsertBlockerState,
  upsertDaily,
  upsertInstallation,
  upsertMember,
} from '../src';
import { db, useCleanDb } from './setup';

useCleanDb();

const INST = 100;

async function seed() {
  await upsertInstallation(db, { id: INST, accountLogin: 'acme', accountType: 'Organization' });
  await upsertInstallation(db, { id: 200, accountLogin: 'other', accountType: 'Organization' });
  const ana = await upsertMember(db, { githubUserId: 1, login: 'Ana', email: null });
  const bob = await upsertMember(db, { githubUserId: 2, login: 'Bob', email: null });
  return { ana, bob };
}

const ref = { kind: 'pull_request' as const, url: 'https://github.com/acme/api/pull/1' };

describe('blocker states', () => {
  test('first sighting opens the blocker', async () => {
    const { ana } = await seed();
    const row = await upsertBlockerState(db, {
      installationId: INST,
      authorMemberId: ana.id,
      blockerId: 'b1',
      text: 'waiting review',
      ref,
      date: '2026-10-28',
    });
    expect(row).toMatchObject({
      blockerId: 'b1',
      text: 'waiting review',
      ref,
      openedOn: '2026-10-28',
      lastSeenOn: '2026-10-28',
      resolvedAt: null,
      resolvedByMemberId: null,
    });
  });

  test('resubmission keeps the opening date and updates text', async () => {
    const { ana } = await seed();
    const base = { installationId: INST, authorMemberId: ana.id, blockerId: 'b1', ref: null };
    const first = await upsertBlockerState(db, { ...base, text: 'a', date: '2026-10-28' });
    const second = await upsertBlockerState(db, {
      ...base,
      text: 'b',
      ref,
      date: '2026-10-30',
    });
    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({
      text: 'b',
      ref,
      openedOn: '2026-10-28',
      lastSeenOn: '2026-10-30',
    });
  });

  test('resolved blocker that comes back reopens', async () => {
    const { ana, bob } = await seed();
    const base = { installationId: INST, authorMemberId: ana.id, blockerId: 'b1', ref: null };
    const first = await upsertBlockerState(db, { ...base, text: 'a', date: '2026-10-28' });
    const at = new Date('2026-10-29T12:00:00Z');
    expect(
      await setBlockerStateResolved(db, INST, first.id, { at, by: bob.id, on: '2026-10-29' }),
    ).toBe(true);
    const resolved = await getBlockerState(db, INST, first.id);
    expect(resolved?.resolvedAt?.toISOString()).toBe(at.toISOString());
    expect(resolved?.resolvedByMemberId).toBe(bob.id);
    expect(resolved?.resolvedOn).toBe('2026-10-29');
    const again = await upsertBlockerState(db, { ...base, text: 'a', date: '2026-10-31' });
    expect(again).toMatchObject({
      id: first.id,
      openedOn: '2026-10-31',
      lastSeenOn: '2026-10-31',
      resolvedAt: null,
      resolvedByMemberId: null,
      resolvedOn: null,
    });
  });

  test('a resubmit on the day it was resolved keeps it resolved', async () => {
    const { ana, bob } = await seed();
    const base = { installationId: INST, authorMemberId: ana.id, blockerId: 'b1', ref: null };
    const first = await upsertBlockerState(db, { ...base, text: 'a', date: '2026-10-28' });
    const at = new Date('2026-10-28T15:00:00Z');
    await setBlockerStateResolved(db, INST, first.id, { at, by: bob.id, on: '2026-10-28' });
    const again = await upsertBlockerState(db, { ...base, text: 'b', ref, date: '2026-10-28' });
    expect(again).toMatchObject({
      id: first.id,
      text: 'b',
      ref,
      openedOn: '2026-10-28',
      lastSeenOn: '2026-10-28',
      resolvedByMemberId: bob.id,
      resolvedOn: '2026-10-28',
    });
    expect(again.resolvedAt?.toISOString()).toBe(at.toISOString());
  });

  test('the first daily on the day it was resolved keeps it resolved', async () => {
    const { ana, bob } = await seed();
    const base = { installationId: INST, authorMemberId: ana.id, blockerId: 'b1', ref: null };
    const first = await upsertBlockerState(db, { ...base, text: 'a', date: '2026-10-27' });
    const at = new Date('2026-10-28T11:00:00Z');
    await setBlockerStateResolved(db, INST, first.id, { at, by: bob.id, on: '2026-10-28' });
    const again = await upsertBlockerState(db, { ...base, text: 'a', date: '2026-10-28' });
    expect(again).toMatchObject({
      openedOn: '2026-10-27',
      lastSeenOn: '2026-10-28',
      resolvedByMemberId: bob.id,
      resolvedOn: '2026-10-28',
    });
    expect(again.resolvedAt?.toISOString()).toBe(at.toISOString());
  });

  test('the same blocker id is separate per author', async () => {
    const { ana, bob } = await seed();
    const base = {
      installationId: INST,
      blockerId: 'b1',
      text: 'a',
      ref: null,
      date: '2026-10-28',
    };
    const a = await upsertBlockerState(db, { ...base, authorMemberId: ana.id });
    const b = await upsertBlockerState(db, { ...base, authorMemberId: bob.id });
    expect(a.id).not.toBe(b.id);
  });

  test('other installation id is not found', async () => {
    const { ana } = await seed();
    const row = await upsertBlockerState(db, {
      installationId: INST,
      authorMemberId: ana.id,
      blockerId: 'b1',
      text: 'a',
      ref: null,
      date: '2026-10-28',
    });
    expect(await getBlockerState(db, 200, row.id)).toBeNull();
    expect(await setBlockerStateResolved(db, 200, row.id, null)).toBe(false);
    expect((await getBlockerState(db, INST, row.id))?.resolvedAt).toBeNull();
  });
});

describe('resolved blocker states', () => {
  test('lists blockers resolved since a date, newest first, with who resolved them', async () => {
    const { ana, bob } = await seed();
    const open = async (blockerId: string, date: string) =>
      upsertBlockerState(db, {
        installationId: INST,
        authorMemberId: ana.id,
        blockerId,
        text: blockerId,
        ref: null,
        date,
      });
    const old = await open('old', '2026-10-01');
    const recent = await open('recent', '2026-10-20');
    const newest = await open('newest', '2026-10-25');
    await open('still-open', '2026-10-26');
    await setBlockerStateResolved(db, INST, old.id, {
      by: bob.id,
      at: new Date('2026-10-05T12:00:00Z'),
      on: '2026-10-05',
    });
    await setBlockerStateResolved(db, INST, recent.id, {
      by: bob.id,
      at: new Date('2026-10-21T12:00:00Z'),
      on: '2026-10-21',
    });
    await setBlockerStateResolved(db, INST, newest.id, {
      by: ana.id,
      at: new Date('2026-10-27T12:00:00Z'),
      on: '2026-10-27',
    });
    const rows = await listResolvedBlockerStates(db, INST, [ana.id], '2026-10-14');
    expect(rows.map((row) => [row.blockerId, row.authorLogin, row.resolvedByLogin])).toEqual([
      ['newest', 'Ana', 'Ana'],
      ['recent', 'Ana', 'Bob'],
    ]);
    expect(await listResolvedBlockerStates(db, INST, [], '2026-10-14')).toEqual([]);
    expect(await listResolvedBlockerStates(db, 200, [ana.id], '2026-10-14')).toEqual([]);
  });

  test('a resolved blocker is current only while it is in the author latest daily', async () => {
    const { ana } = await seed();
    const daily = (date: string) =>
      upsertDaily(db, {
        installationId: INST,
        memberId: ana.id,
        date,
        payload: { org: 'acme', yesterday: [], today: [], blockers: [], support: [] },
        submittedAt: new Date(`${date}T12:00:00Z`),
      });
    const row = await upsertBlockerState(db, {
      installationId: INST,
      authorMemberId: ana.id,
      blockerId: 'b1',
      text: 'waiting review',
      ref: null,
      date: '2026-10-28',
    });
    expect(await isBlockerStateCurrent(db, INST, row.id)).toBe(false);
    await daily('2026-10-28');
    await setBlockerStateResolved(db, INST, row.id, {
      by: ana.id,
      at: new Date('2026-10-28T13:00:00Z'),
      on: '2026-10-28',
    });
    expect(await isBlockerStateCurrent(db, INST, row.id)).toBe(true);
    expect((await listResolvedBlockerStates(db, INST, [ana.id], '2026-10-14'))[0]?.current).toBe(
      true,
    );
    await daily('2026-10-29');
    expect(await isBlockerStateCurrent(db, INST, row.id)).toBe(false);
    expect(await isBlockerStateCurrent(db, 200, row.id)).toBe(false);
    expect((await listResolvedBlockerStates(db, INST, [ana.id], '2026-10-14'))[0]?.current).toBe(
      false,
    );
  });
});
