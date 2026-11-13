import type { Ref } from '@standcast/core';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  notInArray,
  type SQL,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
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
  const reopens = sql`${blockerStates.resolvedAt} is not null and excluded.last_seen_on > coalesce(${blockerStates.resolvedOn}, ${blockerStates.lastSeenOn})`;
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
        openedOn: sql`case when ${reopens} then excluded.opened_on else least(${blockerStates.openedOn}, excluded.opened_on) end`,
        lastSeenOn: sql`case when ${reopens} then excluded.last_seen_on else greatest(${blockerStates.lastSeenOn}, excluded.last_seen_on) end`,
        resolvedAt: sql`case when ${reopens} then null else ${blockerStates.resolvedAt} end`,
        resolvedByMemberId: sql`case when ${reopens} then null else ${blockerStates.resolvedByMemberId} end`,
        resolvedOn: sql`case when ${reopens} then null else ${blockerStates.resolvedOn} end`,
      },
    })
    .returning();
  if (!row) throw new Error('upsertBlockerState returned no row');
  return row;
}

export type RetireBlockerStatesInput = {
  installationId: number;
  authorMemberId: string;
  date: string;
  keep: string[];
};

export async function retireMissingBlockerStates(
  db: Db,
  input: RetireBlockerStatesInput,
): Promise<void> {
  const missing: SQL[] = [
    eq(blockerStates.installationId, input.installationId),
    eq(blockerStates.authorMemberId, input.authorMemberId),
    eq(blockerStates.lastSeenOn, input.date),
    isNull(blockerStates.resolvedAt),
  ];
  if (input.keep.length > 0) missing.push(notInArray(blockerStates.blockerId, input.keep));
  const previous = sql`(select max(${dailies.date}) from ${dailies} where ${dailies.installationId} = ${input.installationId} and ${dailies.memberId} = ${input.authorMemberId} and ${dailies.date} < ${input.date})`;
  await db.transaction(async (tx) => {
    await tx.delete(blockerStates).where(and(...missing, eq(blockerStates.openedOn, input.date)));
    await tx
      .update(blockerStates)
      .set({
        lastSeenOn: sql`greatest(${blockerStates.openedOn}, coalesce(${previous}, ${blockerStates.openedOn}))`,
      })
      .where(and(...missing, lt(blockerStates.openedOn, input.date)));
  });
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
  resolution: { at: Date; by: string; on: string } | null,
): Promise<boolean> {
  const rows = await db
    .update(blockerStates)
    .set({
      resolvedAt: resolution?.at ?? null,
      resolvedByMemberId: resolution?.by ?? null,
      resolvedOn: resolution?.on ?? null,
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
  const latest = latestDailyOfAuthor();
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

export type ResolvedBlockerState = BlockerStateRow & {
  authorLogin: string;
  resolvedByLogin: string | null;
  current: boolean;
};

function latestDailyOfAuthor(): SQL {
  return sql`(select max(${dailies.date}) from ${dailies} where ${dailies.installationId} = ${blockerStates.installationId} and ${dailies.memberId} = ${blockerStates.authorMemberId})`;
}

export async function isBlockerStateCurrent(
  db: Db,
  installationId: number,
  id: string,
): Promise<boolean> {
  const [row] = await db
    .select({
      current: sql<boolean>`coalesce(${blockerStates.lastSeenOn} = ${latestDailyOfAuthor()}, false)`,
    })
    .from(blockerStates)
    .where(and(eq(blockerStates.id, id), eq(blockerStates.installationId, installationId)));
  return row?.current === true;
}

export async function listResolvedBlockerStates(
  db: Db,
  installationId: number,
  authorMemberIds: string[],
  sinceDate: string,
): Promise<ResolvedBlockerState[]> {
  if (authorMemberIds.length === 0) return [];
  const resolver = alias(members, 'resolver');
  const rows = await db
    .select({
      state: blockerStates,
      authorLogin: members.login,
      resolvedByLogin: resolver.login,
      current: sql<boolean>`coalesce(${blockerStates.lastSeenOn} = ${latestDailyOfAuthor()}, false)`,
    })
    .from(blockerStates)
    .innerJoin(members, eq(members.id, blockerStates.authorMemberId))
    .leftJoin(resolver, eq(resolver.id, blockerStates.resolvedByMemberId))
    .where(
      and(
        eq(blockerStates.installationId, installationId),
        inArray(blockerStates.authorMemberId, authorMemberIds),
        isNotNull(blockerStates.resolvedAt),
        gte(blockerStates.resolvedOn, sinceDate),
      ),
    )
    .orderBy(desc(blockerStates.resolvedAt))
    .limit(100);
  return rows.map((r) => ({
    ...r.state,
    authorLogin: r.authorLogin,
    resolvedByLogin: r.resolvedByLogin ?? null,
    current: r.current === true,
  }));
}
