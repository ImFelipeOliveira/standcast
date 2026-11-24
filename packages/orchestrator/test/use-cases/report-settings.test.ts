import { describe, expect, test } from 'bun:test';
import {
  getLlmApiKey,
  getTeamReport,
  setInstallationConfig,
  setMemberInstallations,
  upsertTeamReport,
} from '@standcast/db';
import { db, useCleanDb } from '../../../db/test/setup';
import {
  createMembershipCheck,
  DomainError,
  getReportSettings,
  removeLlmSettings,
  removeTeamReport,
  saveLlmSettings,
  saveTeamReport,
} from '../../src';
import { config, fakeDeps, INST, seedMember, seedOrg } from './fakes';

useCleanDb();

const KEY = 'sk-abcdef123456';

async function setup(opts: { admin?: boolean; login?: string } = {}) {
  const login = opts.login ?? 'Alice';
  await seedOrg();
  const id = login === 'Alice' ? 1 : 2;
  const member = await seedMember(login, id);
  await setMemberInstallations(db, member.id, [INST]);
  const fake = fakeDeps({ channels: { '#alpha': 'not_member' } });
  fake.users.set(id, login);
  fake.orgMembers.add(login.toLowerCase());
  if (opts.admin) fake.roles.set(login.toLowerCase(), { role: 'admin', state: 'active' });
  return { ...fake, member, isMember: createMembershipCheck(fake.deps) };
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  const error = await promise.catch((e: unknown) => e);
  return error instanceof DomainError ? error.code : undefined;
}

const input = {
  installationId: INST,
  team: 'Alpha',
  enabled: true,
  channel: '#alpha',
  weekday: 'fri' as const,
  time: '16:00',
  productionBranch: 'main',
};

describe('getReportSettings', () => {
  test('members who are not admins see llm as manage false and only their teams as not editable', async () => {
    const { deps, isMember, member } = await setup({ login: 'Bob' });
    await upsertTeamReport(db, { ...input, teamName: 'Alpha' }, new Date());
    const view = await getReportSettings(deps, isMember, member, INST);
    expect(view.llm).toEqual({ manage: false });
    expect(view.teams).toHaveLength(1);
    expect(view.teams[0]).toMatchObject({ team: 'Alpha', editable: false });
    expect(view.teams[0]?.report?.channel).toBe('#alpha');
    expect(view.orphans).toEqual([]);
  });

  test('orphaned reports are listed for admins and removable by them', async () => {
    const { deps, isMember, member } = await setup({ admin: true });
    await upsertTeamReport(db, { ...input, teamName: 'Gone' }, new Date());
    const view = await getReportSettings(deps, isMember, member, INST);
    expect(view.orphans).toEqual(['Gone']);
    expect(view.teams[0]?.editable).toBe(true);
    await removeTeamReport(deps, isMember, member, { installationId: INST, team: 'Gone' });
    expect(await getTeamReport(db, INST, 'Gone')).toBeNull();
    expect(
      await codeOf(
        removeTeamReport(deps, isMember, member, { installationId: INST, team: 'Gone' }),
      ),
    ).toBe('not_found');
  });
});

describe('saveTeamReport', () => {
  test('a team manager saves the team report; a plain member gets forbidden', async () => {
    const manager = await setup();
    const result = await saveTeamReport(manager.deps, manager.isMember, manager.member, input);
    expect(result.report).toEqual({
      enabled: true,
      channel: '#alpha',
      weekday: 'fri',
      time: '16:00',
      productionBranch: 'main',
    });
    const plain = await setup({ login: 'Bob' });
    expect(await codeOf(saveTeamReport(plain.deps, plain.isMember, plain.member, input))).toBe(
      'forbidden',
    );
    expect(await codeOf(removeTeamReport(plain.deps, plain.isMember, plain.member, input))).toBe(
      'forbidden',
    );
  });

  test('saving returns the channel check (not_member for Slack, not_linked for an unlinked space)', async () => {
    const { deps, isMember, member } = await setup();
    expect((await saveTeamReport(deps, isMember, member, input)).channel).toBe('not_member');
    const base = config();
    await setInstallationConfig(db, INST, {
      status: 'configured',
      config: {
        ...base,
        teams: base.teams.map((t) => ({
          ...t,
          chat: { provider: 'google-chat' as const, channel: 'spaces/AAA' },
        })),
      },
    });
    const result = await saveTeamReport(deps, isMember, member, {
      ...input,
      channel: 'spaces/AAA',
    });
    expect(result.channel).toBe('not_linked');
    expect((await getTeamReport(db, INST, 'Alpha'))?.channel).toBe('spaces/AAA');
  });

  test.each([
    ['time', { time: '24:00' }],
    ['time format', { time: '9:00' }],
    ['branch spaces', { productionBranch: 'a b' }],
    ['branch refs', { productionBranch: 'refs/heads/main' }],
    ['empty branch', { productionBranch: '' }],
    ['channel empty', { channel: '' }],
    ['weekday', { weekday: 'xyz' as never }],
  ])('invalid %s is invalid_request', async (_l, bad) => {
    const { deps, isMember, member } = await setup();
    expect(await codeOf(saveTeamReport(deps, isMember, member, { ...input, ...bad }))).toBe(
      'invalid_request',
    );
  });
});

describe('llm settings', () => {
  test('only admins save or remove the llm settings; the key is never returned', async () => {
    const plain = await setup();
    const body = {
      installationId: INST,
      provider: 'deepseek' as const,
      model: 'deepseek-chat',
      apiKey: KEY,
    };
    expect(await codeOf(saveLlmSettings(plain.deps, plain.isMember, plain.member, body))).toBe(
      'forbidden',
    );
    expect(await codeOf(removeLlmSettings(plain.deps, plain.isMember, plain.member, INST))).toBe(
      'forbidden',
    );
    const { deps, isMember, member } = await setup({ admin: true });
    const view = await saveLlmSettings(deps, isMember, member, body);
    expect(view).toEqual({
      manage: true,
      settings: { provider: 'deepseek', model: 'deepseek-chat', keyLast4: '3456', rejected: false },
    });
    expect(JSON.stringify(view)).not.toContain('sk-');
    expect(JSON.stringify(await getReportSettings(deps, isMember, member, INST))).not.toContain(
      'sk-',
    );
    expect(await getLlmApiKey(db, INST, deps.encryptionKey)).toBe(KEY);
    await removeLlmSettings(deps, isMember, member, INST);
    expect((await getReportSettings(deps, isMember, member, INST)).llm).toEqual({
      manage: true,
      settings: null,
    });
  });

  test('invalid model or key are invalid_request', async () => {
    const { deps, isMember, member } = await setup({ admin: true });
    const base = { installationId: INST, provider: 'deepseek' as const, model: 'm', apiKey: KEY };
    for (const bad of [
      { model: '' },
      { model: 'x'.repeat(101) },
      { apiKey: 'short' },
      { apiKey: 'has space 123456' },
      { apiKey: undefined },
    ]) {
      expect(await codeOf(saveLlmSettings(deps, isMember, member, { ...base, ...bad }))).toBe(
        'invalid_request',
      );
    }
  });
});
