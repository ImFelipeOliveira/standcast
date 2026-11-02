import { describe, expect, test } from 'bun:test';
import { markDeliverySent, setMemberInstallations, upsertMember } from '@standcast/db';
import type { EnqueueOptions } from '@standcast/queue';
import { db, useCleanDb } from '../../../db/test/setup';
import { createMembershipCheck, remindNow, submitDaily } from '../../src';
import { config, daily, fakeDeps, INST, seedMember, seedOrg } from './fakes';

useCleanDb();

async function setup() {
  await seedOrg(config('[alice, bob, carol]'));
  const alice = await seedMember();
  const bob = await upsertMember(db, { githubUserId: 2, login: 'bob', email: null });
  const carol = await upsertMember(db, { githubUserId: 3, login: 'carol', email: null });
  for (const m of [alice, bob, carol]) await setMemberInstallations(db, m.id, [INST]);
  const fake = fakeDeps();
  fake.users.set(2, 'bob');
  fake.users.set(3, 'carol');
  fake.orgMembers.add('bob');
  fake.orgMembers.add('carol');
  fake.setNow(new Date('2026-10-28T12:00:00Z'));
  const enqueued: { name: string; data: object; opts?: EnqueueOptions }[] = [];
  const original = fake.queue.enqueue.bind(fake.queue);
  fake.deps.queue.enqueue = async (name, data, opts) => {
    enqueued.push({ name, data, ...(opts ? { opts } : {}) });
    await original(name, data, opts);
  };
  return { ...fake, enqueued, alice, bob, carol, isMember: createMembershipCheck(fake.deps) };
}

const input = (login: string) => ({ installationId: INST, team: 'Alpha', login });

describe('remindNow', () => {
  test('manager queues the send-reminder job with the tick key', async () => {
    const { deps, isMember, alice, enqueued } = await setup();
    expect(await remindNow(deps, isMember, alice, input('Carol'))).toBe('queued');
    expect(enqueued).toEqual([
      {
        name: 'send-reminder',
        data: { installationId: INST, login: 'carol', date: '2026-10-28' },
        opts: { singletonKey: `reminder:${INST}:carol:2026-10-28` },
      },
    ]);
  });

  test('member cannot remind', async () => {
    const { deps, isMember, bob, enqueued } = await setup();
    await expect(remindNow(deps, isMember, bob, input('carol'))).rejects.toMatchObject({
      code: 'forbidden',
    });
    expect(enqueued).toEqual([]);
  });

  test('admin can remind', async () => {
    const { deps, isMember, carol, roles } = await setup();
    roles.set('carol', { role: 'admin', state: 'active' });
    expect(await remindNow(deps, isMember, carol, input('bob'))).toBe('queued');
  });

  test('remind after digest is too_late', async () => {
    const { deps, isMember, alice, setNow, enqueued } = await setup();
    setNow(new Date('2026-10-28T13:00:00Z'));
    expect(await remindNow(deps, isMember, alice, input('carol'))).toBe('too_late');
    setNow(new Date('2026-10-28T12:00:00Z'));
    await markDeliverySent(db, {
      installationId: INST,
      teamName: 'Alpha',
      date: '2026-10-28',
      kind: 'digest',
    });
    expect(await remindNow(deps, isMember, alice, input('carol'))).toBe('too_late');
    expect(enqueued).toEqual([]);
  });

  test('remind twice is already_sent', async () => {
    const { deps, isMember, alice, enqueued } = await setup();
    expect(await remindNow(deps, isMember, alice, input('carol'))).toBe('queued');
    await markDeliverySent(db, {
      installationId: INST,
      teamName: '',
      date: '2026-10-28',
      kind: 'reminder',
      subject: 'carol',
    });
    expect(await remindNow(deps, isMember, alice, input('carol'))).toBe('already_sent');
    expect(enqueued).toHaveLength(1);
  });

  test('a person who already sent the daily is already_sent', async () => {
    const { deps, isMember, alice, bob, enqueued } = await setup();
    await submitDaily(deps, isMember, bob, daily);
    expect(await remindNow(deps, isMember, alice, input('bob'))).toBe('already_sent');
    expect(enqueued.filter((e) => e.name === 'send-reminder')).toEqual([]);
  });

  test('unknown team or person is not found', async () => {
    const { deps, isMember, alice } = await setup();
    await expect(remindNow(deps, isMember, alice, input('dave'))).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(
      remindNow(deps, isMember, alice, { installationId: INST, team: 'Nope', login: 'bob' }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
