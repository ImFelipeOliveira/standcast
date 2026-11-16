import { describe, expect, spyOn, test } from 'bun:test';
import { parseConfig, type StandcastConfig, t } from '@standcast/core';
import {
  findGoogleChatSignInToken,
  getIdentityByLogin,
  issueGoogleChatSignInToken,
  setIdentity,
  setMemberInstallations,
  upsertMember,
} from '@standcast/db';
import { connections } from '../../../db/src/schema';
import { db, useCleanDb } from '../../../db/test/setup';
import { completeGoogleChatSignInLink, hashLinkCode, previewGoogleChatSignInLink } from '../../src';
import { fakeChat, fakeDeps, INST, linkSpace, seedOrg } from './fakes';

useCleanDb();

const OTHER = 12;
const TOKEN = 'token-one';

function googleConfig(space: string, members = ''): StandcastConfig {
  const parsed = parseConfig(`
teams:
  - name: Alpha
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    language: pt-BR
    managers: [ana]
    members: [ana, bob]
    chat: { provider: google-chat, channel: "${space}" }
${members}`);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.config;
}

async function setup(opts: { members?: string; installations?: number[] } = {}) {
  await seedOrg(googleConfig('spaces/AAAA', opts.members));
  await seedOrg(googleConfig('spaces/BBBB'), { id: OTHER, accountLogin: 'globex' });
  await linkSpace('spaces/AAAA', INST);
  await linkSpace('spaces/BBBB', OTHER);
  const ana = await upsertMember(db, { githubUserId: 5, login: 'ana', email: null });
  await setMemberInstallations(db, ana.id, opts.installations ?? [INST, OTHER]);
  const harness = fakeDeps();
  const chat = fakeChat();
  harness.deps.chatFor = async () => chat.chat;
  await issueGoogleChatSignInToken(db, {
    tokenHash: hashLinkCode(TOKEN),
    chatUserId: 'users/1',
    chatEmail: 'ana@acme.com',
    installationId: INST,
    spaceName: 'spaces/AAAA',
    expiresAt: new Date(harness.deps.now().getTime() + 15 * 60 * 1000),
  });
  return { ...harness, ...chat, ana };
}

const stillFound = async (now: Date) =>
  (await findGoogleChatSignInToken(db, hashLinkCode(TOKEN), now)) !== null;

describe('previewGoogleChatSignInLink', () => {
  test('preview shows the account, org and login without consuming the token', async () => {
    const { deps, ana } = await setup();
    expect(await previewGoogleChatSignInLink(deps, { member: ana, token: TOKEN })).toEqual({
      status: 'confirm',
      account: 'ana@acme.com',
      replaces: false,
      language: 'pt-BR',
      login: 'ana',
      org: 'acme',
    });
    expect(await stillFound(deps.now())).toBe(true);
    expect((await completeGoogleChatSignInLink(deps, { member: ana, token: TOKEN })).status).toBe(
      'linked',
    );
  });

  test('preview of a used or unknown token is expired', async () => {
    const { deps, ana } = await setup();
    const expired = { status: 'expired', language: 'en', login: 'ana', org: '' } as const;
    expect(await previewGoogleChatSignInLink(deps, { member: ana, token: 'unknown' })).toEqual(
      expired,
    );
    await completeGoogleChatSignInLink(deps, { member: ana, token: TOKEN });
    expect(await previewGoogleChatSignInLink(deps, { member: ana, token: TOKEN })).toEqual(expired);
  });
});

describe('completeGoogleChatSignInLink', () => {
  test('complete links only in the token installation and confirms by direct message', async () => {
    const { deps, ana, directs } = await setup();
    expect(await completeGoogleChatSignInLink(deps, { member: ana, token: TOKEN })).toEqual({
      status: 'linked',
      language: 'pt-BR',
      login: 'ana',
      org: 'acme',
    });
    expect(await getIdentityByLogin(db, INST, 'google-chat', 'ana')).toBe('users/1');
    expect(await getIdentityByLogin(db, OTHER, 'google-chat', 'ana')).toBeNull();
    expect(directs).toHaveLength(1);
    expect(directs[0]?.userId).toBe('users/1');
    expect(directs[0]?.msg.fallbackText).toBe(t('pt-BR', 'googleChat.linked', { logins: '@ana' }));
  });

  test('complete twice returns expired the second time', async () => {
    const { deps, ana } = await setup();
    await completeGoogleChatSignInLink(deps, { member: ana, token: TOKEN });
    expect((await completeGoogleChatSignInLink(deps, { member: ana, token: TOKEN })).status).toBe(
      'expired',
    );
  });

  test('a member outside the installation is not_member and nothing is written', async () => {
    const { deps, ana, directs } = await setup({ installations: [OTHER] });
    expect((await previewGoogleChatSignInLink(deps, { member: ana, token: TOKEN })).status).toBe(
      'not_member',
    );
    expect(await completeGoogleChatSignInLink(deps, { member: ana, token: TOKEN })).toEqual({
      status: 'not_member',
      language: 'pt-BR',
      login: 'ana',
      org: 'acme',
    });
    expect(await getIdentityByLogin(db, INST, 'google-chat', 'ana')).toBeNull();
    expect(directs).toHaveLength(0);
    expect(await stillFound(deps.now())).toBe(true);
  });

  test('google chat disconnected after the click is not_connected and the token is not consumed', async () => {
    const { deps, ana } = await setup();
    await db.delete(connections);
    expect((await completeGoogleChatSignInLink(deps, { member: ana, token: TOKEN })).status).toBe(
      'not_connected',
    );
    expect(await stillFound(deps.now())).toBe(true);
  });

  test('an admin mapping to another chat user is mapped', async () => {
    const { deps, ana } = await setup({ members: 'members:\n  Ana: { google_chat: users/999 }' });
    expect((await previewGoogleChatSignInLink(deps, { member: ana, token: TOKEN })).status).toBe(
      'mapped',
    );
    expect((await completeGoogleChatSignInLink(deps, { member: ana, token: TOKEN })).status).toBe(
      'mapped',
    );
    expect(await getIdentityByLogin(db, INST, 'google-chat', 'ana')).toBeNull();
    expect(await stillFound(deps.now())).toBe(true);
  });

  test('an admin mapping of another member to this chat user is mapped', async () => {
    const { deps, ana } = await setup({ members: 'members:\n  bob: { google_chat: users/1 }' });
    expect((await completeGoogleChatSignInLink(deps, { member: ana, token: TOKEN })).status).toBe(
      'mapped',
    );
    expect(await getIdentityByLogin(db, INST, 'google-chat', 'ana')).toBeNull();
  });

  test('replacing a link: preview says replaces and complete notifies the previous chat user', async () => {
    const { deps, ana, directs } = await setup();
    await setIdentity(db, INST, ana.id, 'google-chat', 'users/OLD');
    const preview = await previewGoogleChatSignInLink(deps, { member: ana, token: TOKEN });
    expect(preview.status === 'confirm' && preview.replaces).toBe(true);
    expect((await completeGoogleChatSignInLink(deps, { member: ana, token: TOKEN })).status).toBe(
      'linked',
    );
    expect(await getIdentityByLogin(db, INST, 'google-chat', 'ana')).toBe('users/1');
    expect(directs.map((direct) => direct.userId)).toEqual(['users/1', 'users/OLD']);
    expect(directs[1]?.msg.fallbackText).toBe(
      t('pt-BR', 'googleChat.replaced', { login: 'ana', org: 'acme' }),
    );
  });

  test('another member linked to the same chat user loses that link in this installation only', async () => {
    const { deps, ana } = await setup();
    const bob = await upsertMember(db, { githubUserId: 6, login: 'bob', email: null });
    await setMemberInstallations(db, bob.id, [INST, OTHER]);
    await setIdentity(db, INST, bob.id, 'google-chat', 'users/1');
    await setIdentity(db, OTHER, bob.id, 'google-chat', 'users/1');
    expect((await completeGoogleChatSignInLink(deps, { member: ana, token: TOKEN })).status).toBe(
      'linked',
    );
    expect(await getIdentityByLogin(db, INST, 'google-chat', 'bob')).toBeNull();
    expect(await getIdentityByLogin(db, INST, 'google-chat', 'ana')).toBe('users/1');
    expect(await getIdentityByLogin(db, OTHER, 'google-chat', 'bob')).toBe('users/1');
  });

  test('a failed confirmation message still links', async () => {
    const { deps, ana, failWith } = await setup();
    failWith(new Error('chat down'));
    const spy = spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect((await completeGoogleChatSignInLink(deps, { member: ana, token: TOKEN })).status).toBe(
        'linked',
      );
      expect(spy).toHaveBeenCalled();
      const logged = JSON.stringify(spy.mock.calls);
      for (const secret of [TOKEN, 'ana@acme.com']) expect(logged).not.toContain(secret);
    } finally {
      spy.mockRestore();
    }
    expect(await getIdentityByLogin(db, INST, 'google-chat', 'ana')).toBe('users/1');
  });
});
