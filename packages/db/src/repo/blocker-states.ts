import type { Ref } from '@standcast/core';
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../client';
import { type BlockerStateRow, blockerStates } from '../schema';

export type BlockerStateInput = {
  installationId: number;
  authorMemberId: string;
  blockerId: string;
  text: string;
  ref: Ref | null;
  date: string;
};

export async function upsertBlockerState(
  db: Db,
  input: BlockerStateInput,
): Promise<BlockerStateRow> {
  const [row] = await db
    .insert(blockerStates)
    .values({
      installationId: input.installationId,
      authorMemberId: input.authorMemberId,
      blockerId: input.blockerId,
      text: input.text,
      ref: input.ref,
      openedOn: input.date,
      lastSeenOn: input.date,
    })
    .onConflictDoUpdate({
      target: [blockerStates.installationId, blockerStates.authorMemberId, blockerStates.blockerId],
      set: {
        text: sql`excluded.text`,
        ref: sql`excluded.ref`,
        openedOn: sql`case when ${blockerStates.resolvedAt} is null then least(${blockerStates.openedOn}, excluded.opened_on) else excluded.opened_on end`,
        lastSeenOn: sql`case when ${blockerStates.resolvedAt} is null then greatest(${blockerStates.lastSeenOn}, excluded.last_seen_on) else excluded.last_seen_on end`,
        resolvedAt: null,
        resolvedByMemberId: null,
      },
    })
    .returning();
  if (!row) throw new Error('upsertBlockerState returned no row');
  return row;
}

export async function getBlockerState(
  db: Db,
  installationId: number,
  id: string,
): Promise<BlockerStateRow | null> {
  const [row] = await db
    .select()
    .from(blockerStates)
    .where(and(eq(blockerStates.id, id), eq(blockerStates.installationId, installationId)));
  return row ?? null;
}

export async function setBlockerStateResolved(
  db: Db,
  installationId: number,
  id: string,
  resolution: { at: Date; by: string } | null,
): Promise<boolean> {
  const rows = await db
    .update(blockerStates)
    .set({
      resolvedAt: resolution?.at ?? null,
      resolvedByMemberId: resolution?.by ?? null,
    })
    .where(and(eq(blockerStates.id, id), eq(blockerStates.installationId, installationId)))
    .returning({ id: blockerStates.id });
  return rows.length > 0;
}
