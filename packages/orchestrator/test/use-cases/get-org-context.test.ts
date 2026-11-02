import { describe, expect, spyOn, test } from 'bun:test';
import { setMemberInstallations } from '@standcast/db';
import { db, useCleanDb } from '../../../db/test/setup';
import { createMembershipCheck, DomainError, getOrgContext } from '../../src';
import { config, fakeDeps, INST, seedMember, seedOrg } from './fakes';

useCleanDb();

const BETA = `  - name: Beta
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [Carol]
    members: [dave]
    chat: { provider: slack, channel: "#beta" }`;

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  const error = await promise.catch((e: unknown) => e);
  return error instanceof DomainError ? error.code : undefined;
}

async function setup(
  login: string,
  githubUserId: number,
  cfg: Parameters<typeof seedOrg>[0] = config('[alice, bob]', BETA),
) {
  await seedOrg(cfg);
  const member = await seedMember(login, githubUserId);
  await setMemberInstallations(db, member.id, [INST]);
  const fake = fakeDeps();
  fake.users.set(githubUserId, login);
  fake.orgMembers.add(login.toLowerCase());
  return { ...fake, member, isMember: createMembershipCheck(fake.deps) };
}

describe('getOrgContext', () => {
  test('an admin who manages and belongs to a team', async () => {
    const { deps, isMember, member, roles } = await setup('Alice', 1);
    roles.set('alice', { role: 'admin', state: 'active' });
    expect(await getOrgContext(deps, isMember, member, INST)).toEqual({
      admin: true,
      managerOf: ['Alpha'],
      memberOf: ['Alpha'],
    });
  });

  test('a manager outside every team', async () => {
    const { deps, isMember, member } = await setup('carol', 3);
    expect(await getOrgContext(deps, isMember, member, INST)).toEqual({
      admin: false,
      managerOf: ['Beta'],
      memberOf: [],
    });
  });

  test('a plain member', async () => {
    const { deps, isMember, member } = await setup('Bob', 2);
    expect(await getOrgContext(deps, isMember, member, INST)).toEqual({
      admin: false,
      managerOf: [],
      memberOf: ['Alpha'],
    });
  });

  test('an unconfigured organization has no teams', async () => {
    const { deps, isMember, member } = await setup('Alice', 1, null);
    expect(await getOrgContext(deps, isMember, member, INST)).toEqual({
      admin: false,
      managerOf: [],
      memberOf: [],
    });
  });

  test('someone outside the installation is forbidden', async () => {
    const { deps, isMember, member, orgMembers } = await setup('Alice', 1);
    orgMembers.delete('alice');
    expect(await codeOf(getOrgContext(deps, isMember, member, INST))).toBe('forbidden');
    expect(await codeOf(getOrgContext(deps, isMember, member, 99))).toBe('forbidden');
  });
  test('context survives a failing github', async () => {
    const { deps, isMember, member, roles } = await setup('Carol', 3);
    roles.set('carol', { role: 'admin', state: 'active' });
    deps.github.resolveTeamMembers = async () => {
      throw new Error('github down');
    };
    const spy = spyOn(console, 'error').mockImplementation(() => {});
    const context = await getOrgContext(deps, isMember, member, INST);
    const logged = spy.mock.calls.length;
    spy.mockRestore();
    expect(context).toEqual({ admin: true, managerOf: ['Beta'], memberOf: [] });
    expect(logged).toBeGreaterThan(0);
  });

  test('context gives up after the timeout', async () => {
    const { deps, isMember, member } = await setup('carol', 3);
    deps.github.resolveTeamMembers = () => new Promise(() => {});
    const started = Date.now();
    const context = await getOrgContext(deps, isMember, member, INST);
    expect(context).toEqual({ admin: false, managerOf: ['Beta'], memberOf: [] });
    expect(Date.now() - started).toBeLessThan(4500);
  }, 10000);
});
