import { describe, expect, test } from 'bun:test';
import type { Item } from '@standcast/core';
import {
  getBlockerState,
  listCurrentOpenBlockerStates,
  type MemberRow,
  setMemberInstallations,
  upsertDaily,
  upsertMember,
} from '@standcast/db';
import { db, useCleanDb } from '../../../db/test/setup';
import {
  blockerRouteId,
  createMembershipCheck,
  DomainError,
  recordBlockers,
  setBlockerResolved,
  submitDaily,
} from '../../src';
import { config, daily, fakeDeps, INST, seedMember, seedOrg } from './fakes';

useCleanDb();

async function setup(
  team = config('[alice, bob, carol]'),
  opts: Parameters<typeof fakeDeps>[0] = {},
) {
  await seedOrg(team);
  await seedOrg(config(), { id: 22, accountLogin: 'other' });
  const alice = await seedMember();
  const bob = await upsertMember(db, { githubUserId: 2, login: 'bob', email: null });
  const carol = await upsertMember(db, { githubUserId: 3, login: 'carol', email: null });
  for (const m of [alice, bob, carol]) await setMemberInstallations(db, m.id, [INST]);
  const fake = fakeDeps(opts);
  fake.users.set(2, 'bob');
  fake.users.set(3, 'carol');
  fake.orgMembers.add('bob');
  fake.orgMembers.add('carol');
  return { ...fake, alice, bob, carol, isMember: createMembershipCheck(fake.deps) };
}

async function statesOf(member: MemberRow) {
  const rows = await db.query.blockerStates.findMany({
    where: (t, { eq }) => eq(t.authorMemberId, member.id),
  });
  return rows
    .sort((a, b) => a.text.localeCompare(b.text))
    .map((r) => ({
      id: r.id,
      blocker_id: r.blockerId,
      opened_on: r.openedOn,
      last_seen_on: r.lastSeenOn,
      resolved_at: r.resolvedAt,
      text: r.text,
    }));
}

const pr: Item = {
  text: 'waiting review',
  ref: { kind: 'pull_request', url: 'https://github.com/acme/api/pull/7' },
};
const access: Item = { text: 'need prod access' };

describe('recordBlockers', () => {
  test('first sighting opens the blocker', async () => {
    const { deps, isMember, bob } = await setup();
    await submitDaily(deps, isMember, bob, { ...daily, blockers: [pr] });
    const [row] = await statesOf(bob);
    expect(row).toMatchObject({
      opened_on: '2026-10-28',
      last_seen_on: '2026-10-28',
      resolved_at: null,
      text: 'waiting review',
    });
    expect(row?.blocker_id).toBe(blockerRouteId(pr));
  });

  test('resubmission keeps the opening date', async () => {
    const { deps, bob } = await setup();
    await recordBlockers(deps, {
      installationId: INST,
      memberId: bob.id,
      date: '2026-10-28',
      blockers: [pr],
    });
    await recordBlockers(deps, {
      installationId: INST,
      memberId: bob.id,
      date: '2026-10-29',
      blockers: [{ ...pr, text: 'still waiting review' }],
    });
    const rows = await statesOf(bob);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      opened_on: '2026-10-28',
      last_seen_on: '2026-10-29',
      text: 'still waiting review',
    });
  });

  test('resolved blocker that comes back reopens', async () => {
    const { deps, isMember, bob } = await setup();
    await recordBlockers(deps, {
      installationId: INST,
      memberId: bob.id,
      date: '2026-10-28',
      blockers: [access],
    });
    const [opened] = await statesOf(bob);
    await setBlockerResolved(deps, isMember, bob, {
      installationId: INST,
      blockerStateId: opened?.id ?? '',
      resolved: true,
    });
    expect((await statesOf(bob))[0]?.resolved_at).not.toBeNull();
    await recordBlockers(deps, {
      installationId: INST,
      memberId: bob.id,
      date: '2026-10-30',
      blockers: [access],
    });
    expect((await statesOf(bob))[0]).toMatchObject({
      id: opened?.id,
      opened_on: '2026-10-30',
      last_seen_on: '2026-10-30',
      resolved_at: null,
    });
  });

  test('a resubmit on the day it was resolved keeps it resolved', async () => {
    const { deps, isMember, alice, bob } = await setup();
    await submitDaily(deps, isMember, bob, { ...daily, blockers: [access] });
    const [opened] = await statesOf(bob);
    await setBlockerResolved(deps, isMember, alice, {
      installationId: INST,
      blockerStateId: opened?.id ?? '',
      resolved: true,
    });
    await submitDaily(deps, isMember, bob, {
      ...daily,
      today: [{ text: 'edited plan' }],
      blockers: [access],
    });
    const [row] = await statesOf(bob);
    expect(row?.id).toBe(opened?.id);
    expect(row?.resolved_at).not.toBeNull();
    expect(await listCurrentOpenBlockerStates(db, INST, [bob.id]).then((rows) => rows.length)).toBe(
      0,
    );
  });

  test('blockers dropped from a later daily stay open with last_seen_on unchanged', async () => {
    const { deps, bob } = await setup();
    await recordBlockers(deps, {
      installationId: INST,
      memberId: bob.id,
      date: '2026-10-28',
      blockers: [pr, access],
    });
    await recordBlockers(deps, {
      installationId: INST,
      memberId: bob.id,
      date: '2026-10-29',
      blockers: [pr],
    });
    const rows = await statesOf(bob);
    const dropped = rows.find((r) => r.text === access.text);
    expect(dropped).toMatchObject({ last_seen_on: '2026-10-28', resolved_at: null });
    expect(rows.find((r) => r.text === pr.text)?.last_seen_on).toBe('2026-10-29');
  });

  async function listed(member: MemberRow) {
    const rows = await listCurrentOpenBlockerStates(db, INST, [member.id]);
    return rows
      .map((r) => ({ text: r.text, ref: r.ref }))
      .sort((a, b) => a.text.localeCompare(b.text));
  }

  test('same-day resubmission with an edited text lists only the latest blocker', async () => {
    const { deps, isMember, bob } = await setup();
    await submitDaily(deps, isMember, bob, { ...daily, blockers: [access] });
    await submitDaily(deps, isMember, bob, {
      ...daily,
      blockers: [{ text: 'need staging access' }],
    });
    expect(await listed(bob)).toEqual([{ text: 'need staging access', ref: null }]);
    expect((await statesOf(bob)).map((r) => r.text)).toEqual(['need staging access']);
  });

  test('same-day resubmission with a ref added lists only the latest blocker', async () => {
    const { deps, isMember, bob } = await setup();
    await submitDaily(deps, isMember, bob, { ...daily, blockers: [{ text: pr.text }] });
    await submitDaily(deps, isMember, bob, { ...daily, blockers: [pr] });
    expect(await listed(bob)).toEqual([{ text: pr.text, ref: pr.ref ?? null }]);
  });

  test('same-day resubmission without the blocker lists nothing', async () => {
    const { deps, isMember, bob } = await setup();
    await submitDaily(deps, isMember, bob, { ...daily, blockers: [access] });
    await submitDaily(deps, isMember, bob, { ...daily, blockers: [] });
    expect(await listed(bob)).toEqual([]);
    expect(await statesOf(bob)).toEqual([]);
  });

  test('a blocker opened yesterday and dropped on a same-day resubmission is kept but not listed', async () => {
    const { deps, isMember, bob, setNow } = await setup();
    setNow(new Date('2026-10-27T15:00:00Z'));
    await submitDaily(deps, isMember, bob, { ...daily, blockers: [access] });
    setNow(new Date('2026-10-28T15:00:00Z'));
    await submitDaily(deps, isMember, bob, { ...daily, blockers: [access, pr] });
    await submitDaily(deps, isMember, bob, { ...daily, blockers: [pr] });
    expect(await listed(bob)).toEqual([{ text: pr.text, ref: pr.ref ?? null }]);
    const kept = (await statesOf(bob)).find((r) => r.text === access.text);
    expect(kept).toMatchObject({
      opened_on: '2026-10-27',
      last_seen_on: '2026-10-27',
      resolved_at: null,
    });
  });

  test('duplicate blockers in one daily record once', async () => {
    const { deps, bob } = await setup();
    await recordBlockers(deps, {
      installationId: INST,
      memberId: bob.id,
      date: '2026-10-28',
      blockers: [access, { text: '  Need PROD access ' }],
    });
    expect(await statesOf(bob)).toHaveLength(1);
  });
});

describe('setBlockerResolved', () => {
  async function opened(...args: Parameters<typeof setup>) {
    const ctx = await setup(...args);
    await upsertDaily(db, {
      installationId: INST,
      memberId: ctx.bob.id,
      date: '2026-10-28',
      payload: { org: 'acme', yesterday: [], today: [], blockers: [access], support: [] },
      submittedAt: new Date('2026-10-28T12:00:00Z'),
    });
    await recordBlockers(ctx.deps, {
      installationId: INST,
      memberId: ctx.bob.id,
      date: '2026-10-28',
      blockers: [access],
    });
    const [row] = await statesOf(ctx.bob);
    return { ...ctx, id: row?.id ?? '' };
  }

  test('author can resolve', async () => {
    const { deps, isMember, bob, id } = await opened();
    await setBlockerResolved(deps, isMember, bob, {
      installationId: INST,
      blockerStateId: id,
      resolved: true,
    });
    const row = await getBlockerState(db, INST, id);
    expect(row?.resolvedAt?.toISOString()).toBe('2026-10-28T15:00:00.000Z');
    expect(row?.resolvedByMemberId).toBe(bob.id);
    expect(row?.resolvedOn).toBe('2026-10-28');
    await setBlockerResolved(deps, isMember, bob, {
      installationId: INST,
      blockerStateId: id,
      resolved: false,
    });
    const reopened = await getBlockerState(db, INST, id);
    expect(reopened?.resolvedAt).toBeNull();
    expect(reopened?.resolvedByMemberId).toBeNull();
    expect(reopened?.resolvedOn).toBeNull();
  });

  test('manager can resolve', async () => {
    const { deps, isMember, alice, id } = await opened();
    await setBlockerResolved(deps, isMember, alice, {
      installationId: INST,
      blockerStateId: id,
      resolved: true,
    });
    expect((await getBlockerState(db, INST, id))?.resolvedByMemberId).toBe(alice.id);
  });

  test('a member of a manager team can resolve, someone outside it cannot', async () => {
    const team = config('[alice, bob]', '', '["@acme/leads"]');
    const { deps, isMember, alice, carol, id } = await opened(team, {
      teams: { '@acme/leads': ['carol'] },
    });
    const byAlice = setBlockerResolved(deps, isMember, alice, {
      installationId: INST,
      blockerStateId: id,
      resolved: true,
    });
    await expect(byAlice).rejects.toMatchObject({ code: 'forbidden' });
    await setBlockerResolved(deps, isMember, carol, {
      installationId: INST,
      blockerStateId: id,
      resolved: true,
    });
    expect((await getBlockerState(db, INST, id))?.resolvedByMemberId).toBe(carol.id);
    await setBlockerResolved(deps, isMember, carol, {
      installationId: INST,
      blockerStateId: id,
      resolved: false,
    });
    expect((await getBlockerState(db, INST, id))?.resolvedAt).toBeNull();
  });

  test('a manager team that cannot be resolved grants nothing', async () => {
    const team = config('[alice, bob]', '', '["@acme/leads"]');
    const { deps, isMember, carol, id } = await opened(team);
    const attempt = setBlockerResolved(deps, isMember, carol, {
      installationId: INST,
      blockerStateId: id,
      resolved: true,
    });
    await expect(attempt).rejects.toMatchObject({ code: 'forbidden' });
    expect((await getBlockerState(db, INST, id))?.resolvedAt).toBeNull();
  });

  test('admin can resolve', async () => {
    const { deps, isMember, carol, roles, alice } = await opened();
    await recordBlockers(deps, {
      installationId: INST,
      memberId: alice.id,
      date: '2026-10-28',
      blockers: [access],
    });
    const [row] = await statesOf(alice);
    roles.set('carol', { role: 'admin', state: 'active' });
    await setBlockerResolved(deps, isMember, carol, {
      installationId: INST,
      blockerStateId: row?.id ?? '',
      resolved: true,
    });
    expect((await getBlockerState(db, INST, row?.id ?? ''))?.resolvedByMemberId).toBe(carol.id);
  });

  test('member cannot resolve others', async () => {
    const { deps, isMember, carol, id } = await opened();
    const attempt = setBlockerResolved(deps, isMember, carol, {
      installationId: INST,
      blockerStateId: id,
      resolved: true,
    });
    await expect(attempt).rejects.toBeInstanceOf(DomainError);
    await expect(attempt).rejects.toMatchObject({ code: 'forbidden' });
    expect((await getBlockerState(db, INST, id))?.resolvedAt).toBeNull();
  });

  test('a failing admin check falls back to forbidden', async () => {
    const { deps, isMember, carol, id, failRoles } = await opened();
    failRoles(new Error('github down'));
    const attempt = setBlockerResolved(deps, isMember, carol, {
      installationId: INST,
      blockerStateId: id,
      resolved: true,
    });
    await expect(attempt).rejects.toMatchObject({ code: 'forbidden' });
    expect((await getBlockerState(db, INST, id))?.resolvedAt).toBeNull();
  });

  test('a manager of another team cannot resolve', async () => {
    const { deps, isMember, alice, id } = await opened();
    await seedOrg(config('[alice, carol]'));
    const attempt = setBlockerResolved(deps, isMember, alice, {
      installationId: INST,
      blockerStateId: id,
      resolved: true,
    });
    await expect(attempt).rejects.toMatchObject({ code: 'forbidden' });
  });

  test('other installation id is not found', async () => {
    const { deps, isMember, bob, id } = await opened();
    for (const [installationId, blockerStateId] of [
      [22, id],
      [INST, '00000000-0000-4000-8000-000000000000'],
      [INST, 'nope'],
    ] as const) {
      await expect(
        setBlockerResolved(deps, isMember, bob, { installationId, blockerStateId, resolved: true }),
      ).rejects.toMatchObject({ code: 'not_found' });
    }
  });
});
