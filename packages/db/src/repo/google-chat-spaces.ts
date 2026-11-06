import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import type { Db } from '../client';
import { connections, googleChatSpaces, memberIdentities } from '../schema';

export type GoogleChatSpace = { name: string; displayName: string };

export type RedeemLinkCodeResult =
  | { status: 'linked'; space: GoogleChatSpace }
  | { status: 'invalid' }
  | { status: 'linked_elsewhere' };

export async function issueGoogleChatLinkCode(
  db: Db,
  input: { spaceName: string; displayName: string; codeHash: string; expiresAt: Date },
): Promise<void> {
  const values = {
    displayName: input.displayName,
    linkCodeHash: input.codeHash,
    linkCodeExpiresAt: input.expiresAt,
  };
  await db
    .insert(googleChatSpaces)
    .values({ spaceName: input.spaceName, ...values })
    .onConflictDoUpdate({ target: googleChatSpaces.spaceName, set: values });
}

export async function redeemGoogleChatLinkCode(
  db: Db,
  input: { codeHash: string; installationId: number; now: Date },
): Promise<RedeemLinkCodeResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(googleChatSpaces)
      .where(eq(googleChatSpaces.linkCodeHash, input.codeHash))
      .for('update');
    if (!row?.linkCodeExpiresAt || row.linkCodeExpiresAt.getTime() <= input.now.getTime()) {
      return { status: 'invalid' };
    }
    if (row.installationId !== null && row.installationId !== input.installationId) {
      return { status: 'linked_elsewhere' };
    }
    await tx
      .update(googleChatSpaces)
      .set({
        installationId: input.installationId,
        linkCodeHash: null,
        linkCodeExpiresAt: null,
        linkedAt: input.now,
      })
      .where(eq(googleChatSpaces.spaceName, row.spaceName));
    return { status: 'linked', space: { name: row.spaceName, displayName: row.displayName } };
  });
}

export async function removeGoogleChatSpace(db: Db, spaceName: string): Promise<number | null> {
  const [row] = await db
    .delete(googleChatSpaces)
    .where(eq(googleChatSpaces.spaceName, spaceName))
    .returning({ installationId: googleChatSpaces.installationId });
  return row?.installationId ?? null;
}

export async function deleteGoogleChatSpaceBinding(
  db: Db,
  installationId: number,
  spaceName: string,
): Promise<boolean> {
  const deleted = await db
    .delete(googleChatSpaces)
    .where(
      and(
        eq(googleChatSpaces.installationId, installationId),
        eq(googleChatSpaces.spaceName, spaceName),
      ),
    )
    .returning({ spaceName: googleChatSpaces.spaceName });
  return deleted.length > 0;
}

export async function listGoogleChatSpaces(
  db: Db,
  installationId: number,
): Promise<GoogleChatSpace[]> {
  return db
    .select({ name: googleChatSpaces.spaceName, displayName: googleChatSpaces.displayName })
    .from(googleChatSpaces)
    .where(
      and(
        eq(googleChatSpaces.installationId, installationId),
        isNotNull(googleChatSpaces.linkedAt),
      ),
    )
    .orderBy(asc(googleChatSpaces.displayName), asc(googleChatSpaces.spaceName));
}

export async function isGoogleChatSpaceLinked(
  db: Db,
  installationId: number,
  spaceName: string,
): Promise<boolean> {
  const [row] = await db
    .select({ spaceName: googleChatSpaces.spaceName })
    .from(googleChatSpaces)
    .where(
      and(
        eq(googleChatSpaces.installationId, installationId),
        eq(googleChatSpaces.spaceName, spaceName),
      ),
    );
  return row !== undefined;
}

export async function deleteGoogleChatConnectionIfUnused(
  db: Db,
  installationId: number,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const deleted = await tx
      .delete(connections)
      .where(
        and(
          eq(connections.installationId, installationId),
          eq(connections.provider, 'google-chat'),
          sql`not exists (select 1 from ${googleChatSpaces} where ${googleChatSpaces.installationId} = ${installationId})`,
        ),
      )
      .returning({ externalId: connections.externalId });
    if (deleted.length === 0) return false;
    await tx
      .delete(memberIdentities)
      .where(
        and(
          eq(memberIdentities.installationId, installationId),
          eq(memberIdentities.provider, 'google-chat'),
        ),
      );
    return true;
  });
}
