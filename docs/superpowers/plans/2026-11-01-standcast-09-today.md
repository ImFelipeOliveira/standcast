# Today Screen (Phase 2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The web app's Hoje screen shows a team's day — who sent today, open blockers with age, recurrence and a "probably resolved" hint, open support requests, each person's daily and yesterday's deliveries — with resolve/reopen and "remind now" actions.

**Architecture:** Support requests (branch `feat/support-requests`) merge in first. A new `blocker_states` table tracks each blocker identity per installation, upserted when a daily is submitted. A `getTeamToday` use case assembles the screen from dailies, deliveries and blocker states; thin `/v1/app` routes expose it and the actions. The React page follows the "Hoje" artboard of Painel v2.

**Tech Stack:** as plan 07 (Bun, Hono, Drizzle/Postgres, pg-boss, React 19, TanStack Router/Query, Tailwind 4, shadcn/ui).

**Spec:** `docs/superpowers/specs/2026-11-01-phase-2-web-app-design.md` (section "Hoje (2b)", "Who sees what", anti-goals) and `docs/superpowers/specs/2026-11-01-support-requests-design.md`. Visual: `Main.dc.html` of https://claude.ai/artifact/93d8s2jb5YttKrMVwP6QwX (copy in the plan workspace `design/`).

## Global Constraints

- Everything in plan 07's Global Constraints still binds (no code comments, English identifiers, use cases own rules, pinned deps, CSS variables only, both themes AA, pt-BR and en copy).
- Anti-surveillance: "who has not sent" exists only for **today**; no rate, count per person, ranking or history of absence; `blocker_states` never stores counts per person; no endpoint returns past days' missing lists.
- Visibility: a person sees Hoje for teams they manage or belong to, and admins see every team; actions "resolve/reopen" are allowed to the team's managers, admins and the blocker's author; "remind now" only to the team's managers and admins.
- "Remind now" reuses the existing `send-reminder` job and its one-per-person-per-day rule and its window (only before the team's digest time); the button is hidden after the digest time.
- The "probably resolved" hint calls GitHub at most 10 times per request, with the adapter timeout, under a 3 s guard like `safeTeamNotices`; failures drop the hint, never the page.
- Every task ends green on `bun test` (with `TEST_DATABASE_URL`), `bun run lint`, `bun run typecheck`, `bun run check-deps`, `bun run web:build`.

## Review Focus

1. A daily submitted twice on the same day with the same blocker keeps one `blocker_states` row and its original `opened_on` (Task 2 test `resubmission keeps the opening date`).
2. A blocker resolved and then present again in a later daily reopens with a fresh `opened_on` (Task 2 test `resolved blocker that comes back reopens`).
3. A plain member calling "remind now" or resolving someone else's blocker gets 403 (Task 3 tests `member cannot remind` and `member cannot resolve others`).
4. GitHub down: Hoje still renders without hints (Task 3 test `hint failure keeps the page`).
5. A team whose timezone already crossed midnight shows the team's local date, not the server's (Task 3 test `today follows the team timezone`).

---

### Task 1: Bring in support requests

**Files:** merge `origin/feat/support-requests` into this branch; resolve conflicts in favor of keeping both sides' behavior.
- [ ] **Step 1:** `git merge --no-ff origin/feat/support-requests -m "merge: support requests into the today work"`; resolve conflicts (expected in `docs/site/*changelog.md`, i18n, digest tests).
- [ ] **Step 2:** Run all Global Constraints checks → PASS. **Step 3:** commit the merge.

### Task 2: Blocker states

**Files:**
- Modify: `packages/db/src/schema.ts` (new table `blocker_states`), new migration under `packages/db/drizzle/` (generated), `packages/db/src/repo/blocker-states.ts` (new), `packages/db/src/index.ts` (exports), `packages/orchestrator/src/use-cases/submit-daily.ts`
- Create: `packages/orchestrator/src/use-cases/blocker-states.ts`
- Test: `packages/db/test/blocker-states.test.ts`, `packages/orchestrator/test/use-cases/blocker-states.test.ts`

**Interfaces:**
- Table `blocker_states`: `id uuid pk`, `installation_id` (fk cascade), `blocker_id text` (the existing `blockerRouteId(item)` identity), `author_member_id uuid` (fk cascade), `text text`, `ref jsonb null`, `opened_on date`, `last_seen_on date`, `resolved_at timestamptz null`, `resolved_by_member_id uuid null`; unique `(installation_id, author_member_id, blocker_id)`.
- `recordBlockers(deps, input: { installationId: number; memberId: string; date: string; blockers: Item[] }): Promise<void>` called by `submitDaily` after the daily is stored: upsert each; new → `opened_on = last_seen_on = date`; existing open → `last_seen_on = date`, text and ref updated; existing resolved → reopen (`opened_on = date`, `resolved_at = null`).
- `setBlockerResolved(deps, isMember, member, input: { installationId: number; blockerStateId: string; resolved: boolean }): Promise<void>` — allowed for admins, managers of any team the author belongs to, and the author; else `forbidden`; unknown id in this installation → `not_found`.
- [ ] **Step 1: Failing tests**: `first sighting opens the blocker`; `resubmission keeps the opening date`; `resolved blocker that comes back reopens`; `blockers dropped from a later daily stay open with last_seen_on unchanged`; `author can resolve`; `manager can resolve`; `member cannot resolve others`; `other installation id is not found`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (generate the migration with the repo's existing drizzle-kit script). **Step 4: Run** → PASS plus checks.
- [ ] **Step 5: Commit** `feat: blocker states with age, resolve and reopen`

### Task 3: Today use case and endpoints

**Files:**
- Create: `packages/orchestrator/src/use-cases/get-team-today.ts`, `packages/orchestrator/src/use-cases/remind-now.ts`
- Modify: `apps/api/src/routes/app.ts`, `packages/adapters/github/src/` (a `pullRequestMerged(octokit, ref): Promise<{ merged: boolean; mergedAt: string | null } | null>` helper if none exists)
- Test: `packages/orchestrator/test/use-cases/get-team-today.test.ts`, `packages/orchestrator/test/use-cases/remind-now.test.ts`, `apps/api/test/app-today.test.ts`

**Interfaces:**
- `getTeamToday(deps, isMember, member, input: { installationId: number; team: string }): Promise<TeamToday>` with
  `TeamToday = { team: { name; timezone; remindAt; digestAt }; date: string; digest: { status: 'scheduled' | 'sent' | 'failed'; sentAt: string | null }; canRemind: boolean; canResolve: boolean; people: { login: string; status: 'sent' | 'late' | 'missing'; submittedAt: string | null; daily: { yesterday: Item[]; today: Item[]; blockers: Item[]; support: Item[] } | null }[]; blockers: { id: string; author: string; text: string; ref: Ref | null; openedOn: string; ageDays: number; recurring: boolean; routedTo: { logins: string[]; reason: string } | null; hint: { kind: 'pr_merged'; at: string } | null }[]; support: { author: string; text: string; ref: Ref | null; since: string }[]; shipped: { author: string; text: string; ref: Ref }[] }`.
  - `date` = the team's local date; `late` = submitted after the team's digest was sent; `recurring` = `last_seen_on > opened_on`; `ageDays` in the team's calendar days; `support.since` = first day the same support text from the same author appeared in the last 14 days; `shipped` = yesterday items with a `pull_request` or `card` ref from today's dailies.
  - `canRemind` = manager or admin and the team's digest has not been sent and local time < `digestAt`; `canResolve` per Task 2 rule for the viewer as manager/admin.
  - Visibility per Global Constraints; otherwise `forbidden`.
- `remindNow(deps, isMember, member, input: { installationId: number; team: string; login: string }): Promise<'queued' | 'already_sent' | 'too_late'>` — enqueues `send-reminder` with the same `singletonKey` as the tick.
- Routes: `GET /v1/app/orgs/:installationId/teams/:team/today`; `POST /v1/app/orgs/:installationId/blockers/:blockerStateId/resolve` and `/reopen` → 204; `POST /v1/app/orgs/:installationId/teams/:team/remind/:login` → `202 { result }`.
- [ ] **Step 1: Failing tests**: `today lists sent, late and missing for today only`; `today follows the team timezone`; `blockers carry age, recurrence and routing`; `support requests with since`; `shipped comes from yesterday refs`; `hint failure keeps the page`; `member cannot remind`; `remind after digest is too_late`; `remind twice is already_sent`; route tests for 200/403/404.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS plus checks.
- [ ] **Step 5: Commit** `feat: today use case and endpoints for the web app`

### Task 4: Hoje page

**Files:**
- Create: `apps/web/src/pages/hoje/HojePage.tsx`, `SummaryTiles.tsx`, `NeedsYou.tsx`, `BlockerCard.tsx`, `SupportCard.tsx`, `DailyCard.tsx`, `DailyDrawer.tsx`, `ShippedList.tsx`, `SentToday.tsx`, `refLabel.ts`
- Modify: `apps/web/src/router.tsx` (Hoje route live; `/` lands on Hoje for the first team the person reads, else Configuração), `apps/web/src/shell/Sidebar.tsx` (team switcher with today's sent/total, Hoje enabled), `apps/web/src/api/queries.ts` (`useTeamToday`, `useResolveBlocker`, `useReopenBlocker`, `useRemindNow`), i18n dictionaries
- Test: `apps/web/src/pages/hoje/hoje.test.tsx`

**Interfaces:**
- `refLabel(ref: Ref): string` mirrors the digest's short labels (`repo#123`, `repo@abc1234`, `FEL-12`), same rules as `packages/core/src/digest.ts`.
- Layout and copy follow `Main.dc.html`: summary tiles (dailies today "4 de 5", open blockers with "N travado há mais de 2 dias", support requests, deliveries yesterday), "Precisa de você" (blocker cards: kind pill, age pill "Travado há N dias"/"Desde hoje", "Recorrente", hint pill "Provavelmente resolvido: PR mergeado às HH:MM", author, routed-to line, buttons "Ver daily" and "Marcar como resolvido"/"Reabrir" when `canResolve`; support cards in the accent style), Dailies grid with Todos/Enviaram/Faltam filter and a drawer with the full daily, right column "Entregue ontem" and "Quem já enviou hoje" with the today-only note; "Lembrar agora" on missing people only when `canRemind`.
- [ ] **Step 1: Failing tests** (`renderToStaticMarkup` with fixtures): `renders blockers with age and hint`; `support cards render`; `filter shows only missing`; `remind button hidden when canRemind is false`; `resolve button hidden for plain members`; `no history of who did not send` (fixture for a past date is not reachable: the page only requests today); `refLabel forms`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS, `bun run web:build`, plus checks.
- [ ] **Step 5: Commit** `feat(web): hoje screen`

### Task 5: Docs and smoke

- [ ] Extend `apps/web/e2e/smoke.spec.ts`: seed one team with two members, one daily with a blocker; assert Hoje shows the blocker and "1 de 2".
- [ ] Docs: `docs/site/admin/` gains a short "Web app" page (en + pt-BR) describing Configuração and Hoje and the anti-surveillance rules; changelogs (Unreleased).
- [ ] Run everything, commit `docs: hoje screen and web app page`.
