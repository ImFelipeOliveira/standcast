import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import type { Db } from '../client';
import { googleChatSignInTokens } from '../schema';

export type GoogleChatSignInToken = {
  chatUserId: string;
  chatEmail: string | null;
  installationId: number;
  spaceName: string;
};

const returned = {
  chatUserId: googleChatSignInTokens.chatUserId,
  chatEmail: googleChatSignInTokens.chatEmail,
  installationId: googleChatSignInTokens.installationId,
  spaceName: googleChatSignInTokens.spaceName,
};

export async function issueGoogleChatSignInToken(
  db: Db,
  input: GoogleChatSignInToken & { tokenHash: string; expiresAt: Date },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(googleChatSignInTokens)
      .where(
        and(
          eq(googleChatSignInTokens.installationId, input.installationId),
          eq(googleChatSignInTokens.chatUserId, input.chatUserId),
          isNull(googleChatSignInTokens.usedAt),
        ),
      );
    await tx.insert(googleChatSignInTokens).values(input);
  });
}

export async function findGoogleChatSignInToken(
  db: Db,
  tokenHash: string,
  now: Date,
): Promise<GoogleChatSignInToken | null> {
  const [row] = await db
    .select(returned)
    .from(googleChatSignInTokens)
    .where(
      and(
        eq(googleChatSignInTokens.tokenHash, tokenHash),
        isNull(googleChatSignInTokens.usedAt),
        gt(googleChatSignInTokens.expiresAt, now),
      ),
    );
  return row ?? null;
}

export async function consumeGoogleChatSignInToken(
  db: Db,
  tokenHash: string,
  now: Date,
): Promise<GoogleChatSignInToken | null> {
  const [row] = await db
    .update(googleChatSignInTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(googleChatSignInTokens.tokenHash, tokenHash),
        isNull(googleChatSignInTokens.usedAt),
        gt(googleChatSignInTokens.expiresAt, now),
      ),
    )
    .returning(returned);
  return row ?? null;
}

export async function pruneGoogleChatSignInTokens(db: Db, expiredBefore: Date): Promise<number> {
  const deleted = await db
    .delete(googleChatSignInTokens)
    .where(lt(googleChatSignInTokens.expiresAt, expiredBefore))
    .returning({ tokenHash: googleChatSignInTokens.tokenHash });
  return deleted.length;
}
