import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import {
  consumeGoogleChatSignInToken,
  findGoogleChatSignInToken,
  getLinkedGoogleChatSpaceInstallation,
  issueGoogleChatLinkCode,
  issueGoogleChatSignInToken,
  pruneGoogleChatSignInTokens,
  redeemGoogleChatLinkCode,
  upsertInstallation,
} from '../src';
import { googleChatSignInTokens, installations } from '../src/schema';
import { db, useCleanDb } from './setup';

useCleanDb();

const A = 100;
const B = 200;
const now = new Date('2026-11-16T12:00:00Z');
const inFuture = new Date(now.getTime() + 600_000);

async function seed() {
  await upsertInstallation(db, { id: A, accountLogin: 'acme', accountType: 'Organization' });
  await upsertInstallation(db, { id: B, accountLogin: 'other', accountType: 'Organization' });
}

const issue = (
  tokenHash: string,
  over: Partial<Parameters<typeof issueGoogleChatSignInToken>[1]> = {},
) =>
  issueGoogleChatSignInToken(db, {
    tokenHash,
    chatUserId: 'users/1',
    chatEmail: 'a@x.com',
    installationId: A,
    spaceName: 'spaces/AAA',
    expiresAt: inFuture,
    ...over,
  });

describe('google chat sign-in tokens', () => {
  test('issued token is found and consumed once', async () => {
    await seed();
    await issue('h1');
    const expected = {
      chatUserId: 'users/1',
      chatEmail: 'a@x.com',
      installationId: A,
      spaceName: 'spaces/AAA',
    };
    expect(await findGoogleChatSignInToken(db, 'h1', now)).toEqual(expected);
    expect(await consumeGoogleChatSignInToken(db, 'h1', now)).toEqual(expected);
    expect(await consumeGoogleChatSignInToken(db, 'h1', now)).toBeNull();
    expect(await findGoogleChatSignInToken(db, 'h1', now)).toBeNull();
  });

  test('an expired token is neither found nor consumed', async () => {
    await seed();
    await issue('h1', { expiresAt: new Date(now.getTime() - 1000) });
    expect(await findGoogleChatSignInToken(db, 'h1', now)).toBeNull();
    expect(await consumeGoogleChatSignInToken(db, 'h1', now)).toBeNull();
  });

  test('a token expiring exactly now is neither found nor consumed', async () => {
    await seed();
    await issue('h1', { expiresAt: now });
    expect(await findGoogleChatSignInToken(db, 'h1', now)).toBeNull();
    expect(await consumeGoogleChatSignInToken(db, 'h1', now)).toBeNull();
  });

  test('a new token for the same user and installation replaces the unused one', async () => {
    await seed();
    await issue('h1');
    await issue('h2');
    expect(await findGoogleChatSignInToken(db, 'h1', now)).toBeNull();
    expect(await findGoogleChatSignInToken(db, 'h2', now)).not.toBeNull();
  });

  test('tokens of other users or installations are kept', async () => {
    await seed();
    await issue('h1');
    await issue('h2', { installationId: B });
    await issue('h3', { chatUserId: 'users/2' });
    for (const h of ['h1', 'h2', 'h3']) {
      expect(await findGoogleChatSignInToken(db, h, now)).not.toBeNull();
    }
  });

  test('concurrent consumes return the token once', async () => {
    await seed();
    await issue('h1');
    const r = await Promise.all([
      consumeGoogleChatSignInToken(db, 'h1', now),
      consumeGoogleChatSignInToken(db, 'h1', now),
    ]);
    expect(r.filter((x) => x !== null)).toHaveLength(1);
  });

  test('prune deletes tokens expired before the cutoff', async () => {
    await seed();
    await issue('old', { expiresAt: new Date(now.getTime() - 2 * 86_400_000) });
    await issue('new', { chatUserId: 'users/2', expiresAt: new Date(now.getTime() + 86_400_000) });
    const cutoff = new Date(now.getTime() - 86_400_000);
    expect(await pruneGoogleChatSignInTokens(db, cutoff)).toBe(1);
    expect(await findGoogleChatSignInToken(db, 'new', now)).not.toBeNull();
  });

  test('deleting the installation deletes its tokens', async () => {
    await seed();
    await issue('h1');
    await db.delete(installations).where(eq(installations.id, A));
    expect(await db.select().from(googleChatSignInTokens)).toEqual([]);
  });

  test('getLinkedGoogleChatSpaceInstallation returns the installation of a linked space and null otherwise', async () => {
    await seed();
    await issueGoogleChatLinkCode(db, {
      spaceName: 'spaces/AAA',
      displayName: 'Team',
      codeHash: 'c1',
      expiresAt: inFuture,
      now,
    });
    expect(await getLinkedGoogleChatSpaceInstallation(db, 'spaces/AAA')).toBeNull();
    expect(await getLinkedGoogleChatSpaceInstallation(db, 'spaces/ZZZ')).toBeNull();
    await redeemGoogleChatLinkCode(db, {
      codeHash: 'c1',
      installationId: A,
      now,
      maxSpaces: 5,
      connection: { secret: 's', key: new Uint8Array(32) },
    });
    expect(await getLinkedGoogleChatSpaceInstallation(db, 'spaces/AAA')).toBe(A);
  });
});
