import { describe, expect, test } from 'bun:test';
import {
  getBlockerState,
  setBlockerStateResolved,
  upsertBlockerState,
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
    expect(await setBlockerStateResolved(db, INST, first.id, { at, by: bob.id })).toBe(true);
    const resolved = await getBlockerState(db, INST, first.id);
    expect(resolved?.resolvedAt?.toISOString()).toBe(at.toISOString());
    expect(resolved?.resolvedByMemberId).toBe(bob.id);
    const again = await upsertBlockerState(db, { ...base, text: 'a', date: '2026-10-31' });
    expect(again).toMatchObject({
      id: first.id,
      openedOn: '2026-10-31',
      lastSeenOn: '2026-10-31',
      resolvedAt: null,
      resolvedByMemberId: null,
    });
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
