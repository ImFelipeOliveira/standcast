import { describe, expect, test } from 'bun:test';
import type { StoredDaily } from '@standcast/core';
import { type MemberRow, setMemberInstallations, upsertDaily, upsertMember } from '@standcast/db';
import { db, useCleanDb } from '../../../db/test/setup';
import { createMembershipCheck, getTeamsSummary } from '../../src';
import { config, daily, fakeDeps, INST, seedMember, seedOrg } from './fakes';

useCleanDb();

const beta = `  - name: Beta
    timezone: Asia/Tokyo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [carol]
    members: [carol, dave]
    chat: { provider: slack, channel: "#beta" }`;

async function setup(
  cfg = config('[alice, bob, carol]', beta),
  opts: Parameters<typeof fakeDeps>[0] = {},
) {
  await seedOrg(cfg);
  const alice = await seedMember();
  const bob = await upsertMember(db, { githubUserId: 2, login: 'bob', email: null });
  const carol = await upsertMember(db, { githubUserId: 3, login: 'carol', email: null });
  const dave = await upsertMember(db, { githubUserId: 4, login: 'dave', email: null });
  const erin = await upsertMember(db, { githubUserId: 5, login: 'erin', email: null });
  for (const m of [alice, bob, carol, dave, erin]) await setMemberInstallations(db, m.id, [INST]);
  const fake = fakeDeps(opts);
  for (const [id, login] of [
    [2, 'bob'],
    [3, 'carol'],
    [4, 'dave'],
    [5, 'erin'],
  ] as const) {
    fake.users.set(id, login);
    fake.orgMembers.add(login);
  }
  return { ...fake, alice, bob, carol, dave, erin, isMember: createMembershipCheck(fake.deps) };
}

async function store(member: MemberRow, date: string) {
  await upsertDaily(db, {
    installationId: INST,
    memberId: member.id,
    date,
    payload: daily as StoredDaily,
    submittedAt: new Date(`${date}T12:00:00Z`),
  });
}

describe('getTeamsSummary', () => {
  test('counts the dailies of each readable team on its own date', async () => {
    const { deps, isMember, alice, bob, carol, dave, calls } = await setup();
    await store(bob, '2026-10-28');
    await store(alice, '2026-10-27');
    await store(dave, '2026-10-29');
    expect(await getTeamsSummary(deps, isMember, carol, INST)).toEqual([
      { team: 'Alpha', sent: 1, total: 3 },
      { team: 'Beta', sent: 1, total: 2 },
    ]);
    expect(calls.pullRequestMerged).toEqual([]);
  });

  test('a member reads only the teams they belong to or manage', async () => {
    const { deps, isMember, bob, dave } = await setup();
    expect(await getTeamsSummary(deps, isMember, bob, INST)).toEqual([
      { team: 'Alpha', sent: 0, total: 3 },
    ]);
    expect(await getTeamsSummary(deps, isMember, dave, INST)).toEqual([
      { team: 'Beta', sent: 0, total: 2 },
    ]);
  });

  test('an admin reads every team', async () => {
    const { deps, isMember, erin, roles } = await setup();
    roles.set('erin', { role: 'admin', state: 'active' });
    expect(await getTeamsSummary(deps, isMember, erin, INST)).toEqual([
      { team: 'Alpha', sent: 0, total: 3 },
      { team: 'Beta', sent: 0, total: 2 },
    ]);
  });

  test('a member of a manager team reads that team, a missing manager team grants nothing', async () => {
    const cfg = config('[alice, bob, carol]', beta.replace('[carol]', '["@acme/leads"]'));
    const resolved = await setup(cfg, { teams: { '@acme/leads': ['erin'] } });
    expect(await getTeamsSummary(resolved.deps, resolved.isMember, resolved.erin, INST)).toEqual([
      { team: 'Beta', sent: 0, total: 2 },
    ]);
    const missing = await setup(cfg);
    expect(await getTeamsSummary(missing.deps, missing.isMember, missing.erin, INST)).toEqual([]);
  });

  test('a person outside every team reads nothing', async () => {
    const { deps, isMember, erin } = await setup();
    expect(await getTeamsSummary(deps, isMember, erin, INST)).toEqual([]);
  });

  test('an unconfigured installation has no teams', async () => {
    await seedOrg(null);
    const alice = await seedMember();
    await setMemberInstallations(db, alice.id, [INST]);
    const { deps } = fakeDeps();
    expect(await getTeamsSummary(deps, createMembershipCheck(deps), alice, INST)).toEqual([]);
  });

  test('an installation the person does not belong to is refused', async () => {
    const { deps, isMember, bob } = await setup();
    await expect(getTeamsSummary(deps, isMember, bob, 999)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});
