# Away Periods Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a person, a team manager or an org admin mark an away period so that, on those days, the person gets no reminder and is not listed as missing.

**Architecture:** A new `away_periods` table keyed by installation and lowercased GitHub login, with pure date rules in `@standcast/core`, use cases in a new `packages/orchestrator/src/modules/away` module, and one `awayLogins` lookup used by the reminder, Remind now, the digest, Today and the signal scan. The digest stores its `missing` list on the delivery row so the org API stops recomputing it. Thin routes for the web app (`/v1/app/orgs/:installationId/away`) and the CLI/MCP (`/v1/away`), a `standcast away` command, MCP tools, and web UI on Account and Today.

**Tech Stack:** Bun 1.4.4, TypeScript, Hono + `@hono/zod-openapi`, Drizzle (Postgres 17), pg-boss queue, React (apps/web), bun:test.

**Spec:** `docs/superpowers/specs/2026-11-16-away-periods-design.md`

## Global Constraints

- Every query is scoped by `installation_id`; a person's periods also by `login` stored lowercased.
- Dates are `YYYY-MM-DD` calendar dates compared with the daily date (`dailyDateFor(now, team)`); no time zone conversion on away dates.
- A period: `until >= from`; at most 90 days long (`MAX_AWAY_DAYS = 90`, counting both ends); `from` not before today (daily date of the person's first team); no overlap with an active period of the same login in the same installation.
- Marking for someone else is allowed for an elevated caller on a team the target belongs to: manager of that team or installation admin (`loadTeamAccess(...).elevated`). The person can always list and cancel their own periods.
- Away data never reaches the digest text, `/v1/org/*`, `/v1/manage/*`, outgoing webhooks, the setup page or logs.
- Error codes: `invalid_away_period`, `away_overlap`, `forbidden`, `not_found`.
- No comments in code. User-visible text through i18n with keys in `en` and `pt-BR`. Docs in `docs/site` and `docs/site/pt-BR`, changelog `Unreleased` / `Não lançado` bullet in both.
- Every HTTP call to Slack/Google Chat goes through the existing chat adapters (timeouts already there). Deliveries use `claimDelivery` → `completeDelivery`/`failDelivery`, every call after the claim inside the `try`.
- Commits: Conventional Commits, English, subject line only, no body, no footer, no co-author trailer. Commits are GPG-signed; if signing fails, stop and ask the user to unlock GPG.
- Checks run in Docker (bun is not installed on the host). From the repo root, with a Postgres 17 container `sc-pg` on network `sc-net` (`docker network create sc-net; docker run -d --name sc-pg --network sc-net -e POSTGRES_USER=standcast -e POSTGRES_PASSWORD=standcast -e POSTGRES_DB=standcast_test postgres:17`):
  `docker run --rm --user $(id -u):$(id -g) -e HOME=/tmp --network sc-net -e TEST_DATABASE_URL=postgres://standcast:standcast@sc-pg:5432/standcast_test -v "$PWD":/app -w /app oven/bun:1.4.4 sh -c '<command>'`
  Below, `RUN '<command>'` means that line. The docs site build tests (`site build`, `built site`) fail locally because `@vue/server-renderer` cannot be resolved in this environment; they pass in CI and are not caused by this work.

## Review Focus

1. A person in two teams with different time zones: "today" for the `from` rule is the daily date of their **first** team; a period still applies to every team's reminder and digest on matching dates. Test in Task 2 and Task 4.
2. Login case: `Alice` in `standcast.yml`, `alice` in the API body, `ALICE` from GitHub. All comparisons lowercase. Test in Task 1 (`awayLogins`) and Task 3 (`markAway`).
3. A cancelled period ending the overlap: a new period over the same days must be accepted after cancel. Test in Task 1.
4. A person who is away **and** sends a daily: they are a normal entry in the digest and show as sent in Today. Test in Task 4.
5. Two concurrent cancels of the same period: one succeeds, the other gets `not_found`, and only one notice is enqueued. Test in Task 3.

---

### Task 1: Storage for away periods and the digest's missing list

**Files:**
- Modify: `packages/db/src/schema.ts` (new `awayPeriods` table; `deliveries.missingLogins` column; `'away_notice'` in `DeliveryKind`)
- Create: `packages/db/src/repo/away-periods.ts`
- Modify: `packages/db/src/index.ts` (export the new repo)
- Modify: `packages/db/src/repo/deliveries.ts` (`completeDelivery` optional `missingLogins`; `listDigestDeliveries` returns it)
- Create: `packages/db/migrations/0020_away_periods.sql` + snapshot (generated: `RUN 'cd packages/db && bunx drizzle-kit generate --name away_periods'`)
- Test: `packages/db/test/away-periods.test.ts`, `packages/db/test/repo.test.ts` (deliveries)

**Interfaces:**
- Produces:
  - `type AwayPeriodRow = { id: string; installationId: number; login: string; fromDate: string; untilDate: string; createdBy: string; createdAt: Date; cancelledAt: Date | null; cancelledBy: string | null }`
  - `createAwayPeriod(db, { installationId, login, from, until, createdBy }): Promise<AwayPeriodRow | 'overlap'>` — lowercases `login`; inside a transaction with `pg_advisory_xact_lock` on `(installationId, login)`, returns `'overlap'` when an active period of that login intersects `[from, until]`.
  - `cancelAwayPeriod(db, { installationId, id, cancelledBy }): Promise<AwayPeriodRow | null>` — compare-and-swap on `cancelled_at IS NULL`; `null` when not found, already cancelled, or in another installation.
  - `getAwayPeriod(db, installationId, id): Promise<AwayPeriodRow | null>`
  - `listAwayPeriods(db, installationId, login, fromDate): Promise<AwayPeriodRow[]>` — active periods with `until_date >= fromDate`, ordered by `from_date`, limit 50.
  - `awayLogins(db, installationId, logins: string[], date: string): Promise<Set<string>>` — lowercased logins with an active period covering `date`; empty input returns an empty set without a query.
  - `completeDelivery(db, key, token, ref, extra?: { missingLogins?: string[] })`
  - `listDigestDeliveries` rows gain `missingLogins: string[] | null`.
- Table `away_periods`: columns per the spec (`login text not null`, `from_date date`, `until_date date`, `created_by uuid` FK members, `cancelled_by uuid` FK members nullable, `created_at`, `cancelled_at`), FK `installation_id` cascade, index `(installation_id, login, until_date)`. `deliveries.missing_logins text[]` nullable.

- [ ] **Step 1: Write the failing tests** in `packages/db/test/away-periods.test.ts`:
  - `awayLogins covers from and until inclusively` — period `2026-12-01..2026-12-05` for `Alice`: `awayLogins(db, INST, ['alice','bob'], '2026-12-01')` → `{'alice'}`; same for `'2026-12-05'`; `'2026-11-30'` and `'2026-12-06'` → empty.
  - `logins are matched case-insensitively` — created with `login: 'Alice'`, queried with `['ALICE']` → `{'alice'}`.
  - `an overlapping active period is refused and a cancelled one is not` — second create over `2026-12-04..2026-12-10` → `'overlap'`; after `cancelAwayPeriod` of the first, the same create returns a row.
  - `cancel is compare-and-swap` — `Promise.all` of two cancels → exactly one non-null.
  - `another installation never sees the period` — `awayLogins(db, OTHER, ['alice'], '2026-12-02')` → empty; `cancelAwayPeriod(db, { installationId: OTHER, id })` → `null`.
  - `listAwayPeriods hides past and cancelled periods`.
  - In `repo.test.ts`: `completeDelivery stores missing logins on the digest row` — then `listDigestDeliveries` returns `missingLogins: ['bob']`; without `extra` it stays `null`.
- [ ] **Step 2: Run** `RUN 'bun test packages/db/test/away-periods.test.ts packages/db/test/repo.test.ts'` — expected: FAIL (module not found).
- [ ] **Step 3: Implement** schema, migration, repo and the `completeDelivery`/`listDigestDeliveries` changes.
- [ ] **Step 4: Run** the same command — expected: PASS. Then `RUN 'bun run typecheck && bun run lint'` — expected: no errors.
- [ ] **Step 5: Commit** `git add packages/db && git commit -m "feat(db): store away periods and the digest's missing list"`

### Task 2: Away period rules and copy in core

**Files:**
- Create: `packages/core/src/away.ts`; Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/i18n.ts` (keys in both languages)
- Test: `packages/core/test/away.test.ts`

**Interfaces:**
- Produces:
  - `MAX_AWAY_DAYS = 90`
  - `validateAwayPeriod(input: { from: string; until: string; today: string }): 'ok' | 'invalid_away_period'` — invalid when either date is not a real `YYYY-MM-DD`, `until < from`, `from < today`, or the inclusive length exceeds 90 days.
  - `buildAwayNotice(lang, { by: string; from: string; until: string; periodId: string; action: 'marked' | 'cancelled' }): string`
  - i18n keys: `away.notice.marked` ("@{by} marked you away from {from} to {until}. You won't get daily reminders on those days. To undo it: `standcast away cancel {id}`." / pt-BR "@{by} marcou você de férias de {from} a {until}. Você não vai receber lembretes da daily nesses dias. Para desfazer: `standcast away cancel {id}`."), `away.notice.cancelled` ("@{by} cancelled your away period from {from} to {until}." / "@{by} cancelou as suas férias de {from} a {until}."), and the CLI keys `cli.awayUsage`, `cli.awayMarked`, `cli.awayCancelled`, `cli.awayNone`. Dates in the notice are formatted `DD/MM` in pt-BR and `MM/DD` in en through the existing date helpers in core if there is one, otherwise ISO.

- [ ] **Step 1: Write the failing tests:** `validateAwayPeriod` → `'ok'` for `2026-12-01..2026-12-05` with today `2026-11-16`; `'ok'` for `from === today`; `'ok'` for exactly 90 days (`2026-12-01..2027-02-28`); `'invalid_away_period'` for 91 days, `until < from`, `from = '2026-11-15'` with today `2026-11-16`, and `'2026-02-30'`. `buildAwayNotice('pt-BR', …)` contains `marcou você de férias` and `standcast away cancel <id>`; `'en'` contains `marked you away`.
- [ ] **Step 2: Run** `RUN 'bun test packages/core/test/away.test.ts'` — expected: FAIL.
- [ ] **Step 3: Implement** `away.ts` and the i18n keys.
- [ ] **Step 4: Run** the same test — PASS; `RUN 'bun run typecheck'` — no errors (a missing key in one language is a type error).
- [ ] **Step 5: Commit** `git add packages/core && git commit -m "feat(core): validate away periods and build the away notice"`

### Task 3: Use cases to mark, list and cancel, with the notice

**Files:**
- Create: `packages/orchestrator/src/modules/away/{index.ts,away-access.ts,mark-away.ts,cancel-away.ts,list-away.ts,send-away-notice.ts}`
- Modify: `packages/orchestrator/src/index.ts` (export the module), `apps/worker/src/main.ts` (register `send-away-notice` with the `keyed` policy, like `send-reminder`)
- Test: `packages/orchestrator/test/use-cases/away.test.ts`, `packages/orchestrator/test/use-cases/send-away-notice.test.ts`

**Interfaces:**
- Consumes: Task 1 repo functions; Task 2 `validateAwayPeriod`, `buildAwayNotice`; existing `authorizeInstallation`, `resolveMemberTeams`, `teamsForMember`, `managesTeam`, `isInstallationAdmin`, `dailyDateFor`, `directMessageIdFor`.
- Produces:
  - `type AwayPeriod = { id: string; login: string; from: string; until: string; markedBy: string; markedAt: string; mine: boolean }` (`markedBy` is the login of `created_by`)
  - `markAway(deps, isMember, member, { installationId: number; login?: string; from?: string; until: string }): Promise<AwayPeriod>` — `from` defaults to today (daily date of the target's first team)
  - `cancelAway(deps, isMember, member, { installationId: number; periodId: string }): Promise<void>`
  - `listAway(deps, isMember, member, { installationId: number; login?: string }): Promise<AwayPeriod[]>`
  - Queue job `send-away-notice` with payload `{ installationId: number; periodId: string; action: 'marked' | 'cancelled'; byLogin: string }`, singleton key `away-notice:${installationId}:${periodId}:${action}`.
  - `sendAwayNotice(deps: WorkerDeps, job)`: delivery key `{ installationId, teamName: '', date: <daily date of the target's first team when the job runs>, kind: 'away_notice', subject: `${login}:${periodId}:${action}` }`; DM on the chat of the target's first team in that team's language; `no_chat_connection` / `no_chat_identity` fail the delivery like `send-reminder`.
- Access rule (`away-access.ts`): resolve the installation's teams once; target login lowercased; the caller acts on themselves when `login` is absent or equals their own login (they must be in at least one team, else `not_in_team` as the daily flow does); otherwise the caller must manage a team containing the target or be installation admin (`forbidden`), and the target must be in some team (`not_found`). `today` for `validateAwayPeriod` is `dailyDateFor(deps.now(), firstTeamOfTarget)`. Map `'invalid_away_period'` and `'overlap'` to `DomainError('invalid_away_period' | 'away_overlap')`.
- Notice is enqueued only when the actor's login differs from the target's.

- [ ] **Step 1: Write the failing tests** (`away.test.ts`):
  - `a person marks and lists their own period` → `mine: true`, `markedBy: 'alice'`, no `send-away-notice` enqueued.
  - `a manager marks a member of their team and the notice is enqueued once`.
  - `an admin who manages no team can mark and cancel` (roles map `admin`).
  - `a manager of another team is forbidden`; `a member marking someone else is forbidden`.
  - `a login in no team is not_found`, including a login that only exists in another installation.
  - `a person who never signed in can be marked` (login in `standcast.yml`, no `members` row) and `listAway` by a manager returns it.
  - `from before today is invalid_away_period`, with today computed in the target's first team time zone (team in `Pacific/Auckland`, `now` just after its midnight).
  - `overlap is away_overlap`; `the person cancels a period a manager marked`; `two concurrent cancels: one succeeds, one not_found, one notice`.
  - (`send-away-notice.test.ts`) `sends the pt-BR notice once on retry`, `fails with no_chat_identity without a chat user`.
- [ ] **Step 2: Run** `RUN 'bun test packages/orchestrator/test/use-cases/away.test.ts packages/orchestrator/test/use-cases/send-away-notice.test.ts'` — FAIL.
- [ ] **Step 3: Implement** the module and the worker registration.
- [ ] **Step 4: Run** the same tests — PASS; `RUN 'bun run typecheck && bun run lint && bun run check-layers && bun run check-deps'` — clean.
- [ ] **Step 5: Commit** `git add packages/orchestrator apps/worker && git commit -m "feat(away): mark, list and cancel away periods with a chat notice"`

### Task 4: Away people skip reminders, the missing list and their signal scan

**Files:**
- Modify: `packages/orchestrator/src/modules/delivery/send-reminder.ts`, `remind-now.ts` (result type gains `'away'`), `send-digest.ts`, `events.ts` if the missing list is built there
- Modify: `packages/orchestrator/src/modules/daily/get-team-today.ts` (status `'away'`; `canRemind` stays per team, the web hides the button per person)
- Modify: `packages/orchestrator/src/modules/github/scan-member-signals.ts`
- Modify: `packages/orchestrator/src/modules/org/list-org-digests.ts`
- Test: existing `send-reminder.test.ts`, `remind-now.test.ts`, `send-digest.test.ts`, `get-team-today.test.ts`, `scan-member-signals.test.ts`, `org-read.test.ts`

**Interfaces:**
- Consumes: `awayLogins`, `completeDelivery(..., { missingLogins })`, `listDigestDeliveries().missingLogins`.
- Produces: `RemindNowResult = 'queued' | 'already_sent' | 'too_late' | 'away'`; Today member status `'sent' | 'late' | 'missing' | 'away'`.
- Rules: reminder returns before claiming when the login is away on `job.date`. Digest: away logins without a daily go to neither `entries` nor `missing`; `completeDelivery` gets `missingLogins` = the lowercased logins in `missing`; the `digest.sent` event uses the same list. Org digests: `missing` = stored `missingLogins` (mapped to display logins) when not null, else the current computation; the use case never calls `awayLogins`. Signal scan: return early when the login is away on the daily date of their first team (use `job.date` when present).

- [ ] **Step 1: Write the failing tests:**
  - reminder: `no reminder on a day inside an away period` (no delivery row exists afterwards); `a reminder on the day after until`; `a reminder again after the period is cancelled`; `a person in two teams in different time zones is skipped on the matching date in both`.
  - remind now: `returns away and enqueues nothing`.
  - digest: `an away person without a daily is in neither list`; `an away person who sent a daily is an entry`; `the digest row stores missing logins`; `digest.sent payload missing excludes the away person`.
  - today: `status is away for an away person without a daily, sent when they sent one`.
  - scan: `no signals are created while the person is away`.
  - org digests: `missing comes from the stored list, so a later away period or team change does not alter it`; `a digest without a stored list falls back to the current computation`.
- [ ] **Step 2: Run** `RUN 'bun test packages/orchestrator'` — the new tests FAIL.
- [ ] **Step 3: Implement** the changes.
- [ ] **Step 4: Run** `RUN 'bun test packages/orchestrator packages/db'` — PASS; typecheck and lint clean.
- [ ] **Step 5: Commit** `git add packages/orchestrator && git commit -m "feat(delivery): skip reminders and the missing list for people who are away"`

### Task 5: API routes for the web app and the CLI

**Files:**
- Modify: `apps/api/src/routes/app.ts` (web app routes), `apps/api/src/routes/v1.ts` (CLI/MCP routes, `createRoute` like `/v1/dailies`, same rate limits and session auth), the error tables in `apps/api/src/openapi` if routes are documented there
- Test: `apps/api/test/app-away.test.ts` (new), `apps/api/test/v1.test.ts`, `apps/api/test/no-suggestion-leak.test.ts`

**Interfaces:**
- Consumes: Task 3 `markAway`, `cancelAway`, `listAway`.
- Produces:
  - `GET /v1/app/orgs/:installationId/away?login=` → `200 { data: AwayPeriod[] }`
  - `POST /v1/app/orgs/:installationId/away` body `{ from?, until, login? }` → `201 AwayPeriod`
  - `POST /v1/app/orgs/:installationId/away/:periodId/cancel` → `204`
  - `GET /v1/away?org=` → `200 { data: AwayPeriod[] }`
  - `POST /v1/away` body `{ org, from?, until }` (strict schema: a `login` field is rejected with `invalid_request`) → `201 AwayPeriod`
  - `POST /v1/away/:periodId/cancel` body `{ org }` → `204`
  - Domain errors map like the existing routes: `invalid_away_period`/`away_overlap` → 422, `forbidden` → 403, `not_found` → 404.

- [ ] **Step 1: Write the failing tests:** each route's happy path; `the CLI route refuses a login field`; `a member gets 403 marking someone else through the web app`; `GET /v1/org/digests and the digest.sent webhook payload never contain away fields` (new case in `no-suggestion-leak.test.ts`); `bad JSON returns invalid_request` (add to `bad-bodies.test.ts` if it enumerates routes); `openapi.test.ts` still passes.
- [ ] **Step 2: Run** `RUN 'bun test apps/api'` — new tests FAIL.
- [ ] **Step 3: Implement** the routes (thin: parse, call one use case, map the result).
- [ ] **Step 4: Run** `RUN 'bun test apps/api'` — PASS except the documented site build tests; typecheck and lint clean.
- [ ] **Step 5: Commit** `git add apps/api && git commit -m "feat(api): routes to mark, list and cancel away periods"`

### Task 6: `standcast away` and the MCP tools

**Files:**
- Create: `apps/cli/src/commands/away.ts`
- Modify: `apps/cli/src/cli.ts` (register `away`; options `from: { type: 'string' }`, `until: { type: 'string' }`), `apps/cli/src/api.ts` (`listAway`, `markAway`, `cancelAway` clients), `apps/cli/src/mcp/tools.ts` (`away_mark`, `away_list`, `away_cancel`), `cli.usage` copy in core i18n
- Test: `apps/cli/test/cli.test.ts`, `apps/cli/test/mcp.test.ts`

**Interfaces:**
- Consumes: Task 5 `/v1/away` routes; `requireBoundCredentials`, `resolveOrg`.
- Produces:
  - `standcast away --until YYYY-MM-DD [--from YYYY-MM-DD] [--org X]` → prints the created period as JSON (`--from` defaults to today in the person's first team, decided by the server: the client omits `from` and the server uses today). The `/v1/away` body therefore accepts `from` as optional.
  - `standcast away list [--org X]` → JSON array.
  - `standcast away cancel <id> [--org X]` → `{"id":…,"cancelled":true}`.
  - Missing `--until` or extra positionals → `cli.awayUsage` with `EXIT.error`.
  - MCP tools mark only the caller; each description says to confirm the dates with the person before calling.

- [ ] **Step 1: Write the failing tests:** the three commands against the fake API in `apps/cli/test/support.ts`; usage error; `--org` passed through; MCP `away_mark` sends `{ org, from, until }` and never a login.
- [ ] **Step 2: Run** `RUN 'bun test apps/cli'` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `RUN 'bun test apps/cli'` — PASS; typecheck and lint clean.
- [ ] **Step 5: Commit** `git add apps/cli packages/core apps/api && git commit -m "feat(cli): standcast away and MCP tools to manage away periods"`

### Task 7: Web app: Account section and Today actions

**Files:**
- Modify: `apps/web/src/api/queries.ts`, `apps/web/src/api/mutations.ts` (`useAwayPeriods`, `useMarkAway`, `useCancelAway`)
- Modify: `apps/web/src/pages/account/AccountPage.tsx` (Away section), `apps/web/src/pages/hoje/DailyCard.tsx`, `HojePage.tsx`, `SummaryTiles.tsx`, `SentToday.tsx` (status `'away'`)
- Modify: `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/pt-BR.ts`
- Test: `apps/web/src/pages/account/account.test.tsx`, `apps/web/src/pages/hoje/hoje.test.tsx`

**Interfaces:**
- Consumes: Task 5 web routes, Task 4 Today status `'away'`.
- Produces: Account "Away" (pt-BR "Férias") section listing the person's periods (dates, "Marked by @x", Cancel) and a form (from, until) for the current organization. On Today: an away person's card shows "Away until {date}" and no Remind button; when `canRemind` is true (elevated) each person's card shows "Mark away" opening a from/until form, and an away card shows Cancel. Summary tiles count away people in neither sent nor missing.

- [ ] **Step 1: Write the failing tests:** Account lists and cancels; marking shows the server error text for `away_overlap`; Today renders the away state without Remind; a non-elevated member sees "Away" without actions; pt-BR copy "Férias até".
- [ ] **Step 2: Run** `RUN 'bun test apps/web/src'` — FAIL.
- [ ] **Step 3: Implement** with existing components (`Badge`, dialogs and forms already used on Settings).
- [ ] **Step 4: Run** `RUN 'bun test apps/web/src && bun run typecheck && bun run lint'` — PASS.
- [ ] **Step 5: Commit** `git add apps/web && git commit -m "feat(web): mark and cancel away periods on Account and Today"`

### Task 8: Documentation and changelog

**Files:**
- Modify: `docs/site/members/cli.md`, `docs/site/members/mcp.md`, `docs/site/admin/web-app.md`, `docs/site/how-it-works.md`, `docs/site/privacy.md`, the API error table page that lists codes, `docs/site/changelog.md`, and the same pages under `docs/site/pt-BR/`
- Test: `bun run check-docs`

- [ ] **Step 1: Write** the sections from the spec's Docs list: how to mark yourself away (CLI, MCP), managers and admins marking someone (web app) and the notice, reminders and the digest skipping away people, what is stored (dates, who marked and cancelled) and who sees it, the new error codes, and one `Unreleased` bullet per language.
- [ ] **Step 2: Run** `RUN 'bun run check-docs && bun run lint'` — `docs: all checks passed`. If a page title changed, run the og images step from `CONTRIBUTING.md`.
- [ ] **Step 3: Commit** `git add docs/site && git commit -m "docs(away): document away periods for members and managers"`

### Final verification

- [ ] `RUN 'bun run lint && bun run check-pins && bun run check-deps && bun run check-layers && bun run typecheck && bun run check-docs && bun test'` — all pass except the documented local site build tests.
- [ ] Push `feat/away-periods` and open the PR against `dev` with the org PR template in English, no Claude mention.
