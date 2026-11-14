import { and, eq, gt, inArray, ne, or, sql } from 'drizzle-orm';
import type { Db } from '../client';
import {
  installations,
  type MemberRow,
  memberIdentities,
  memberInstallations,
  members,
  type Provider,
} from '../schema';

export const VERIFIED_EMAILS_MAX_AGE_DAYS = 30;

function normalizeEmails(emails: string[]): string[] {
  return [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
}

export async function upsertMember(
  db: Db,
  m: { githubUserId: number; login: string; email: string | null; verifiedEmails?: string[] },
): Promise<MemberRow> {
  const verifiedEmails = m.verifiedEmails ? normalizeEmails(m.verifiedEmails) : undefined;
  const synced = verifiedEmails ? { verifiedEmails, verifiedEmailsSyncedAt: sql`now()` } : {};
  const values = {
    githubUserId: m.githubUserId,
    login: m.login,
    email: m.email,
    ...synced,
  };
  return db.transaction(async (tx) => {
    await tx
      .update(members)
      .set({ login: sql`'~' || ${members.githubUserId}` })
      .where(
        and(
          sql`lower(${members.login}) = lower(${m.login})`,
          ne(members.githubUserId, m.githubUserId),
        ),
      );
    const [row] = await tx
      .insert(members)
      .values(values)
      .onConflictDoUpdate({
        target: members.githubUserId,
        set: { login: m.login, email: m.email, ...synced },
      })
      .returning();
    if (!row) throw new Error('upsertMember returned no row');
    return row;
  });
}

export async function updateMemberLogin(
  db: Db,
  githubUserId: number,
  login: string,
): Promise<MemberRow | null> {
  return db.transaction(async (tx) => {
    await tx
      .update(members)
      .set({ login: sql`'~' || ${members.githubUserId}` })
      .where(
        and(sql`lower(${members.login}) = lower(${login})`, ne(members.githubUserId, githubUserId)),
      );
    const [row] = await tx
      .update(members)
      .set({ login })
      .where(eq(members.githubUserId, githubUserId))
      .returning();
    return row ?? null;
  });
}

export async function setMemberInstallations(
  db: Db,
  memberId: string,
  installationIds: number[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(memberInstallations).where(eq(memberInstallations.memberId, memberId));
    if (installationIds.length > 0) {
      await tx
        .insert(memberInstallations)
        .values(installationIds.map((installationId) => ({ memberId, installationId })));
    }
  });
}

export async function addMemberInstallation(
  db: Db,
  memberId: string,
  installationId: number,
): Promise<void> {
  await db.insert(memberInstallations).values({ memberId, installationId }).onConflictDoNothing();
}

export async function setIdentity(
  db: Db,
  installationId: number,
  memberId: string,
  provider: Provider,
  externalId: string,
): Promise<void> {
  await db
    .insert(memberIdentities)
    .values({ installationId, memberId, provider, externalId })
    .onConflictDoUpdate({
      target: [
        memberIdentities.installationId,
        memberIdentities.memberId,
        memberIdentities.provider,
      ],
      set: { externalId },
    });
}

export async function getIdentities(
  db: Db,
  installationId: number,
  provider: Provider,
): Promise<Map<string, string>> {
  const rows = await db
    .select({ login: members.login, externalId: memberIdentities.externalId })
    .from(memberIdentities)
    .innerJoin(members, eq(members.id, memberIdentities.memberId))
    .where(
      and(
        eq(memberIdentities.installationId, installationId),
        eq(memberIdentities.provider, provider),
      ),
    );
  return new Map(rows.map((r) => [r.login.toLowerCase(), r.externalId]));
}

export async function getMemberLogins(db: Db, logins: string[]): Promise<Map<string, string>> {
  if (logins.length === 0) return new Map();
  const lowered = logins.map((l) => l.toLowerCase());
  const rows = await db
    .select({ login: members.login })
    .from(members)
    .where(inArray(sql`lower(${members.login})`, lowered));
  return new Map(rows.map((r) => [r.login.toLowerCase(), r.login]));
}

export async function getInstallationMemberIds(
  db: Db,
  installationId: number,
  logins: string[],
): Promise<Map<string, string>> {
  if (logins.length === 0) return new Map();
  const lowered = [...new Set(logins.map((l) => l.toLowerCase()))];
  const rows = await db
    .select({ id: members.id, login: members.login })
    .from(members)
    .innerJoin(memberInstallations, eq(memberInstallations.memberId, members.id))
    .where(
      and(
        eq(memberInstallations.installationId, installationId),
        inArray(sql`lower(${members.login})`, lowered),
      ),
    );
  return new Map(rows.map((r) => [r.login.toLowerCase(), r.id]));
}

export async function getMemberById(db: Db, id: string): Promise<MemberRow | null> {
  const [row] = await db.select().from(members).where(eq(members.id, id));
  return row ?? null;
}

export async function listMemberInstallations(
  db: Db,
  memberId: string,
): Promise<{ installationId: number; accountLogin: string }[]> {
  return db
    .select({ installationId: installations.id, accountLogin: installations.accountLogin })
    .from(memberInstallations)
    .innerJoin(installations, eq(installations.id, memberInstallations.installationId))
    .where(eq(memberInstallations.memberId, memberId))
    .orderBy(installations.id);
}

export async function removeMemberInstallation(
  db: Db,
  memberId: string,
  installationId: number,
): Promise<void> {
  await db
    .delete(memberInstallations)
    .where(
      and(
        eq(memberInstallations.memberId, memberId),
        eq(memberInstallations.installationId, installationId),
      ),
    );
}

export async function findMemberByIdentity(
  db: Db,
  installationId: number,
  provider: Provider,
  externalId: string,
): Promise<MemberRow | null> {
  const rows = await db
    .select({ member: members })
    .from(memberIdentities)
    .innerJoin(members, eq(members.id, memberIdentities.memberId))
    .where(
      and(
        eq(memberIdentities.installationId, installationId),
        eq(memberIdentities.provider, provider),
        eq(memberIdentities.externalId, externalId),
      ),
    )
    .limit(2);
  return rows.length === 1 ? (rows[0]?.member ?? null) : null;
}

export async function deleteIdentityByLogin(
  db: Db,
  installationId: number,
  provider: Provider,
  login: string,
  externalId: string,
): Promise<void> {
  await db
    .delete(memberIdentities)
    .where(
      and(
        eq(memberIdentities.installationId, installationId),
        eq(memberIdentities.provider, provider),
        eq(memberIdentities.externalId, externalId),
        inArray(
          memberIdentities.memberId,
          db
            .select({ id: members.id })
            .from(members)
            .where(sql`lower(${members.login}) = ${login.toLowerCase()}`),
        ),
      ),
    );
}

export async function deleteInstallationIdentities(
  db: Db,
  installationId: number,
  provider: Provider,
  match: { memberIds: string[]; externalId: string },
): Promise<void> {
  await db
    .delete(memberIdentities)
    .where(
      and(
        eq(memberIdentities.installationId, installationId),
        eq(memberIdentities.provider, provider),
        or(
          inArray(memberIdentities.memberId, match.memberIds),
          eq(memberIdentities.externalId, match.externalId),
        ),
      ),
    );
}

export async function listInstallationMembers(
  db: Db,
  installationId: number,
  page: { logins?: string[]; afterLogin?: string; limit?: number } = {},
): Promise<{ id: string; login: string; email: string | null }[]> {
  const lower = sql<string>`lower(${members.login})`;
  const filters = [eq(memberInstallations.installationId, installationId)];
  if (page.logins) {
    if (page.logins.length === 0) return [];
    filters.push(
      inArray(
        lower,
        page.logins.map((l) => l.toLowerCase()),
      ),
    );
  }
  if (page.afterLogin !== undefined) filters.push(gt(lower, page.afterLogin.toLowerCase()));
  const query = db
    .select({ id: members.id, login: members.login, email: members.email })
    .from(memberInstallations)
    .innerJoin(members, eq(members.id, memberInstallations.memberId))
    .where(and(...filters))
    .orderBy(lower);
  return page.limit === undefined ? query : query.limit(page.limit);
}

export async function getIdentityByLogin(
  db: Db,
  installationId: number,
  provider: Provider,
  login: string,
): Promise<string | null> {
  const rows = await db
    .select({ externalId: memberIdentities.externalId })
    .from(memberIdentities)
    .innerJoin(members, eq(members.id, memberIdentities.memberId))
    .where(
      and(
        eq(memberIdentities.installationId, installationId),
        eq(memberIdentities.provider, provider),
        eq(sql`lower(${members.login})`, login.toLowerCase()),
      ),
    )
    .limit(2);
  return rows.length === 1 ? (rows[0]?.externalId ?? null) : null;
}

export async function findMembersByEmail(db: Db, email: string): Promise<MemberRow[]> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return [];
  return db
    .select()
    .from(members)
    .where(
      or(
        sql`lower(${members.email}) = ${normalized}`,
        and(
          sql`${members.verifiedEmails} @> ARRAY[${normalized}]::text[]`,
          sql`${members.verifiedEmailsSyncedAt} > now() - make_interval(days => ${VERIFIED_EMAILS_MAX_AGE_DAYS})`,
        ),
      ),
    )
    .orderBy(members.login);
}

export async function listMemberIdentities(
  db: Db,
  installationId: number,
  memberIds: string[],
): Promise<{ memberId: string; provider: Provider; externalId: string }[]> {
  if (memberIds.length === 0) return [];
  return db
    .select({
      memberId: memberIdentities.memberId,
      provider: memberIdentities.provider,
      externalId: memberIdentities.externalId,
    })
    .from(memberIdentities)
    .where(
      and(
        eq(memberIdentities.installationId, installationId),
        inArray(memberIdentities.memberId, memberIds),
      ),
    );
}
