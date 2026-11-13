# Blockers page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Managers and members see every open blocker of the teams they can read, oldest first, with age, routing and resolve/reopen, plus blockers resolved in the last 14 days.

**Architecture:** `getOrgBlockers` builds a `TeamAccess` per readable team and reuses the Today blocker builder (`openTeamBlockers`, exported from `get-team-today.ts`), merging teams by blocker id. Resolved blockers come from a new repo query. `GET /v1/app/orgs/:id/blockers?team=` exposes it; the web page `/orgs/:id/blockers?state=resolved&team=` renders it.

**Tech Stack:** Bun, Drizzle, Hono, React 19, TanStack Router/Query, bun:test.

**Spec:** `docs/superpowers/specs/2026-11-12-panel-v2-roadmap-design.md` (PR 3) and the "Impedimentos" board of the panel artifact.

## Global Constraints

- Readable teams: the same rule as the teams summary (admin reads all; otherwise teams you manage or belong to). No new visibility rules.
- No per-person metrics: no counts per author, no ranking; counts per team only.
- No sidebar count (it would refetch blockers and GitHub hints on every page).
- Copy in pt-BR and en; no code comments.

## Review Focus

1. A blocker whose author is in two readable teams shows once, with both team names — API test.
2. `?team=` with an unknown team is 404; with a team the person cannot read is 403 — API test.
3. `canResolve` is true for the author and for managers/admins of any of the blocker's teams, false otherwise — API test.
4. Resolved list never includes blockers older than 14 days — repo test.
5. Resolving from the page moves the blocker to the resolved tab after refetch — web test via query invalidation.

---

### Task 1: Repo query for resolved blockers
- Create `listResolvedBlockerStates(db, installationId, authorMemberIds, sinceDate): Promise<ResolvedBlockerState[]>` in `packages/db/src/repo/blocker-states.ts` (`ResolvedBlockerState = BlockerStateRow & { authorLogin: string; resolvedByLogin: string | null }`), `resolvedOn >= sinceDate`, newest first, limit 100. Test in `packages/db/test/blocker-states.test.ts`.

### Task 2: `getOrgBlockers` and the API route
- `getOrgBlockers(deps, isMember, member, { installationId, team? }): Promise<OrgBlockers>`; `OrgBlockers = { open: OrgOpenBlocker[]; resolved: OrgResolvedBlocker[] }`; `OrgOpenBlocker = TodayBlocker & { teams: string[]; canResolve: boolean }`; `OrgResolvedBlocker = { id; teams; author; text; ref; resolvedOn; resolvedBy: string | null }`.
- Route `GET /v1/app/orgs/:installationId/blockers` with optional `team` query. Tests in `apps/api/test/app-today.test.ts` (new describe).

### Task 3: Web page
- `orgBlockersQuery(installationId, team?)`, route `/orgs/$installationId/blockers` (search `state?: 'resolved'`, `team?`), section `blockers` between today and history, `pages/blockers/BlockersPage.tsx` with `PageHeader`, Open/Resolved tabs, team select, open list reusing `BlockerCard`, resolved list, per-team counts aside; resolve/reopen reuse the existing mutations and invalidate `['org', id, 'blockers']`. Tests in `pages/blockers/blockers.test.tsx`; shell nav test updated to four sections.
