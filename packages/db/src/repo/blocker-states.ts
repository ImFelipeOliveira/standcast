import type { Ref } from '@standcast/core';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from '../client';
import { type BlockerStateRow, blockerStates, dailies, members } from '../schema';

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

export type OpenBlockerState = BlockerStateRow & { authorLogin: string };

export async function listCurrentOpenBlockerStates(
  db: Db,
  installationId: number,
  authorMemberIds: string[],
): Promise<OpenBlockerState[]> {
  if (authorMemberIds.length === 0) return [];
  const latest = sql`(select max(${dailies.date}) from ${dailies} where ${dailies.installationId} = ${blockerStates.installationId} and ${dailies.memberId} = ${blockerStates.authorMemberId})`;
  const rows = await db
    .select({ state: blockerStates, authorLogin: members.login })
    .from(blockerStates)
    .innerJoin(members, eq(members.id, blockerStates.authorMemberId))
    .where(
      and(
        eq(blockerStates.installationId, installationId),
        inArray(blockerStates.authorMemberId, authorMemberIds),
        isNull(blockerStates.resolvedAt),
        sql`${blockerStates.lastSeenOn} = ${latest}`,
      ),
    )
    .orderBy(asc(blockerStates.openedOn), asc(members.login), asc(blockerStates.text));
  return rows.map((r) => ({ ...r.state, authorLogin: r.authorLogin }));
}
