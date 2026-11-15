# Daily plan against done and pending work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GET /v1/draft` returns the person's previous plan marked moved / not moved / unknown, their pending pull requests and cards, and per-source warnings; the `/daily` skill uses them to open with planned against done and to recommend up to 5 focus items.

**Architecture:** Pure plan rules and shared types live in `@standcast/core`. The GitHub and Linear adapters each gain one GraphQL query for pending work and one aliased GraphQL query for planned items. The `getDraft` use case runs every source in parallel, each in its own `try`, and turns failures into `warnings`. The skill, the MCP instructions and the docs change last.

**Tech Stack:** Bun, TypeScript, Zod, `@octokit/core` (`octokit.graphql`), Linear GraphQL through `LinearClient`, Drizzle, `bun:test`.

**Spec:** `docs/superpowers/specs/2026-11-14-daily-plan-and-pending-design.md`

## Global Constraints

- No comments in code (TS, TSX, CSS, shell, YAML).
- Every query scoped by `installation_id` and `member_id`.
- GraphQL values always passed as variables; aliases built only from a fixed template with an index (`p0`…`p9`, `c0`…`c9`), never from input text.
- At most 10 planned pull requests and 10 planned cards are looked up; the rest are `unknown`.
- GitHub GraphQL requests have a 5-second timeout (`AbortSignal.timeout(5000)`). Linear requests keep the existing client timeout (`LINEAR_TIMEOUT_MS`, 10 seconds), since the client is shared and created once per connection; this is a deliberate deviation from the spec's 5 seconds.
- Pending searches return at most 50 results each; a search that returns 50 sets `truncated: true`.
- A plan whose daily is more than 7 calendar days before today is not shown (`plan: null`).
- `not_moved` only when the item's own lookup succeeded and found nothing; every other case is `unknown`.
- Plan and pending are never stored, never logged (logs carry only the source and an error code), and never reach the digest, `/v1/org/*`, `/v1/manage/*`, webhooks, the setup page or manager MCP tools.
- `/v1/draft` is internal: no `docs/api/CHANGELOG.md` entry. One product changelog bullet in en and pt-BR.
- User-visible CLI text through `t(lang, key)` in both languages.
- Run DB-backed tests with `TEST_DATABASE_URL` set, as CI does.

## Review Focus

1. A planned pull request in a repository of another owner (the person pasted a link to an upstream project): it must be `unknown` and must not be queried with the installation token. → test in Task 1 (`planTargets`) and Task 6.
2. One planned card identifier that does not exist or was deleted (Linear excluded the old team keys): the other cards must still resolve; the missing one is `unknown`. → test in Task 4.
3. GitHub answers the plan query with partial data and errors for one alias (pull request deleted or no access): that item is `unknown`, the rest keep their status. → test in Task 3.
4. The person's Linear identity is not linked, or Linear is not connected: plan cards are `unknown` (not `not_moved`) and pending has no cards, with no warning for "not connected". → test in Task 6.
5. Two plan items point to the same pull request: one lookup, both items get the same status. → test in Task 1.

---

## File Structure

- Create `packages/core/src/daily-plan.ts`: plan and pending types, `planTargets`, `buildPlan`, `planIsFresh`, key helpers.
- Modify `packages/core/src/index.ts`: export it.
- Modify `packages/db/src/repo/dailies.ts`: `getPreviousDaily`.
- Create `packages/adapters/github/src/pending.ts`: `listPendingPullRequests`.
- Create `packages/adapters/github/src/plan.ts`: `lookupPlannedPullRequests`.
- Modify `packages/adapters/github/src/index.ts`: export both.
- Create `packages/adapters/linear/src/pending.ts`: `listAssignedOpen`.
- Create `packages/adapters/linear/src/plan.ts`: `lookupPlannedCards`.
- Modify `packages/adapters/linear/src/index.ts`: export both.
- Modify `packages/orchestrator/src/modules/linear/project-tracker.ts` and `linear-tracker.ts`: two new tracker methods.
- Create `packages/orchestrator/src/modules/daily/draft-plan.ts` and `draft-pending.ts`; modify `get-draft.ts`.
- Modify `packages/orchestrator/src/deps.ts`, `apps/api/src/main.ts`, `apps/worker/src/main.ts`, `packages/orchestrator/test/use-cases/fakes.ts`: wire the two GitHub functions.
- Modify `apps/api/src/openapi/schemas.ts`, `apps/api/test/no-suggestion-leak.test.ts`.
- Modify `apps/cli/src/mcp/tools.ts` (`draftOut`, server instructions), `packages/plugin/skills/daily/SKILL.md`.
- Docs: `docs/site/members/{claude-code,mcp,cli}.md`, `docs/site/privacy.md`, `docs/site/changelog.md` and the `pt-BR` copies.

---

### Task 1: Core plan rules and types

**Files:**
- Create: `packages/core/src/daily-plan.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/daily-plan.test.ts`

**Interfaces:**
- Consumes: `Item`, `Ref` from `packages/core/src/daily.ts`; `parsePullRequestUrl`, `parseLinearIssueUrl`, `addCalendarDays` from core.
- Produces:
  ```ts
  export const PLAN_LOOKUP_CAP = 10;
  export const PLAN_MAX_AGE_DAYS = 7;
  export type PlanStatus = 'moved' | 'not_moved' | 'unknown';
  export type PlanEvidenceKind = 'commit' | 'review' | 'merged' | 'closed' | 'state_changed' | 'comment';
  export type PlanEvidence = { kind: PlanEvidenceKind; url: string; at: string };
  export type PlanItem = { text: string; ref?: Ref; status: PlanStatus; evidence: PlanEvidence[] };
  export type Plan = { date: string; items: PlanItem[] };
  export type PullRequestTarget = { key: string; owner: string; repo: string; number: number };
  export type CardTarget = { key: string; identifier: string; url: string };
  export type PlanLookupResult = { ok: true; evidence: PlanEvidence[] } | { ok: false };
  export type PendingKind = 'own_pr' | 'review_requested' | 'card';
  export type PendingItem = {
    kind: PendingKind; ref: Ref; title: string; repo?: string; since: string; draft?: boolean;
    state?: string; priority?: 'urgent' | 'high' | 'medium' | 'low' | 'none';
    reviewDecision?: 'approved' | 'changes_requested' | 'review_required' | null;
    checks?: 'success' | 'failure' | 'pending' | null;
  };
  export type Pending = { items: PendingItem[]; truncated: boolean };
  export function pullRequestKey(owner: string, repo: string, number: number): string;
  export function cardKey(identifier: string): string;
  export function planTargets(items: Item[], owner: string): { pullRequests: PullRequestTarget[]; cards: CardTarget[] };
  export function buildPlan(input: { date: string; items: Item[]; results: Map<string, PlanLookupResult> }): Plan;
  export function planIsFresh(planDate: string, today: string): boolean;
  ```
  Keys: `pullRequestKey` → `pr:<owner lower>/<repo lower>#<number>`; `cardKey` → `card:<IDENTIFIER upper>`.

- [ ] **Step 1: Write the failing tests** in `packages/core/test/daily-plan.test.ts`:
  - `planTargets keeps pull requests of the owner and cards, deduplicated` — items with `https://github.com/acme/api/pull/7`, `https://github.com/ACME/api/pull/7/` and `https://github.com/other/lib/pull/1` and a card `https://linear.app/acme/issue/eng-12/x` with owner `acme` → `pullRequests` has one target `{ key: 'pr:acme/api#7', owner: 'acme', repo: 'api', number: 7 }`, `cards` has one target with `key: 'card:ENG-12'`.
  - `planTargets caps each kind at PLAN_LOOKUP_CAP` — 12 distinct pull requests → 10 targets.
  - `buildPlan marks moved, not_moved and unknown` — results `pr:acme/api#7 → { ok: true, evidence: [{ kind: 'commit', url, at }] }`, `card:ENG-12 → { ok: true, evidence: [] }`, an item without ref, an item with an `issue` ref, an item for `other/lib#1` (no result), an item whose result is `{ ok: false }` → statuses `moved`, `not_moved`, `unknown`, `unknown`, `unknown`, `unknown`; `moved` item carries the evidence.
  - `buildPlan gives two items on the same pull request the same status` — both `moved`.
  - `planIsFresh` — `('2026-11-07', '2026-11-14')` → `true`; `('2026-11-06', '2026-11-14')` → `false`.

- [ ] **Step 2: Run** `bun test packages/core/test/daily-plan.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** the interfaces above in `packages/core/src/daily-plan.ts` and export from `packages/core/src/index.ts`. URL parsing goes through `parsePullRequestUrl` / `parseLinearIssueUrl`, so trailing slashes, queries and case are handled there. `buildPlan` looks up each item's key in `results`: missing or `ok: false` → `unknown`; `ok: true` with evidence → `moved`; `ok: true` without → `not_moved`. `planIsFresh` compares with `addCalendarDays(today, -PLAN_MAX_AGE_DAYS)`.

- [ ] **Step 4: Run** `bun test packages/core/test/daily-plan.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit** `feat(core): plan against done rules and pending types`.

### Task 2: Previous daily with its plan

**Files:**
- Modify: `packages/db/src/repo/dailies.ts`
- Test: `packages/db/test/repo.test.ts` (or the dailies test file next to it)

**Interfaces:**
- Produces: `getPreviousDaily(db: Db, installationId: number, memberId: string, before: string): Promise<{ date: string; submittedAt: Date; today: Item[] } | null>` — same filter and order as `getLastDaily`, also selecting `payload` and returning `payload.today`.

- [ ] **Step 1: Write the failing test** `getPreviousDaily returns the latest earlier daily with its today items, scoped to the installation and member` — two dailies for the member (`2026-11-12`, `2026-11-13`), one for another member and one in another installation on `2026-11-13`; `before: '2026-11-14'` → `date: '2026-11-13'` and that daily's `today`; `before: '2026-11-12'` → `null`.
- [ ] **Step 2: Run** `bun test packages/db/test/repo.test.ts -t getPreviousDaily` — Expected: FAIL.
- [ ] **Step 3: Implement** `getPreviousDaily` in `packages/db/src/repo/dailies.ts`. Keep `getLastDaily` unchanged.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(db): read the previous daily with its plan`.

### Task 3: GitHub pending and plan queries

**Files:**
- Create: `packages/adapters/github/src/pending.ts`, `packages/adapters/github/src/plan.ts`
- Modify: `packages/adapters/github/src/index.ts`
- Test: `packages/adapters/github/test/pending.test.ts`, `packages/adapters/github/test/plan.test.ts`

**Interfaces:**
- Consumes: `Pending`, `PendingItem`, `PullRequestTarget`, `PlanLookupResult`, `clampTitle` from core.
- Produces:
  ```ts
  export const PENDING_SEARCH_LIMIT = 50;
  export const GITHUB_GRAPHQL_TIMEOUT_MS = 5000;
  export function listPendingPullRequests(octokit: Octokit, owner: string, login: string): Promise<Pending>;
  export function lookupPlannedPullRequests(
    octokit: Octokit,
    input: { login: string; since: Date; targets: PullRequestTarget[] },
  ): Promise<Map<string, PlanLookupResult>>;
  ```

`listPendingPullRequests` sends one `octokit.graphql` request with two aliased `search(type: ISSUE, first: 50, query: $own | $requested)` where `$own = "is:pr is:open author:<login> <scope>"` and `$requested = "is:pr is:open user-review-requested:<login> <scope>"`; `<scope>` is `org:<owner>` or `user:<owner>` (reuse the owner-type lookup used by `activity.ts`, extracted to a shared helper if needed). Each `PullRequest` node returns `url`, `title`, `isDraft`, `createdAt`, `repository { nameWithOwner }`, `reviewDecision`, `commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }`. Mapping: `own_pr` / `review_requested`; `since` = `createdAt`; `reviewDecision` `APPROVED|CHANGES_REQUESTED|REVIEW_REQUIRED` → lower-case, else `null`; rollup `SUCCESS` → `success`, `FAILURE|ERROR` → `failure`, `PENDING|EXPECTED` → `pending`, none → `null`; `ref = { kind: 'pull_request', url, title }`; titles through `clampTitle`. `truncated` when either search returns 50 nodes.

`lookupPlannedPullRequests` returns an empty map without a request when `targets` is empty. Otherwise one request with aliases `p0`…`pN`, each `repository(owner: $oN, name: $rN) { pullRequest(number: $nN) { … } }` returning `mergedAt`, `closedAt`, `merged`, `url`, `commits(last: 100) { nodes { commit { committedDate author { user { login } } } } }`, `reviews(author: $login, last: 20) { nodes { submittedAt url } }`. Evidence for one target, at most one per kind with the latest `at`: `commit` when a commit by `login` (case-insensitive) has `committedDate >= since`; `review` when a review has `submittedAt >= since`; `merged` when `mergedAt >= since`; `closed` when not merged and `closedAt >= since`. A null `pullRequest` or an alias named in the response `errors` → `{ ok: false }`. A whole-request failure throws (the use case turns it into a warning). Both functions pass `request: { signal: AbortSignal.timeout(GITHUB_GRAPHQL_TIMEOUT_MS) }`.

- [ ] **Step 1: Write the failing tests** with the fake fetch used by the other GitHub adapter tests:
  - `listPendingPullRequests maps both searches` — asserts the two query strings in the request variables (`user-review-requested:alice org:acme`), that values travel as variables, and the mapped `reviewDecision`, `checks`, `draft`, `kind`.
  - `listPendingPullRequests sets truncated at 50 results`.
  - `lookupPlannedPullRequests builds aliases from the index and passes owner, repo and number as variables` — asserts the query text contains `p0:` and `$o0` and contains no target value.
  - `lookupPlannedPullRequests finds commits, reviews and merges inside the window only` — a commit by `bob` and an older commit by `alice` → `{ ok: true, evidence: [] }`; a commit by `Alice` after `since` → `commit` evidence.
  - `lookupPlannedPullRequests marks an alias with errors as not ok and keeps the others` (Review Focus 3).
  - `lookupPlannedPullRequests sends no request for no targets`.
- [ ] **Step 2: Run** `bun test packages/adapters/github/test/pending.test.ts packages/adapters/github/test/plan.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** both files and export them from `index.ts`.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(github): pending pull requests and planned pull request lookups over GraphQL`.

### Task 4: Linear pending and plan queries, and the tracker

**Files:**
- Create: `packages/adapters/linear/src/pending.ts`, `packages/adapters/linear/src/plan.ts`
- Modify: `packages/adapters/linear/src/index.ts`, `packages/orchestrator/src/modules/linear/project-tracker.ts`, `packages/orchestrator/src/modules/linear/linear-tracker.ts`
- Test: `packages/adapters/linear/test/pending.test.ts`, `packages/adapters/linear/test/plan.test.ts`, the existing linear-tracker test in `packages/orchestrator/test`

**Interfaces:**
- Consumes: `Pending`, `CardTarget`, `PlanLookupResult` from core; `LinearClient`.
- Produces:
  ```ts
  export function listAssignedOpen(client: LinearClient, input: { userId: string; teamKey: string }): Promise<Pending>;
  export function lookupPlannedCards(
    client: LinearClient,
    input: { userId: string; since: Date; targets: CardTarget[] },
  ): Promise<Map<string, PlanLookupResult>>;
  ```
  `ProjectTracker` gains:
  ```ts
  listAssignedOpen(login: string): Promise<Pending>;
  lookupCards(login: string, refs: CardTarget[], since: Date): Promise<Map<string, PlanLookupResult>>;
  ```
  `nullTracker` returns `{ items: [], truncated: false }` and an empty map.

`listAssignedOpen` queries issues assigned to `userId` in team `teamKey`, `first: 50`, with filter `or: [{ state: { type: { eq: "started" } } }, { state: { type: { eq: "unstarted" } }, priority: { in: [1, 2] } }]`, returning `identifier url title updatedAt priority state { name }`. Priority mapping 1 urgent, 2 high, 3 medium, 4 low, 0 none. Items are `kind: 'card'`, `ref: { kind: 'card', url, title }`, `since: updatedAt`, `state: state.name`. `truncated` at 50.

`lookupPlannedCards` sends one query `issues(filter: { or: [ { team: { key: { eq: $t0 } }, number: { eq: $n0 } }, … ] }, first: 10)` with `$tN` / `$nN` split from each identifier (`ENG-12` → `ENG`, `12`), returning per issue `identifier url history(last: 50) { nodes { createdAt toState { name } } } comments(filter: { user: { id: { eq: $userId } } }, last: 20) { nodes { createdAt url } }`. Evidence: `state_changed` for a history entry with `toState` and `createdAt >= since`; `comment` for a comment with `createdAt >= since`; at most one per kind with the latest `at`. Targets whose identifier is not in the response → `{ ok: false }`. No request for no targets.

`LinearTracker.listAssignedOpen` and `lookupCards` resolve the Linear user with `linearUserId(login)`: no identity → empty pending and an empty map. `lookupCards` keeps only targets whose URL workspace (`parseLinearIssueUrl`) equals `this.access.organization.urlKey` (case-insensitive). Both go through `guard`.

- [ ] **Step 1: Write the failing tests:**
  - `listAssignedOpen filters started or urgent and high unstarted cards and maps priority` — asserts the filter variables and `priority: 'high'` for 2.
  - `lookupPlannedCards queries by team and number as variables` — asserts no identifier text in the query string.
  - `lookupPlannedCards keeps found cards when one identifier is missing` (Review Focus 2) — response without `OLD-3` → that key `{ ok: false }`, the other resolved.
  - `lookupPlannedCards counts only changes and comments inside the window`.
  - tracker: `lookupCards skips cards of another workspace` and `returns nothing when the person has no Linear identity` (Review Focus 4).
- [ ] **Step 2: Run** `bun test packages/adapters/linear/test packages/orchestrator/test -t "listAssignedOpen|lookupPlannedCards|lookupCards"` — Expected: FAIL.
- [ ] **Step 3: Implement** the adapter functions, the interface methods, `nullTracker` and `LinearTracker`.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(linear): pending cards and planned card lookups`.

### Task 5: Wire the new GitHub functions

**Files:**
- Modify: `packages/orchestrator/src/deps.ts`, `apps/api/src/main.ts`, `apps/worker/src/main.ts`, `packages/orchestrator/test/use-cases/fakes.ts`

**Interfaces:**
- Produces: `Deps['github']` gains `listPendingPullRequests: typeof listPendingPullRequests` and `lookupPlannedPullRequests: typeof lookupPlannedPullRequests`. `fakeDeps()` defaults them to `async () => ({ items: [], truncated: false })` and `async () => new Map()`.

- [ ] **Step 1: Add** the two members to `Deps['github']`, the imports and wiring in both `main.ts` files, and the fake defaults.
- [ ] **Step 2: Run** `bun run typecheck` — Expected: no errors.
- [ ] **Step 3: Commit** `chore: wire the pending and plan GitHub queries`.

### Task 6: Draft use case with plan, pending and warnings

**Files:**
- Create: `packages/orchestrator/src/modules/daily/draft-plan.ts`, `packages/orchestrator/src/modules/daily/draft-pending.ts`
- Modify: `packages/orchestrator/src/modules/daily/get-draft.ts`
- Test: `packages/orchestrator/test/use-cases/get-draft.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces:
  ```ts
  export type DraftWarningSource =
    | 'github_activity' | 'github_pending' | 'github_plan'
    | 'linear_activity' | 'linear_pending' | 'linear_plan';
  export type DraftWarning = { source: DraftWarningSource; code: string };
  export type Draft = { org; date; since; teams; activity; suggestions; plan: Plan | null; pending: Pending; warnings: DraftWarning[] };
  export function warningCode(error: unknown): string;
  export function loadPlan(deps: Deps, ctx: OrgContext, tracker: ProjectTracker, warn: (w: DraftWarning) => void): Promise<Plan | null>;
  export function loadPending(deps: Deps, ctx: OrgContext, tracker: ProjectTracker, warn: (w: DraftWarning) => void): Promise<Pending>;
  ```
  `warningCode`: `GitHubRateLimitError` or `LinearRateLimitError` → `rate_limited`; `LinearAuthError` → `auth`; an abort or timeout error → `timeout`; anything else → `unavailable`.

`getDraft` gets the tracker once (`deps.trackerFor(...)`, failure → `nullTracker` plus a `linear_activity` warning), then runs in parallel: GitHub activity, card activity, suggestions, `loadPlan`, `loadPending`. Each call is wrapped so a throw logs through `logError(label, error, { installationId, source })` and pushes a warning; the call contributes nothing. A disconnected tracker (`connected: false`) adds no warning.

`loadPlan`: `getPreviousDaily(db, installationId, memberId, ctx.date)`; `null` or not `planIsFresh` → `null`. Otherwise `planTargets(previous.today, ctx.owner)`, then `deps.github.lookupPlannedPullRequests` (`github_plan`) and `tracker.lookupCards` (`linear_plan`) in parallel with `since = previous.submittedAt`, merge the maps, and `buildPlan({ date: previous.date, items: previous.today, results })`.

`loadPending`: `deps.github.listPendingPullRequests` (`github_pending`) and `tracker.listAssignedOpen` (`linear_pending`) in parallel; concatenate items, `truncated` if either is.

- [ ] **Step 1: Write the failing tests** in `get-draft.test.ts`:
  - `the draft carries the previous plan with statuses` — upsert a daily for yesterday whose `today` has a pull request in `acme`, a pull request in `other`, and a text-only item; fake `lookupPlannedPullRequests` returns a commit for the `acme` key → `plan.items` statuses `moved`, `unknown`, `unknown`; the fake was called only with the `acme` target (Review Focus 1).
  - `the plan is null without a previous daily or when it is older than 7 days`.
  - `pending lists pull requests and cards from both sources`.
  - `a failing source becomes a warning and the rest of the draft still returns` — `listActivity` throws → `warnings: [{ source: 'github_activity', code: 'unavailable' }]` and `pending`, `suggestions` still filled. Same for `lookupPlannedPullRequests` throwing → plan items `unknown`, warning `github_plan`.
  - `plan cards are unknown without a Linear identity` (Review Focus 4) — no `setIdentity` for Linear → card items `unknown`, no warning.
  - `the draft never reads another installation's previous daily`.
- [ ] **Step 2: Run** `bun test packages/orchestrator/test/use-cases/get-draft.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `draft-plan.ts`, `draft-pending.ts` and the new `getDraft`, export the new types from the orchestrator index.
- [ ] **Step 4: Run** the same command, then `bun test packages/orchestrator` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(daily): plan against done, pending work and source warnings in the draft`.

### Task 7: API schema and privacy

**Files:**
- Modify: `apps/api/src/openapi/schemas.ts`, `apps/api/test/no-suggestion-leak.test.ts`
- Test: the API draft test that already checks `/v1/draft` (find it with `grep -rn "v1/draft" apps/api/test`).

**Interfaces:**
- Produces: `DraftSchema` gains `plan: PlanSchema.nullable()`, `pending: PendingSchema`, `warnings: z.array(DraftWarningSchema)`, with `DRAFT_EXAMPLE` updated. The route stays in the internal OpenAPI document.

- [ ] **Step 1: Write the failing tests:**
  - in the API draft test: `GET /v1/draft returns plan, pending and warnings` (response matches `DraftSchema`).
  - in `no-suggestion-leak.test.ts`: `plan and pending never leave the person's draft` — fakes return a pending pull request titled `PENDING-ONLY-TITLE` and a plan evidence URL `https://github.com/acme/api/pull/999`; after the person opens the draft and submits a daily, the bodies of `/v1/org/dailies`, `/v1/org/teams`, the manage routes, the webhook payloads, the digest and the setup page contain neither string, and no `console` output contains them.
- [ ] **Step 2: Run** `bun test apps/api/test/no-suggestion-leak.test.ts` and the draft test — Expected: FAIL.
- [ ] **Step 3: Implement** the schemas and the example.
- [ ] **Step 4: Run** the same tests and `bun test apps/api/test/openapi*` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): plan, pending and warnings in the draft response`.

### Task 8: CLI, MCP and the `/daily` skill

**Files:**
- Modify: `apps/cli/src/mcp/tools.ts` (`draftOut` and the server instructions text), `apps/cli/src/draft/with-sessions.ts` if it rebuilds the draft object, `packages/plugin/skills/daily/SKILL.md`
- Test: the existing MCP tool test for `standcast_get_draft` in `apps/cli/test`

**Interfaces:**
- Produces: `draftOut` declares `plan: z.looseObject({ date: z.string(), items: z.array(z.unknown()) }).nullable().optional()`, `pending: z.looseObject({ items: z.array(z.unknown()), truncated: z.boolean() }).optional()`, `warnings: z.array(z.looseObject({ source: z.string(), code: z.string() })).optional()`.

- [ ] **Step 1: Write the failing test** `standcast_get_draft passes plan, pending and warnings through, with and without sessions`.
- [ ] **Step 2: Run** `bun test apps/cli/test -t standcast_get_draft` — Expected: FAIL.
- [ ] **Step 3: Implement** `draftOut` and keep the fields when sessions are added.
- [ ] **Step 4: Rewrite the flow** in `SKILL.md` and the MCP instructions to the spec's seven steps, with exactly these rules: planned against done is shown only to the person and never copied into the daily; ✅ / ⏸️ / ❓ markers with ⏸️ worded as "no activity found"; pending in the five groups of the spec, at most 10 lines plus a count; up to 5 focus items with a short reason each; accept numbers, "ok" or free text; one line per warning naming the unavailable source; never say a manager will see any of it.
- [ ] **Step 5: Run** `bun test apps/cli` and `bun run lint` — Expected: PASS.
- [ ] **Step 6: Commit** `feat(daily): open the daily with the plan and pending work`.

### Task 9: Docs and changelog

**Files:**
- Modify: `docs/site/members/claude-code.md`, `docs/site/members/mcp.md`, `docs/site/members/cli.md`, `docs/site/privacy.md`, `docs/site/changelog.md`, and the same files under `docs/site/pt-BR/`.

- [ ] **Step 1: Write** the new opening of the daily and the pending groups in the three member pages; in privacy, that planned against done and pending are computed when the person opens the draft, shown only to them and not stored; one bullet under `Unreleased` and the same under `Não lançado`.
- [ ] **Step 2: Run** `bun run check-docs` and `bun test scripts` — Expected: PASS.
- [ ] **Step 3: Run** the full suite: `bun run lint && bun run typecheck && bun test` — Expected: 0 fail.
- [ ] **Step 4: Commit** `docs: plan against done and pending work in the daily`.
