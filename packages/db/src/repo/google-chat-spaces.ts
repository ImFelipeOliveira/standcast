import { and, asc, count, eq, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import type { Db } from '../client';
import { encryptSecret } from '../crypto';
import { connections, googleChatSpaces } from '../schema';

export type GoogleChatSpace = { name: string; displayName: string };

export type RedeemLinkCodeResult =
  | { status: 'linked'; space: GoogleChatSpace }
  | { status: 'invalid' }
  | { status: 'linked_elsewhere' }
  | { status: 'too_many_spaces' };

const connectionLock = (installationId: number) =>
  sql`select pg_advisory_xact_lock(hashtext(${`google-chat-connection:${installationId}`}))`;

export async function issueGoogleChatLinkCode(
  db: Db,
  input: {
    spaceName: string;
    displayName: string;
    codeHash: string;
    expiresAt: Date;
    now: Date;
  },
): Promise<void> {
  const values = {
    displayName: input.displayName,
    linkCodeHash: input.codeHash,
    linkCodeExpiresAt: input.expiresAt,
  };
  await db.transaction(async (tx) => {
    await tx
      .delete(googleChatSpaces)
      .where(
        and(
          isNull(googleChatSpaces.installationId),
          or(
            isNull(googleChatSpaces.linkCodeExpiresAt),
            lte(googleChatSpaces.linkCodeExpiresAt, input.now),
          ),
        ),
      );
    await tx
      .update(googleChatSpaces)
      .set({ linkCodeHash: null, linkCodeExpiresAt: null })
      .where(
        and(
          isNotNull(googleChatSpaces.linkCodeHash),
          lte(googleChatSpaces.linkCodeExpiresAt, input.now),
        ),
      );
    await tx
      .insert(googleChatSpaces)
      .values({ spaceName: input.spaceName, ...values })
      .onConflictDoUpdate({ target: googleChatSpaces.spaceName, set: values });
  });
}

export async function redeemGoogleChatLinkCode(
  db: Db,
  input: {
    codeHash: string;
    installationId: number;
    now: Date;
    maxSpaces: number;
    connection: { secret: string; key: Uint8Array };
  },
): Promise<RedeemLinkCodeResult> {
  return db.transaction(async (tx) => {
    await tx.execute(connectionLock(input.installationId));
    const [row] = await tx
      .select()
      .from(googleChatSpaces)
      .where(eq(googleChatSpaces.linkCodeHash, input.codeHash))
      .for('update');
    if (!row) return { status: 'invalid' };
    if (!row.linkCodeExpiresAt || row.linkCodeExpiresAt.getTime() <= input.now.getTime()) {
      if (row.installationId === null) {
        await tx.delete(googleChatSpaces).where(eq(googleChatSpaces.spaceName, row.spaceName));
      } else {
        await tx
          .update(googleChatSpaces)
          .set({ linkCodeHash: null, linkCodeExpiresAt: null })
          .where(eq(googleChatSpaces.spaceName, row.spaceName));
      }
      return { status: 'invalid' };
    }
    if (row.installationId !== null && row.installationId !== input.installationId) {
      return { status: 'linked_elsewhere' };
    }
    if (row.installationId === null) {
      const [linked] = await tx
        .select({ total: count() })
        .from(googleChatSpaces)
        .where(
          and(
            eq(googleChatSpaces.installationId, input.installationId),
            isNotNull(googleChatSpaces.linkedAt),
          ),
        );
      if ((linked?.total ?? 0) >= input.maxSpaces) return { status: 'too_many_spaces' };
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
    await tx
      .insert(connections)
      .values({
        installationId: input.installationId,
        provider: 'google-chat',
        externalId: row.spaceName,
        secretCiphertext: encryptSecret(input.connection.secret, input.connection.key),
      })
      .onConflictDoNothing({ target: [connections.installationId, connections.provider] });
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
        isNotNull(googleChatSpaces.linkedAt),
      ),
    );
  return row !== undefined;
}

export async function deleteGoogleChatConnectionIfUnused(
  db: Db,
  installationId: number,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(connectionLock(installationId));
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
    return deleted.length > 0;
  });
}
