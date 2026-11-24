import type { LlmProvider, ReportItem, Weekday } from '@standcast/core';
import { and, asc, eq, gt, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import type { Db } from '../client';
import { decryptSecret, encryptSecret } from '../crypto';
import { llmSettings, productionPullRequests, productionReports, teamReports } from '../schema';
import { PRUNE_BATCH } from './prune-batch';

export type LlmSettingsRow = {
  installationId: number;
  provider: LlmProvider;
  model: string;
  keyLast4: string;
  rejectedAt: Date | null;
};

const llmColumns = {
  installationId: llmSettings.installationId,
  provider: llmSettings.provider,
  model: llmSettings.model,
  keyLast4: llmSettings.keyLast4,
  rejectedAt: llmSettings.rejectedAt,
};

export async function getLlmSettings(
  db: Db,
  installationId: number,
): Promise<LlmSettingsRow | null> {
  const [row] = await db
    .select(llmColumns)
    .from(llmSettings)
    .where(eq(llmSettings.installationId, installationId));
  return row ?? null;
}

export async function getLlmApiKey(
  db: Db,
  installationId: number,
  key: Uint8Array,
): Promise<string | null> {
  const [row] = await db
    .select({ keyCiphertext: llmSettings.keyCiphertext })
    .from(llmSettings)
    .where(eq(llmSettings.installationId, installationId));
  return row ? decryptSecret(row.keyCiphertext, key) : null;
}

export async function upsertLlmSettings(
  db: Db,
  input: { installationId: number; provider: LlmProvider; model: string; apiKey?: string },
  key: Uint8Array,
): Promise<LlmSettingsRow> {
  const { installationId, provider, model, apiKey } = input;
  const updatedAt = new Date();
  if (apiKey === undefined) {
    const [row] = await db
      .update(llmSettings)
      .set({ provider, model, updatedAt })
      .where(eq(llmSettings.installationId, installationId))
      .returning(llmColumns);
    if (!row) throw new Error('an API key is required on the first save');
    return row;
  }
  const secret = {
    keyCiphertext: encryptSecret(apiKey, key),
    keyLast4: apiKey.slice(-4),
    rejectedAt: null,
  };
  const [row] = await db
    .insert(llmSettings)
    .values({ installationId, provider, model, ...secret })
    .onConflictDoUpdate({
      target: llmSettings.installationId,
      set: { provider, model, ...secret, updatedAt },
    })
    .returning(llmColumns);
  if (!row) throw new Error('upsertLlmSettings returned no row');
  return row;
}

export async function deleteLlmSettings(db: Db, installationId: number): Promise<boolean> {
  const rows = await db
    .delete(llmSettings)
    .where(eq(llmSettings.installationId, installationId))
    .returning({ installationId: llmSettings.installationId });
  return rows.length > 0;
}

export async function markLlmKeyRejected(db: Db, installationId: number, at: Date): Promise<void> {
  await db
    .update(llmSettings)
    .set({ rejectedAt: at })
    .where(eq(llmSettings.installationId, installationId));
}

export type TeamReportRow = {
  installationId: number;
  teamName: string;
  enabled: boolean;
  channel: string;
  weekday: Weekday;
  time: string;
  productionBranch: string;
  cutoffAt: Date;
};

const teamReportColumns = {
  installationId: teamReports.installationId,
  teamName: teamReports.teamName,
  enabled: teamReports.enabled,
  channel: teamReports.channel,
  weekday: teamReports.weekday,
  time: teamReports.time,
  productionBranch: teamReports.productionBranch,
  cutoffAt: teamReports.cutoffAt,
};

export async function listTeamReports(db: Db, installationId: number): Promise<TeamReportRow[]> {
  return db
    .select(teamReportColumns)
    .from(teamReports)
    .where(eq(teamReports.installationId, installationId))
    .orderBy(asc(teamReports.teamName));
}

export async function getTeamReport(
  db: Db,
  installationId: number,
  teamName: string,
): Promise<TeamReportRow | null> {
  const [row] = await db
    .select(teamReportColumns)
    .from(teamReports)
    .where(and(eq(teamReports.installationId, installationId), eq(teamReports.teamName, teamName)));
  return row ?? null;
}

export async function upsertTeamReport(
  db: Db,
  input: Omit<TeamReportRow, 'cutoffAt'>,
  now: Date,
): Promise<TeamReportRow> {
  const [row] = await db
    .insert(teamReports)
    .values({ ...input, cutoffAt: now })
    .onConflictDoUpdate({
      target: [teamReports.installationId, teamReports.teamName],
      set: {
        enabled: input.enabled,
        channel: input.channel,
        weekday: input.weekday,
        time: input.time,
        productionBranch: input.productionBranch,
        cutoffAt: sql`CASE WHEN ${input.enabled} AND NOT ${teamReports.enabled} THEN ${now.toISOString()}::timestamptz ELSE ${teamReports.cutoffAt} END`,
        updatedAt: now,
      },
    })
    .returning(teamReportColumns);
  if (!row) throw new Error('upsertTeamReport returned no row');
  return row;
}

export async function deleteTeamReport(
  db: Db,
  installationId: number,
  teamName: string,
): Promise<boolean> {
  const rows = await db
    .delete(teamReports)
    .where(and(eq(teamReports.installationId, installationId), eq(teamReports.teamName, teamName)))
    .returning({ id: teamReports.id });
  return rows.length > 0;
}

export async function setTeamReportCutoff(
  db: Db,
  installationId: number,
  teamName: string,
  cutoffAt: Date,
): Promise<void> {
  await db
    .update(teamReports)
    .set({ cutoffAt })
    .where(and(eq(teamReports.installationId, installationId), eq(teamReports.teamName, teamName)));
}

export async function listProductionBranches(db: Db, installationId: number): Promise<string[]> {
  const rows = await db
    .selectDistinct({ branch: teamReports.productionBranch })
    .from(teamReports)
    .where(and(eq(teamReports.installationId, installationId), eq(teamReports.enabled, true)));
  return rows.map((r) => r.branch);
}

export type ProductionPullRequestRow = {
  repository: string;
  number: number;
  url: string;
  authorLogin: string;
  branch: string;
  reachedAt: Date;
};

const pullRequestColumns = {
  repository: productionPullRequests.repository,
  number: productionPullRequests.number,
  url: productionPullRequests.url,
  authorLogin: productionPullRequests.authorLogin,
  branch: productionPullRequests.branch,
  reachedAt: productionPullRequests.reachedAt,
};

export async function recordProductionPullRequests(
  db: Db,
  installationId: number,
  rows: ProductionPullRequestRow[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const inserted = await db
    .insert(productionPullRequests)
    .values(rows.map((r) => ({ ...r, installationId })))
    .onConflictDoNothing()
    .returning({ id: productionPullRequests.id });
  return inserted.length;
}

export async function listProductionPullRequests(
  db: Db,
  input: { installationId: number; branch: string; after: Date; upTo: Date },
): Promise<ProductionPullRequestRow[]> {
  return db
    .select(pullRequestColumns)
    .from(productionPullRequests)
    .where(
      and(
        eq(productionPullRequests.installationId, input.installationId),
        eq(productionPullRequests.branch, input.branch),
        gt(productionPullRequests.reachedAt, input.after),
        lte(productionPullRequests.reachedAt, input.upTo),
      ),
    )
    .orderBy(asc(productionPullRequests.reachedAt), asc(productionPullRequests.number));
}

export type ProductionReportRow = {
  teamName: string;
  date: string;
  windowStart: Date;
  windowEnd: Date;
  items: ReportItem[];
};

const reportColumns = {
  teamName: productionReports.teamName,
  date: productionReports.date,
  windowStart: productionReports.windowStart,
  windowEnd: productionReports.windowEnd,
  items: productionReports.items,
};

export async function getProductionReport(
  db: Db,
  installationId: number,
  teamName: string,
  date: string,
): Promise<ProductionReportRow | null> {
  const [row] = await db
    .select(reportColumns)
    .from(productionReports)
    .where(
      and(
        eq(productionReports.installationId, installationId),
        eq(productionReports.teamName, teamName),
        eq(productionReports.date, date),
      ),
    );
  return row ?? null;
}

export async function saveProductionReport(
  db: Db,
  installationId: number,
  report: ProductionReportRow,
): Promise<ProductionReportRow> {
  await db
    .insert(productionReports)
    .values({ ...report, installationId })
    .onConflictDoNothing();
  const row = await getProductionReport(db, installationId, report.teamName, report.date);
  if (!row) throw new Error('saveProductionReport found no row');
  return row;
}

export async function listProductionReportsSince(
  db: Db,
  installationId: number,
  teamName: string,
  since: Date,
): Promise<ProductionReportRow[]> {
  return db
    .select(reportColumns)
    .from(productionReports)
    .where(
      and(
        eq(productionReports.installationId, installationId),
        eq(productionReports.teamName, teamName),
        gte(productionReports.windowEnd, since),
      ),
    )
    .orderBy(asc(productionReports.date));
}

export async function deleteProductionDataBefore(
  db: Db,
  before: Date,
): Promise<{ pullRequests: number; reports: number }> {
  let pullRequests = 0;
  for (;;) {
    const rows = await db
      .delete(productionPullRequests)
      .where(
        inArray(
          productionPullRequests.id,
          db
            .select({ id: productionPullRequests.id })
            .from(productionPullRequests)
            .where(lt(productionPullRequests.reachedAt, before))
            .limit(PRUNE_BATCH),
        ),
      )
      .returning({ id: productionPullRequests.id });
    pullRequests += rows.length;
    if (rows.length === 0) break;
  }
  let reports = 0;
  for (;;) {
    const rows = await db
      .delete(productionReports)
      .where(
        inArray(
          productionReports.id,
          db
            .select({ id: productionReports.id })
            .from(productionReports)
            .where(lt(productionReports.createdAt, before))
            .limit(PRUNE_BATCH),
        ),
      )
      .returning({ id: productionReports.id });
    reports += rows.length;
    if (rows.length === 0) break;
  }
  return { pullRequests, reports };
}
