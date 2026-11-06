import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { parseConfig, type StandcastConfig } from '@standcast/core';
import {
  getConnection,
  getDelivery,
  getIdentities,
  isGoogleChatSpaceLinked,
  issueGoogleChatLinkCode,
  listGoogleChatSpaces,
  redeemGoogleChatLinkCode,
  saveConnection,
  setIdentity,
  setMemberInstallations,
  upsertDaily,
  upsertMember,
} from '@standcast/db';
import { googleChatSpaces } from '../../../db/src/schema';
import { db, useCleanDb } from '../../../db/test/setup';
import {
  chatUserIdFor,
  createMembershipCheck,
  DomainError,
  GOOGLE_CHAT_CONNECTION_SECRET,
  type GoogleChatEvent,
  getSetupStatus,
  handleGoogleChatEvent,
  linkGoogleChatSpace,
  MAX_GOOGLE_CHAT_SPACES,
  sendDigest,
  unlinkGoogleChatSpace,
} from '../../src';
import { daily, fakeChat, fakeDeps, INST, linkSpace, seedMember, seedOrg } from './fakes';

useCleanDb();

const OTHER = 12;
const KEY = new Uint8Array(32).fill(7);
const CODE = /\b([ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8})\b/;

function googleConfig(opts: { language?: string; members?: string } = {}): StandcastConfig {
  const parsed = parseConfig(`
teams:
  - name: Alpha
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    language: ${opts.language ?? 'en'}
    managers: [alice]
    members: [alice, bob]
    chat: { provider: google-chat, channel: "spaces/AAAA" }
${opts.members ?? ''}`);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.config;
}

const codeOf = async (run: Promise<unknown>) =>
  ((await run.catch((e: unknown) => e)) as DomainError).code;

const added = (name = 'spaces/AAAA', displayName = 'Alpha room'): GoogleChatEvent => ({
  type: 'ADDED_TO_SPACE',
  space: { name, type: 'ROOM', spaceType: 'SPACE', displayName },
  user: { name: 'users/1', email: 'someone@acme.com' },
});

const dm = (email: string | undefined, user = 'users/123'): GoogleChatEvent => ({
  type: 'MESSAGE',
  space: { name: 'spaces/DM1', type: 'DM', spaceType: 'DIRECT_MESSAGE', singleUserBotDm: true },
  user: { name: user, ...(email === undefined ? {} : { email }) },
});

async function setup(cfg: StandcastConfig = googleConfig()) {
  await seedOrg(cfg);
  const member = await seedMember();
  await setMemberInstallations(db, member.id, [INST]);
  const harness = fakeDeps();
  harness.deps.googleChatAvailable = true;
  harness.roles.set('alice', { role: 'admin', state: 'active' });
  return { ...harness, member, isMember: createMembershipCheck(harness.deps) };
}

async function issueCode(
  deps: ReturnType<typeof fakeDeps>['deps'],
  name = 'spaces/AAAA',
): Promise<string> {
  const reply = await handleGoogleChatEvent(deps, added(name));
  const code = CODE.exec(reply?.text ?? '')?.[1];
  if (!code) throw new Error('no code in reply');
  return code;
}

async function bindElsewhere(spaceName: string, installationId = OTHER) {
  const reply = await handleGoogleChatEvent(fakeDeps().deps, added(spaceName));
  const code = CODE.exec(reply?.text ?? '')?.[1];
  if (!code) throw new Error('no code in reply');
  const codeHash = createHash('sha256').update(code).digest('hex');
  const result = await redeemGoogleChatLinkCode(db, {
    codeHash,
    installationId,
    now: new Date('2026-10-28T15:00:00Z'),
    maxSpaces: MAX_GOOGLE_CHAT_SPACES,
    connection: { secret: GOOGLE_CHAT_CONNECTION_SECRET, key: KEY },
  });
  if (result.status !== 'linked') throw new Error(`unexpected link status: ${result.status}`);
}

describe('handleGoogleChatEvent in a room', () => {
  test('added to a room issues a code', async () => {
    const { deps } = await setup();
    const reply = await handleGoogleChatEvent(deps, added());
    const text = reply?.text ?? '';
    const code = CODE.exec(text)?.[1] ?? '';
    expect(code).toHaveLength(8);
    expect(text).toContain('Configuration → Google Chat');
    expect(text).toContain('Configuração → Google Chat');
    const row = (await db.select().from(googleChatSpaces)).find(
      (r) => r.spaceName === 'spaces/AAAA',
    );
    expect(row?.installationId).toBeNull();
    expect(row?.displayName).toBe('Alpha room');
    expect(row?.linkCodeHash).toBe(createHash('sha256').update(code).digest('hex'));
    expect(row?.linkCodeExpiresAt?.getTime()).toBe(deps.now().getTime() + 24 * 60 * 60 * 1000);
  });

  test('a new add replaces the previous code', async () => {
    const { deps, isMember, member } = await setup();
    const first = await issueCode(deps);
    const second = await issueCode(deps);
    expect(
      await codeOf(
        linkGoogleChatSpace(deps, isMember, member, { installationId: INST, code: first }),
      ),
    ).toBe('invalid_code');
    const linked = await linkGoogleChatSpace(deps, isMember, member, {
      installationId: INST,
      code: second,
    });
    expect(linked.space).toBe('spaces/AAAA');
  });

  test('an invalid space name or other events answer nothing', async () => {
    const { deps } = await setup();
    expect(await handleGoogleChatEvent(deps, added('spaces/../x'))).toBeNull();
    expect(
      await handleGoogleChatEvent(deps, { type: 'CARD_CLICKED', space: { name: 'spaces/AAAA' } }),
    ).toBeNull();
    expect(
      await handleGoogleChatEvent(deps, {
        type: 'MESSAGE',
        space: { name: 'spaces/AAAA', type: 'ROOM' },
        user: { name: 'users/1', email: 'alice@acme.com' },
      }),
    ).toBeNull();
    expect(await db.select().from(googleChatSpaces)).toHaveLength(0);
  });

  test('removed from space deletes the binding', async () => {
    const { deps, isMember, member } = await setup();
    const code = await issueCode(deps);
    await linkGoogleChatSpace(deps, isMember, member, { installationId: INST, code });
    await setIdentity(db, INST, member.id, 'google-chat', 'users/123');
    const reply = await handleGoogleChatEvent(deps, {
      type: 'REMOVED_FROM_SPACE',
      space: { name: 'spaces/AAAA', type: 'ROOM' },
    });
    expect(reply).toBeNull();
    expect(await listGoogleChatSpaces(db, INST)).toEqual([]);
    expect(await db.select().from(googleChatSpaces)).toHaveLength(0);
    expect(await getConnection(db, INST, 'google-chat', KEY)).toBeNull();
    expect((await getIdentities(db, INST, 'google-chat')).get('alice')).toBe('users/123');
  });

  test('removing one of two spaces keeps the connection', async () => {
    const { deps, isMember, member } = await setup();
    const first = await issueCode(deps, 'spaces/AAAA');
    await linkGoogleChatSpace(deps, isMember, member, { installationId: INST, code: first });
    const second = await issueCode(deps, 'spaces/BBBB');
    await linkGoogleChatSpace(deps, isMember, member, { installationId: INST, code: second });
    await handleGoogleChatEvent(deps, {
      type: 'REMOVED_FROM_SPACE',
      space: { name: 'spaces/AAAA' },
    });
    expect((await listGoogleChatSpaces(db, INST)).map((s) => s.name)).toEqual(['spaces/BBBB']);
    expect((await getConnection(db, INST, 'google-chat', KEY))?.externalId).toBe('spaces/AAAA');
  });
});

describe('linkGoogleChatSpace', () => {
  test('code is single use', async () => {
    const { deps, isMember, member } = await setup();
    const code = await issueCode(deps);
    const linked = await linkGoogleChatSpace(deps, isMember, member, {
      installationId: INST,
      code: ` ${code.toLowerCase().slice(0, 4)}-${code.slice(4)} `,
    });
    expect(linked).toEqual({ space: 'spaces/AAAA', displayName: 'Alpha room' });
    expect(await listGoogleChatSpaces(db, INST)).toEqual([
      { name: 'spaces/AAAA', displayName: 'Alpha room' },
    ]);
    const connection = await getConnection(db, INST, 'google-chat', KEY);
    expect(connection?.externalId).toBe('spaces/AAAA');
    expect(connection?.secret).toBe(GOOGLE_CHAT_CONNECTION_SECRET);
    expect(
      await codeOf(linkGoogleChatSpace(deps, isMember, member, { installationId: INST, code })),
    ).toBe('invalid_code');
  });

  test('code is single use under concurrent redeem', async () => {
    const { deps, isMember, member } = await setup();
    const code = await issueCode(deps);
    const results = await Promise.allSettled([
      linkGoogleChatSpace(deps, isMember, member, { installationId: INST, code }),
      linkGoogleChatSpace(deps, isMember, member, { installationId: INST, code }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected.map((r) => (r.reason as DomainError).code)).toEqual(['invalid_code']);
    expect(await listGoogleChatSpaces(db, INST)).toHaveLength(1);
  });

  test('a failed connection write leaves the code unused and the space unbound', async () => {
    const { deps, isMember, member } = await setup();
    const code = await issueCode(deps);
    const broken = { ...deps, encryptionKey: new Uint8Array(3) };
    await expect(
      linkGoogleChatSpace(broken, isMember, member, { installationId: INST, code }),
    ).rejects.toThrow();
    expect(await listGoogleChatSpaces(db, INST)).toEqual([]);
    expect(await getConnection(db, INST, 'google-chat', KEY)).toBeNull();
    const linked = await linkGoogleChatSpace(deps, isMember, member, {
      installationId: INST,
      code,
    });
    expect(linked.space).toBe('spaces/AAAA');
  });

  test('a second space keeps the first connection row', async () => {
    const { deps, isMember, member } = await setup();
    await linkGoogleChatSpace(deps, isMember, member, {
      installationId: INST,
      code: await issueCode(deps, 'spaces/AAAA'),
    });
    await setIdentity(db, INST, member.id, 'google-chat', 'users/123');
    await linkGoogleChatSpace(deps, isMember, member, {
      installationId: INST,
      code: await issueCode(deps, 'spaces/BBBB'),
    });
    expect((await getConnection(db, INST, 'google-chat', KEY))?.externalId).toBe('spaces/AAAA');
    expect((await getIdentities(db, INST, 'google-chat')).get('alice')).toBe('users/123');
  });

  test('expired codes are cleared on redeem and when a new code is issued', async () => {
    const { deps, isMember, member, setNow } = await setup();
    const stale = await issueCode(deps, 'spaces/AAAA');
    await issueCode(deps, 'spaces/BBBB');
    setNow(new Date(deps.now().getTime() + 24 * 60 * 60 * 1000));
    expect(
      await codeOf(
        linkGoogleChatSpace(deps, isMember, member, { installationId: INST, code: stale }),
      ),
    ).toBe('invalid_code');
    const rows = async () =>
      new Map((await db.select().from(googleChatSpaces)).map((r) => [r.spaceName, r]));
    expect((await rows()).has('spaces/AAAA')).toBe(false);
    expect((await rows()).get('spaces/BBBB')?.linkCodeHash).not.toBeNull();
    await issueCode(deps, 'spaces/CCCC');
    expect((await rows()).has('spaces/BBBB')).toBe(false);
    expect((await rows()).get('spaces/CCCC')?.linkCodeHash).not.toBeNull();
  });

  test('an expired code on a linked space clears the code and keeps the binding', async () => {
    const { deps, isMember, member, setNow } = await setup();
    await linkGoogleChatSpace(deps, isMember, member, {
      installationId: INST,
      code: await issueCode(deps, 'spaces/AAAA'),
    });
    await issueCode(deps, 'spaces/AAAA');
    setNow(new Date(deps.now().getTime() + 24 * 60 * 60 * 1000));
    await issueCode(deps, 'spaces/CCCC');
    const row = (await db.select().from(googleChatSpaces)).find(
      (r) => r.spaceName === 'spaces/AAAA',
    );
    expect(row?.linkCodeHash).toBeNull();
    expect(row?.installationId).toBe(INST);
    expect(await listGoogleChatSpaces(db, INST)).toHaveLength(1);
  });

  test('linking is not found while google chat is off', async () => {
    const { deps, isMember, member } = await setup();
    const code = await issueCode(deps);
    deps.googleChatAvailable = false;
    expect(
      await codeOf(linkGoogleChatSpace(deps, isMember, member, { installationId: INST, code })),
    ).toBe('not_found');
    expect(await listGoogleChatSpaces(db, INST)).toEqual([]);
    expect(await getConnection(db, INST, 'google-chat', KEY)).toBeNull();
  });

  test('linking announces the organization in the space, in both languages', async () => {
    const { deps, isMember, member } = await setup();
    const google = fakeChat();
    deps.chatFor = async (_installationId, provider) =>
      provider === 'google-chat' ? google.chat : null;
    await linkGoogleChatSpace(deps, isMember, member, {
      installationId: INST,
      code: await issueCode(deps),
    });
    expect(google.posted).toHaveLength(1);
    expect(google.posted[0]?.channel).toBe('spaces/AAAA');
    expect(google.posted[0]?.msg.fallbackText).toContain('acme');
    expect(google.posted[0]?.msg.fallbackText).toContain('remove the app');
    expect(google.posted[0]?.msg.fallbackText).toContain('remova o app');
  });

  test('a failed announcement still links the space', async () => {
    const { deps, isMember, member } = await setup();
    const google = fakeChat();
    google.failWith(new Error('boom'));
    deps.chatFor = async () => google.chat;
    const linked = await linkGoogleChatSpace(deps, isMember, member, {
      installationId: INST,
      code: await issueCode(deps),
    });
    expect(linked.space).toBe('spaces/AAAA');
    expect(await listGoogleChatSpaces(db, INST)).toHaveLength(1);
  });

  test('linking a space while the last one is unlinked always leaves a connection', async () => {
    const { deps, isMember, member } = await setup();
    for (let round = 0; round < 8; round++) {
      await linkGoogleChatSpace(deps, isMember, member, {
        installationId: INST,
        code: await issueCode(deps, 'spaces/AAAA'),
      });
      const code = await issueCode(deps, 'spaces/BBBB');
      await Promise.all([
        unlinkGoogleChatSpace(deps, isMember, member, {
          installationId: INST,
          space: 'spaces/AAAA',
        }),
        linkGoogleChatSpace(deps, isMember, member, { installationId: INST, code }),
      ]);
      expect((await listGoogleChatSpaces(db, INST)).map((s) => s.name)).toEqual(['spaces/BBBB']);
      expect(await getConnection(db, INST, 'google-chat', KEY)).not.toBeNull();
      await unlinkGoogleChatSpace(deps, isMember, member, {
        installationId: INST,
        space: 'spaces/BBBB',
      });
      expect(await getConnection(db, INST, 'google-chat', KEY)).toBeNull();
    }
  });

  test('expired code', async () => {
    const { deps, isMember, member, setNow } = await setup();
    const code = await issueCode(deps);
    setNow(new Date(deps.now().getTime() + 24 * 60 * 60 * 1000));
    expect(
      await codeOf(linkGoogleChatSpace(deps, isMember, member, { installationId: INST, code })),
    ).toBe('invalid_code');
    expect(await listGoogleChatSpaces(db, INST)).toEqual([]);
  });

  test('a malformed code is invalid', async () => {
    const { deps, isMember, member } = await setup();
    expect(
      await codeOf(
        linkGoogleChatSpace(deps, isMember, member, { installationId: INST, code: 'nope' }),
      ),
    ).toBe('invalid_code');
  });

  test('member cannot redeem', async () => {
    const { deps, isMember, member, roles } = await setup();
    const code = await issueCode(deps);
    roles.set('alice', { role: 'member', state: 'active' });
    expect(
      await codeOf(linkGoogleChatSpace(deps, isMember, member, { installationId: INST, code })),
    ).toBe('forbidden');
    expect(await listGoogleChatSpaces(db, INST)).toEqual([]);
    roles.set('alice', { role: 'admin', state: 'active' });
    const linked = await linkGoogleChatSpace(deps, isMember, member, {
      installationId: INST,
      code,
    });
    expect(linked.space).toBe('spaces/AAAA');
  });

  test('the redeem guard runs for admins only and before the code lookup', async () => {
    const { deps, isMember, member, roles } = await setup();
    const code = await issueCode(deps);
    const guarded: number[] = [];
    const guard = {
      beforeRedeem: async (installationId: number) => {
        guarded.push(installationId);
        throw new DomainError('rate_limited', 'rate limit exceeded');
      },
    };
    roles.set('alice', { role: 'member', state: 'active' });
    expect(
      await codeOf(
        linkGoogleChatSpace(deps, isMember, member, { installationId: INST, code }, guard),
      ),
    ).toBe('forbidden');
    expect(guarded).toEqual([]);
    roles.set('alice', { role: 'admin', state: 'active' });
    expect(
      await codeOf(
        linkGoogleChatSpace(deps, isMember, member, { installationId: INST, code }, guard),
      ),
    ).toBe('rate_limited');
    expect(guarded).toEqual([INST]);
    expect(await listGoogleChatSpaces(db, INST)).toEqual([]);
    const linked = await linkGoogleChatSpace(deps, isMember, member, {
      installationId: INST,
      code,
    });
    expect(linked.space).toBe('spaces/AAAA');
  });

  test('a space linked to another installation is rejected', async () => {
    const { deps, isMember, member } = await setup();
    await seedOrg(googleConfig(), { id: OTHER, accountLogin: 'beta' });
    await bindElsewhere('spaces/AAAA');
    const code = await issueCode(deps);
    expect(
      await codeOf(linkGoogleChatSpace(deps, isMember, member, { installationId: INST, code })),
    ).toBe('space_already_linked');
    expect(await listGoogleChatSpaces(db, INST)).toEqual([]);
    expect(await listGoogleChatSpaces(db, OTHER)).toHaveLength(1);
  });
});

describe('unlinkGoogleChatSpace', () => {
  test('an admin unlinks a space and the last one drops the connection', async () => {
    const { deps, isMember, member } = await setup();
    const code = await issueCode(deps);
    await linkGoogleChatSpace(deps, isMember, member, { installationId: INST, code });
    await unlinkGoogleChatSpace(deps, isMember, member, {
      installationId: INST,
      space: 'spaces/AAAA',
    });
    expect(await listGoogleChatSpaces(db, INST)).toEqual([]);
    expect(await getConnection(db, INST, 'google-chat', KEY)).toBeNull();
  });

  test('a member cannot unlink and an unknown space is not found', async () => {
    const { deps, isMember, member, roles } = await setup();
    const code = await issueCode(deps);
    await linkGoogleChatSpace(deps, isMember, member, { installationId: INST, code });
    expect(
      await codeOf(
        unlinkGoogleChatSpace(deps, isMember, member, {
          installationId: INST,
          space: 'spaces/ZZZZ',
        }),
      ),
    ).toBe('not_found');
    roles.set('alice', { role: 'member', state: 'active' });
    expect(
      await codeOf(
        unlinkGoogleChatSpace(deps, isMember, member, {
          installationId: INST,
          space: 'spaces/AAAA',
        }),
      ),
    ).toBe('forbidden');
    expect(await listGoogleChatSpaces(db, INST)).toHaveLength(1);
  });

  test('a malformed space name is not found for an admin and forbidden for a member', async () => {
    const { deps, isMember, member, roles } = await setup();
    for (const space of ['spaces/../x', 'foo', 'spaces/', `spaces/${'A'.repeat(129)}`]) {
      expect(
        await codeOf(
          unlinkGoogleChatSpace(deps, isMember, member, { installationId: INST, space }),
        ),
        space,
      ).toBe('not_found');
    }
    roles.set('alice', { role: 'member', state: 'active' });
    expect(
      await codeOf(
        unlinkGoogleChatSpace(deps, isMember, member, { installationId: INST, space: 'foo' }),
      ),
    ).toBe('forbidden');
  });
});

describe('handleGoogleChatEvent in a direct message', () => {
  test('dm links the member in every connected installation', async () => {
    const { deps, member } = await setup();
    await seedOrg(googleConfig(), { id: OTHER, accountLogin: 'beta' });
    await seedOrg(googleConfig(), { id: 13, accountLogin: 'gamma' });
    await setMemberInstallations(db, member.id, [INST, OTHER, 13]);
    await bindElsewhere('spaces/AAAA', INST);
    await bindElsewhere('spaces/BBBB', OTHER);
    const reply = await handleGoogleChatEvent(deps, dm('ALICE@acme.com'));
    expect(reply).toEqual({ text: "You're linked, @Alice." });
    expect((await getIdentities(db, INST, 'google-chat')).get('alice')).toBe('users/123');
    expect((await getIdentities(db, OTHER, 'google-chat')).get('alice')).toBe('users/123');
    expect((await getIdentities(db, 13, 'google-chat')).size).toBe(0);
  });

  test('added to a dm links too, in the team language', async () => {
    const { deps } = await setup(googleConfig({ language: 'pt-BR' }));
    await bindElsewhere('spaces/AAAA', INST);
    const reply = await handleGoogleChatEvent(deps, {
      ...dm('alice@acme.com'),
      type: 'ADDED_TO_SPACE',
    });
    expect(reply).toEqual({ text: 'Vínculo feito, @Alice.' });
    expect((await getIdentities(db, INST, 'google-chat')).get('alice')).toBe('users/123');
  });

  test('unknown email links nobody', async () => {
    const { deps } = await setup();
    await bindElsewhere('spaces/AAAA', INST);
    const reply = await handleGoogleChatEvent(deps, dm('stranger@other.com'));
    expect(reply?.text).toContain('standcast login');
    expect(reply?.text).toContain('No Standcast account uses this email');
    expect(reply?.text).toContain('Nenhuma conta do Standcast usa este e-mail');
    expect(reply?.text).toContain('Your Google Chat id is users/123');
    expect(reply?.text).toContain('O seu id no Google Chat é users/123');
    expect((await getIdentities(db, INST, 'google-chat')).size).toBe(0);
    const missing = await handleGoogleChatEvent(deps, dm(undefined));
    expect(missing?.text).toContain('No Standcast account uses this email');
    expect(missing?.text).not.toContain('users/123');
  });

  test('an email shared by two accounts links nobody and quarantines their links', async () => {
    const { deps, member } = await setup();
    const twin = await upsertMember(db, { githubUserId: 2, login: 'bob', email: 'Alice@acme.com' });
    const carol = await upsertMember(db, { githubUserId: 3, login: 'carol', email: null });
    await seedOrg(googleConfig(), { id: OTHER, accountLogin: 'beta' });
    await seedOrg(googleConfig(), { id: 13, accountLogin: 'gamma' });
    await setMemberInstallations(db, member.id, [INST, 13]);
    await setMemberInstallations(db, twin.id, [INST]);
    await setMemberInstallations(db, carol.id, [INST, OTHER]);
    await bindElsewhere('spaces/AAAA', INST);
    await bindElsewhere('spaces/BBBB', OTHER);
    await setIdentity(db, INST, member.id, 'google-chat', 'users/555');
    await setIdentity(db, INST, twin.id, 'google-chat', 'users/777');
    await setIdentity(db, INST, carol.id, 'google-chat', 'users/123');
    await setIdentity(db, INST, member.id, 'slack', 'U123');
    await setIdentity(db, OTHER, member.id, 'google-chat', 'users/555');
    await setIdentity(db, OTHER, carol.id, 'google-chat', 'users/123');
    await setIdentity(db, 13, member.id, 'google-chat', 'users/555');
    const reply = await handleGoogleChatEvent(deps, dm('alice@acme.com'));
    expect(reply?.text).toContain('more than one GitHub account');
    expect(reply?.text).toContain('mais de uma conta do GitHub');
    expect(reply?.text).toContain('google_chat');
    expect(reply?.text).toContain('google_chat: users/123');
    expect((await getIdentities(db, INST, 'google-chat')).size).toBe(0);
    expect((await getIdentities(db, INST, 'slack')).get('alice')).toBe('U123');
    const other = await getIdentities(db, OTHER, 'google-chat');
    expect(other.get('alice')).toBe('users/555');
    expect(other.get('carol')).toBe('users/123');
    expect((await getIdentities(db, 13, 'google-chat')).get('alice')).toBe('users/555');
  });

  test('a member with no installation on google chat is told so', async () => {
    const { deps } = await setup();
    const reply = await handleGoogleChatEvent(deps, dm('alice@acme.com'));
    expect(reply?.text).toContain('Google Chat');
    expect(reply?.text).not.toContain("You're linked");
    expect((await getIdentities(db, INST, 'google-chat')).size).toBe(0);
  });

  test('an invalid user name links nobody', async () => {
    const { deps } = await setup();
    await bindElsewhere('spaces/AAAA', INST);
    await handleGoogleChatEvent(deps, dm('alice@acme.com', 'users/abc'));
    expect((await getIdentities(db, INST, 'google-chat')).size).toBe(0);
  });

  test('a failed member lookup never carries the email', async () => {
    const { deps } = await setup();
    const email = 'secret.person@acme.com';
    const failing = {
      now: deps.now,
      db: new Proxy(db, {
        get(target, prop, receiver) {
          if (prop === 'select') {
            return () => {
              throw new Error(`Failed query: select ... params: ${email}`);
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      }),
    };
    const error = await handleGoogleChatEvent(failing, dm(email)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error).message)).not.toContain(email);
    expect(JSON.stringify(error)).not.toContain(email);
    expect((error as Error).stack ?? '').not.toContain(email);
    expect((error as Error).cause).toBeUndefined();
  });

  test('the dm link stores the dm user and the override only names the mention', async () => {
    const cfg = googleConfig({ members: 'members:\n  Alice: { google_chat: users/999 }' });
    const { deps } = await setup(cfg);
    await bindElsewhere('spaces/AAAA', INST);
    await handleGoogleChatEvent(deps, dm('alice@acme.com'));
    expect((await getIdentities(db, INST, 'google-chat')).get('alice')).toBe('users/123');
    expect(await chatUserIdFor(deps, INST, cfg, 'google-chat', 'alice')).toBe('users/999');
  });
});

describe('google chat deliveries', () => {
  test('space bound elsewhere is not linked', async () => {
    const { deps, member } = await setup();
    await seedOrg(googleConfig(), { id: OTHER, accountLogin: 'beta' });
    await bindElsewhere('spaces/AAAA', OTHER);
    await saveConnection(
      db,
      INST,
      'google-chat',
      'spaces/CCCC',
      GOOGLE_CHAT_CONNECTION_SECRET,
      KEY,
    );
    await upsertDaily(db, {
      installationId: INST,
      memberId: member.id,
      date: '2026-10-28',
      payload: daily,
      submittedAt: new Date('2026-10-28T12:00:00Z'),
    });
    const google = fakeChat();
    deps.chatFor = async () => google.chat;
    await sendDigest(deps, { installationId: INST, teamName: 'Alpha', date: '2026-10-28' });
    expect(google.posted).toHaveLength(0);
    const row = await getDelivery(db, {
      installationId: INST,
      teamName: 'Alpha',
      date: '2026-10-28',
      kind: 'digest',
    });
    expect(row?.status).toBe('failed');
    expect(row?.error).toBe('space_not_linked: the space is not linked to this organization');
  });

  test('a space with a pending code is not linked', async () => {
    await setup();
    await issueGoogleChatLinkCode(db, {
      spaceName: 'spaces/AAAA',
      displayName: 'Alpha room',
      codeHash: 'pending',
      expiresAt: new Date('2026-10-29T15:00:00Z'),
      now: new Date('2026-10-28T15:00:00Z'),
    });
    expect(await isGoogleChatSpaceLinked(db, INST, 'spaces/AAAA')).toBe(false);
    await linkSpace('spaces/BBBB');
    expect(await isGoogleChatSpaceLinked(db, INST, 'spaces/BBBB')).toBe(true);
  });

  test('setup never checks a space bound elsewhere and notices it', async () => {
    const { deps, isMember, member } = await setup();
    await seedOrg(googleConfig(), { id: OTHER, accountLogin: 'beta' });
    await bindElsewhere('spaces/AAAA', OTHER);
    const checked: string[] = [];
    deps.chatFor = async () => ({
      ...fakeChat().chat,
      checkChannel: async (channel: string) => {
        checked.push(channel);
        return 'not_member';
      },
    });
    const status = await getSetupStatus(deps, isMember, member, INST);
    expect(checked).toEqual([]);
    expect(status.teamNotices).toContainEqual({
      team: 'Alpha',
      reference: 'spaces/AAAA',
      kind: 'space_not_linked',
    });
    expect(status.teamNotices.some((n) => n.kind === 'channel_not_member')).toBe(false);
  });

  test('setup checks a linked space remotely', async () => {
    const { deps, isMember, member } = await setup();
    await linkSpace('spaces/AAAA');
    const checked: string[] = [];
    deps.chatFor = async () => ({
      ...fakeChat().chat,
      checkChannel: async (channel: string) => {
        checked.push(channel);
        return 'not_member';
      },
    });
    const status = await getSetupStatus(deps, isMember, member, INST);
    expect(checked).toEqual(['spaces/AAAA']);
    expect(status.teamNotices).toContainEqual({
      team: 'Alpha',
      reference: 'spaces/AAAA',
      kind: 'space_not_member',
    });
    expect(status.teamNotices.some((n) => n.kind === 'space_not_linked')).toBe(false);
    expect(status.teamNotices.some((n) => n.kind === 'channel_not_member')).toBe(false);
  });

  test('setup status lists bound spaces', async () => {
    const { deps, isMember, member } = await setup();
    deps.googleChatAvailable = true;
    const code = await issueCode(deps, 'spaces/BBBB');
    await linkGoogleChatSpace(deps, isMember, member, { installationId: INST, code });
    await bindElsewhere('spaces/CCCC', INST);
    await handleGoogleChatEvent(deps, added('spaces/DDDD', 'Pending room'));
    const status = await getSetupStatus(deps, isMember, member, INST);
    expect(status.googleChat).toEqual({
      available: true,
      spaces: [
        { name: 'spaces/BBBB', displayName: 'Alpha room' },
        { name: 'spaces/CCCC', displayName: 'Alpha room' },
      ],
    });
    deps.googleChatAvailable = false;
    expect((await getSetupStatus(deps, isMember, member, INST)).googleChat.available).toBe(false);
  });

  test('setup shows no google chat notices while google chat is off', async () => {
    const { deps, isMember, member } = await setup();
    await seedOrg(googleConfig(), { id: OTHER, accountLogin: 'beta' });
    await bindElsewhere('spaces/AAAA', OTHER);
    expect((await getSetupStatus(deps, isMember, member, INST)).teamNotices).toContainEqual({
      team: 'Alpha',
      reference: 'spaces/AAAA',
      kind: 'space_not_linked',
    });
    deps.googleChatAvailable = false;
    expect((await getSetupStatus(deps, isMember, member, INST)).teamNotices).toEqual([]);
  });
});
