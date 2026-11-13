import { describe, expect, test } from 'bun:test';
import {
  getBlockerState,
  listLatestDailies,
  listResolvedBlockerStates,
  listStaleBlockerStates,
  markBlockerStateAlerted,
  reopenBlockerState,
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

  test('latest dailies give each author their newest daily only', async () => {
    const { ana, bob } = await seed();
    const payload = { org: 'acme', yesterday: [], today: [], blockers: [], support: [] };
    for (const [memberId, date] of [
      [ana.id, '2026-10-27'],
      [ana.id, '2026-10-28'],
      [bob.id, '2026-10-26'],
    ] as const) {
      await upsertDaily(db, {
        installationId: INST,
        memberId,
        date,
        payload: { ...payload, blockers: [{ text: date }] },
        submittedAt: new Date(`${date}T12:00:00.123Z`),
      });
    }
    const latest = await listLatestDailies(db, INST, [ana.id, bob.id]);
    expect(
      [...latest.entries()].map(([id, d]) => [
        id,
        d.date,
        d.submittedAt.toISOString(),
        d.payload.blockers,
      ]),
    ).toEqual(
      expect.arrayContaining([
        [ana.id, '2026-10-28', '2026-10-28T12:00:00.123Z', [{ text: '2026-10-28' }]],
        [bob.id, '2026-10-26', '2026-10-26T12:00:00.123Z', [{ text: '2026-10-26' }]],
      ]),
    );
    expect(latest.size).toBe(2);
    expect((await listLatestDailies(db, 200, [ana.id])).size).toBe(0);
    expect((await listLatestDailies(db, INST, [])).size).toBe(0);
  });

  test('reopen succeeds only while the daily it was checked against is still the latest', async () => {
    const { ana } = await seed();
    const payload = { org: 'acme', yesterday: [], today: [], blockers: [], support: [] };
    const submit = (date: string, at: string) =>
      upsertDaily(db, {
        installationId: INST,
        memberId: ana.id,
        date,
        payload,
        submittedAt: new Date(at),
      });
    const row = await upsertBlockerState(db, {
      installationId: INST,
      authorMemberId: ana.id,
      blockerId: 'b1',
      text: 'waiting review',
      ref: null,
      date: '2026-10-28',
    });
    const resolve = () =>
      setBlockerStateResolved(db, INST, row.id, {
        by: ana.id,
        at: new Date('2026-10-28T13:00:00Z'),
        on: '2026-10-28',
      });
    await submit('2026-10-28', '2026-10-28T12:00:00.123Z');
    await resolve();
    const checked = { date: '2026-10-28', submittedAt: new Date('2026-10-28T12:00:00.123Z') };
    expect(await reopenBlockerState(db, 200, row.id, checked)).toBe(false);
    await submit('2026-10-28', '2026-10-28T14:00:00Z');
    expect(await reopenBlockerState(db, INST, row.id, checked)).toBe(false);
    expect((await getBlockerState(db, INST, row.id))?.resolvedAt).not.toBeNull();
    const resubmitted = { date: '2026-10-28', submittedAt: new Date('2026-10-28T14:00:00Z') };
    await submit('2026-10-29', '2026-10-29T12:00:00Z');
    expect(await reopenBlockerState(db, INST, row.id, resubmitted)).toBe(false);
    expect((await getBlockerState(db, INST, row.id))?.resolvedAt).not.toBeNull();
    const latest = { date: '2026-10-29', submittedAt: new Date('2026-10-29T12:00:00Z') };
    expect(await reopenBlockerState(db, INST, row.id, latest)).toBe(true);
    expect(await getBlockerState(db, INST, row.id)).toMatchObject({
      resolvedAt: null,
      resolvedByMemberId: null,
      resolvedOn: null,
    });
    expect(await reopenBlockerState(db, INST, row.id, latest)).toBe(false);
  });
});

describe('stale blocker states', () => {
  const payload = { org: 'acme', yesterday: [], today: [], blockers: [], support: [] };

  async function open(memberId: string, blockerId: string, date: string, installationId = INST) {
    await upsertDaily(db, {
      installationId,
      memberId,
      date,
      payload,
      submittedAt: new Date(`${date}T12:00:00Z`),
    });
    return upsertBlockerState(db, {
      installationId,
      authorMemberId: memberId,
      blockerId,
      text: `blocker ${blockerId}`,
      ref: null,
      date,
    });
  }

  const query = (
    authorMemberIds: string[],
    openedOnOrBefore = '2026-10-25',
    limit = 10,
    teamName = 'Alpha',
  ) => ({
    teamName,
    authorMemberIds,
    openedOnOrBefore,
    limit,
  });

  test('lists open, current and never alerted blockers opened on or before the cutoff', async () => {
    const { ana, bob } = await seed();
    const old = await open(ana.id, 'old', '2026-10-20');
    await open(ana.id, 'old', '2026-10-28');
    await open(bob.id, 'edge', '2026-10-25');
    await open(bob.id, 'edge', '2026-10-26');
    await open(bob.id, 'young', '2026-10-26');
    const rows = await listStaleBlockerStates(db, INST, query([ana.id, bob.id]));
    expect(rows.map((r) => [r.blockerId, r.authorLogin, r.openedOn])).toEqual([
      ['old', 'Ana', '2026-10-20'],
      ['edge', 'Bob', '2026-10-25'],
    ]);
    expect(rows[0]?.id).toBe(old.id);
  });

  test('skips resolved, alerted, no longer current and other authors or installations', async () => {
    const { ana, bob } = await seed();
    const resolved = await open(ana.id, 'resolved', '2026-10-20');
    await setBlockerStateResolved(db, INST, resolved.id, {
      at: new Date('2026-10-22T12:00:00Z'),
      by: bob.id,
      on: '2026-10-22',
    });
    const alerted = await open(ana.id, 'alerted', '2026-10-20');
    expect(
      await markBlockerStateAlerted(db, INST, alerted.id, { teamName: 'Alpha', at: new Date() }),
    ).toBe(true);
    await open(bob.id, 'gone', '2026-10-20');
    await upsertDaily(db, {
      installationId: INST,
      memberId: bob.id,
      date: '2026-10-27',
      payload,
      submittedAt: new Date('2026-10-27T12:00:00Z'),
    });
    await open(ana.id, 'elsewhere', '2026-10-20', 200);
    expect(await listStaleBlockerStates(db, INST, query([ana.id]))).toEqual([]);
    expect(await listStaleBlockerStates(db, INST, query([bob.id]))).toEqual([]);
    expect(await listStaleBlockerStates(db, INST, query([]))).toEqual([]);
  });

  test('is bounded by the limit, oldest first', async () => {
    const { ana } = await seed();
    await open(ana.id, 'a', '2026-10-20');
    await open(ana.id, 'b', '2026-10-21');
    await open(ana.id, 'a', '2026-10-21');
    const rows = await listStaleBlockerStates(db, INST, query([ana.id], '2026-10-25', 1));
    expect(rows.map((r) => r.blockerId)).toEqual(['a']);
  });

  test('marks a blocker alerted once and keeps it after a reopen', async () => {
    const { ana, bob } = await seed();
    const row = await open(ana.id, 'b1', '2026-10-20');
    const at = new Date('2026-10-26T13:00:00Z');
    expect(await markBlockerStateAlerted(db, 200, row.id, { teamName: 'Alpha', at })).toBe(false);
    expect(await markBlockerStateAlerted(db, INST, row.id, { teamName: 'Alpha', at })).toBe(true);
    expect(
      await markBlockerStateAlerted(db, INST, row.id, { teamName: 'Alpha', at: new Date() }),
    ).toBe(false);
    expect((await getBlockerState(db, INST, row.id))?.alertedAt?.toISOString()).toBe(
      at.toISOString(),
    );
    await setBlockerStateResolved(db, INST, row.id, {
      at: new Date('2026-10-27T12:00:00Z'),
      by: bob.id,
      on: '2026-10-27',
    });
    const reopened = await open(ana.id, 'b1', '2026-10-29');
    expect(reopened.id).toBe(row.id);
    expect(reopened.resolvedAt).toBeNull();
    expect(reopened.alertedAt?.toISOString()).toBe(at.toISOString());
  });

  test('tracks the alert per team, so each team that turns it on is alerted once', async () => {
    const { ana } = await seed();
    const row = await open(ana.id, 'shared', '2026-10-20');
    const first = new Date('2026-10-26T13:00:00Z');
    expect(await markBlockerStateAlerted(db, INST, row.id, { teamName: 'Alpha', at: first })).toBe(
      true,
    );
    expect(await listStaleBlockerStates(db, INST, query([ana.id]))).toEqual([]);
    const forBeta = await listStaleBlockerStates(
      db,
      INST,
      query([ana.id], '2026-10-25', 10, 'Beta'),
    );
    expect(forBeta.map((r) => r.id)).toEqual([row.id]);
    const later = new Date('2026-10-26T14:00:00Z');
    expect(await markBlockerStateAlerted(db, INST, row.id, { teamName: 'Beta', at: later })).toBe(
      true,
    );
    expect(await markBlockerStateAlerted(db, INST, row.id, { teamName: 'Beta', at: later })).toBe(
      false,
    );
    expect(
      await listStaleBlockerStates(db, INST, query([ana.id], '2026-10-25', 10, 'Beta')),
    ).toEqual([]);
    const state = await getBlockerState(db, INST, row.id);
    expect(state?.alertedAt?.toISOString()).toBe(first.toISOString());
  });
});
