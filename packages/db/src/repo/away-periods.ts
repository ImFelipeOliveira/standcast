import { and, asc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { Db } from '../client';
import { type AwayPeriodRow, awayPeriods } from '../schema';

export type { AwayPeriodRow };

const LIST_LIMIT = 50;

export async function createAwayPeriod(
  db: Db,
  input: { installationId: number; login: string; from: string; until: string; createdBy: string },
): Promise<AwayPeriodRow | 'overlap'> {
  const login = input.login.toLowerCase();
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`away:${input.installationId}:${login}`}))`,
    );
    const [clash] = await tx
      .select({ id: awayPeriods.id })
      .from(awayPeriods)
      .where(
        and(
          eq(awayPeriods.installationId, input.installationId),
          eq(awayPeriods.login, login),
          isNull(awayPeriods.cancelledAt),
          lte(awayPeriods.fromDate, input.until),
          gte(awayPeriods.untilDate, input.from),
        ),
      )
      .limit(1);
    if (clash) return 'overlap';
    const [row] = await tx
      .insert(awayPeriods)
      .values({
        installationId: input.installationId,
        login,
        fromDate: input.from,
        untilDate: input.until,
        createdBy: input.createdBy,
      })
      .returning();
    if (!row) throw new Error('away period insert returned no row');
    return row;
  });
}

export async function cancelAwayPeriod(
  db: Db,
  input: { installationId: number; id: string; cancelledBy: string },
): Promise<AwayPeriodRow | null> {
  const [row] = await db
    .update(awayPeriods)
    .set({ cancelledAt: sql`now()`, cancelledBy: input.cancelledBy })
    .where(
      and(
        eq(awayPeriods.installationId, input.installationId),
        eq(awayPeriods.id, input.id),
        isNull(awayPeriods.cancelledAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function getAwayPeriod(
  db: Db,
  installationId: number,
  id: string,
): Promise<AwayPeriodRow | null> {
  const [row] = await db
    .select()
    .from(awayPeriods)
    .where(and(eq(awayPeriods.installationId, installationId), eq(awayPeriods.id, id)));
  return row ?? null;
}

export async function listAwayPeriods(
  db: Db,
  installationId: number,
  login: string,
  fromDate: string,
): Promise<AwayPeriodRow[]> {
  return db
    .select()
    .from(awayPeriods)
    .where(
      and(
        eq(awayPeriods.installationId, installationId),
        eq(awayPeriods.login, login.toLowerCase()),
        isNull(awayPeriods.cancelledAt),
        gte(awayPeriods.untilDate, fromDate),
      ),
    )
    .orderBy(asc(awayPeriods.fromDate))
    .limit(LIST_LIMIT);
}

export async function awayLogins(
  db: Db,
  installationId: number,
  logins: string[],
  date: string,
): Promise<Set<string>> {
  if (logins.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ login: awayPeriods.login })
    .from(awayPeriods)
    .where(
      and(
        eq(awayPeriods.installationId, installationId),
        inArray(
          awayPeriods.login,
          logins.map((l) => l.toLowerCase()),
        ),
        isNull(awayPeriods.cancelledAt),
        lte(awayPeriods.fromDate, date),
        gte(awayPeriods.untilDate, date),
      ),
    );
  return new Set(rows.map((r) => r.login));
}
