# Daily: planned against done, and what is waiting on you

Date: 2026-11-14. Status: design, waiting for Felipe's approval.

## Why

The orangebr team built their own Claude Code skill (`daily-progress`) before adopting Standcast, and kept it after. Standcast became only the transport and the data source for their squad dashboard. Their skill does three things our `/daily` does not:

1. It opens with **what you planned yesterday and whether it moved**.
2. It shows **what is waiting on you** (your open pull requests, reviews requested from you, your cards in progress or urgent) and helps you pick up to 5 focus items for today.
3. It writes each item with detail and links.

The first two are the core of a good daily and every team benefits. If `/daily` does them, a team does not need its own skill to have a good daily, and Standcast stays the place where the daily is written.

## Goals

- The draft returns **`plan`**: the "today" items of the person's previous daily, each marked as moved, not moved, or unknown, with the activity that proves it.
- The draft returns **`pending`**: the person's open pull requests, the open pull requests where their review is requested, and their assigned cards that are in progress, or not started with urgent or high priority.
- The `/daily` skill opens with planned against done, shows the pending work grouped, recommends up to 5 focus items with a short reason each, and builds "today" from what the person picks. The person can always write their own items instead.
- A failure in one source (GitHub activity, GitHub pending, Linear) no longer fails the whole draft. The draft returns what it has and says which source failed.

## Non-goals

- Writing to Linear (moving cards, assigning). That needs another permission and changes what Standcast is.
- A per-team text template for the daily or the digest. The digest keeps its format.
- Deploy "lanes" (whether commits reached a release branch). They are specific to one team's workflow.
- Several links per item (`refs[]`). It changes the public API contract and goes in a separate pull request.
- Choosing today's focus for the person. The skill recommends; the person decides.

## Anti-goals (a failure even if it works)

- **Planned against done is private.** It is shown only to the person, in their own draft. It must never reach the digest, `/v1/org/*`, `/v1/manage/*`, outgoing webhooks, the setup page, the web panel's team views, manager MCP tools, or logs. No "completion rate", no counts of unmet plans, nothing stored per person about it. It is computed on request and not persisted.
- **Pending is private too.** It lists the person's own work for the person only. Managers do not get a "what is pending for each person" view out of this.
- **Copy never implies someone is watching.** "Not moved" is a neutral fact for the person ("no activity found"), never a judgement, and the skill never says a manager will see it.
- **No invented claims.** An item is "moved" only when there is matching activity. Without a link to match, it is "unknown" and the skill asks the person.

## Constraints

- Business rules live in a use case (`packages/orchestrator/src/modules/daily`); the route `/v1/draft` stays thin. Pure matching logic goes to `@standcast/core` (no I/O, `now` passed in).
- Every query is scoped by `installation_id` and `member_id`.
- External calls use the installation token for GitHub and the workspace connection for Linear (as today), each with a timeout and a page cap. A capped list is marked `truncated`, and nothing is inferred from what is missing in it.
- `/v1/draft` is an internal route (out of the public OpenAPI document). New fields need no `docs/api/CHANGELOG.md` entry. The product changelog gets one bullet in en and pt-BR.
- User-visible text in the CLI goes through `t(lang, key)` in both languages. The skill is English text that tells the agent to talk in the person's language.
- No comments in code.

## Approaches

1. **On the server, inside the draft (chosen).** `GET /v1/draft` gains `plan`, `pending` and `warnings`. The server already holds the GitHub and Linear access, so it works the same in MCP, the CLI and any agent, and the privacy rule is enforced and tested in one place. Cost: the draft makes more external calls and gets somewhat slower, so the calls run in parallel with timeouts.
2. **In the CLI, like sessions.** The CLI has no GitHub or Linear token, so pending would still need the server. The logic would be split in two places. Rejected.
3. **Only in the skill, like orangebr.** The agent would call `gh` and the person's Linear MCP. It works only where those tools are set up, varies per machine and cannot be tested. Rejected.

Felipe picked approach 1 on 2026-11-14.

## Design

### Draft response

`Draft` keeps its current fields (`org`, `date`, `since`, `teams`, `activity`, `suggestions`) and adds:

```ts
type PlanStatus = 'moved' | 'not_moved' | 'unknown';

type PlanItem = {
  text: string;
  ref?: Ref;
  status: PlanStatus;
  evidence: { kind: ActivityItem['kind']; url: string; at: string }[];
};

type Plan = { date: string; items: PlanItem[] } | null;

type PendingItem = {
  kind: 'own_pr' | 'review_requested' | 'card';
  ref: Ref;
  title: string;
  repo?: string;
  since: string;
  draft?: boolean;
  state?: string;
  priority?: 'urgent' | 'high' | 'medium' | 'low' | 'none';
};

type Pending = { items: PendingItem[]; truncated: boolean };

type DraftWarning = {
  source: 'github_activity' | 'github_pending' | 'github_plan' | 'linear_activity' | 'linear_pending' | 'linear_plan';
  code: string;
};
```

`plan` is `null` when the person has no previous daily in this installation.

### Planned against done

- **Which daily.** The previous daily is the latest one of this member in this installation with `date < ctx.date` (the same one `getLastDaily` finds today). `getLastDaily` is extended, or a sibling added, to also return its `payload.today` and `submittedAt`.
- **Too old.** When that daily's `date` is more than 7 calendar days before `ctx.date`, `plan` is `null` (someone back from a week off does not get a stale plan).
- **Window.** Evidence is looked for from the start of that daily's local date in the team's timezone (or from its first submission, when that is earlier) until now. A resubmit later in the day does not move the window.
- **Direct lookups (Felipe chose this on 2026-11-14).** The general activity feed only sees start and end events (pull request opened or merged, card started or done) and the GitHub commit search only covers default branches, so ongoing work would look idle. Instead, the planned items are looked up directly, in at most two GraphQL requests:
  - **GitHub:** one GraphQL query with one alias per planned pull request (at most 10). For each: `state`, `mergedAt`, `closedAt`, the last 100 commits with `committedDate` and author login, and the reviews authored by the person with `submittedAt`. The owner, repository and number of each pull request are GraphQL variables, never interpolated text. The owner must be the installation's account; a pull request in another owner is `unknown` and is not queried.
  - **Linear:** one GraphQL query with one alias per planned card (at most 10), `issue(id: <identifier>)`, returning the state history entries and the person's comments created in the window. Only cards of the connected workspace are queried; others are `unknown`.
  - Planned items beyond the first 10 with a pull request or card ref are `unknown`.
- **Status rules.** For each item of that daily's `today`:
  - `moved` when its own lookup succeeded and shows, inside the window, at least one of: a commit authored by the person, a review submitted by the person, the pull request merged or closed, a state change of the card, or a comment by the person on the card.
  - `not_moved` only when its own lookup succeeded and found none of these.
  - `unknown` in every other case: no `ref`, a `ref` of another kind, the source not connected or not linked to the person (no Linear identity), the item outside the installation's owner or workspace, the item beyond the lookup cap, or the lookup failed or timed out.
- `evidence` lists what was found (`{kind, url, at}` with kinds such as `commit`, `review`, `merged`, `closed`, `state_changed`, `comment`), so the skill can say what happened.
- The status rules are a pure function in core that takes the planned items and the lookup results (including which lookups failed or were skipped), tested on its own: no ref, URL with a trailing slash or query, card by identifier, pull request in another owner, lookup failed, commits by someone else only, review outside the window, two items pointing to the same pull request.

### Pending

Two requests run in parallel with the existing activity calls:

1. **GitHub, one GraphQL query with two aliased searches** in the installation owner (`org:` or `user:`), each limited to 50 results:
   - own open pull requests: `is:pr is:open author:<login>`;
   - review requested directly from the person: `is:pr is:open user-review-requested:<login>`. Requests made to GitHub teams the person belongs to are left out on purpose.

   Each result returns `url`, `title`, repository, `isDraft`, `createdAt`, `updatedAt`, `reviewDecision` and the head commit's `statusCheckRollup.state`. This replaces `listOpenPullRequestSnapshots` in the request path, which stays in the worker for the signals.
2. **Linear:** a new adapter function, next to `listStaleInProgress`, listing the person's assigned issues in the team's Linear team with state type `started`, or `unstarted` with priority urgent (1) or high (2). It returns identifier, title, URL, state name, priority and `updatedAt`, one page of up to 50. It uses the first team's tracker, as the draft does today.

`PendingItem` gains `reviewDecision?: 'approved' | 'changes_requested' | 'review_required' | null` and `checks?: 'success' | 'failure' | 'pending' | null` for pull requests. A search that returns its limit sets `truncated`.

Grouping in the skill:

- **Waiting on you:** review requested from you and not a draft; your pull requests with changes requested or failing checks.
- **Your cards, urgent or high.**
- **In progress:** your started cards; your pull requests with no review decision yet and passing or pending checks.
- **Approved, ready to merge:** your pull requests that are not drafts, approved with passing checks or no checks. An approved draft stays in progress.
- **Drafts:** review requests on draft pull requests, as one short line.

### Budget

- GitHub: the existing 4 search calls, plus 1 GraphQL request for pending and at most 1 for the plan. No per-item REST calls.
- Linear: the existing activity call, plus 1 for pending and at most 1 for the plan.
- GitHub requests have a 5-second timeout; Linear requests keep the shared client timeout (10 seconds). All run in parallel, so the draft adds about one round trip in the usual case.

### Failure isolation

- Every request (GitHub activity, GitHub pending, GitHub plan, Linear activity, Linear pending, Linear plan) runs in its own `try`, logs through `logError` with only the source and error code, and adds a `DraftWarning`. The draft returns the rest.
- This changes current behaviour on purpose: today a GitHub activity error fails the whole draft.
- A source that failed contributes nothing and resolves nothing.

### The `/daily` skill and MCP instructions

The skill (`packages/plugin/skills/daily/SKILL.md`) and the MCP server instructions change their flow to:

1. Get the draft.
2. **Planned against done**, if `plan` is not null: one line per planned item with ✅ moved (and what happened, from `evidence`), ⏸️ no activity found, or ❓ unknown (ask the person). This is shown to the person only and is never copied into the daily.
3. Build yesterday as today (at most 5 lines, grouped, with refs), unchanged.
4. Suggestions, unchanged.
5. **Pending**, in the groups listed under Pending. Show at most 10 lines; mention the rest as a count.
6. **Recommend up to 5 focus items** with a reason each (unblocks someone, almost done, urgent, planned yesterday and not moved). Ask "what will you focus on today?" and accept numbers, "ok" for the recommendation, or free text.
7. Today's items come from the choice, each with its ref. Then blockers, support, final confirmation and submit, unchanged.

When `warnings` is not empty, the skill says in one line which source was unavailable and continues.

The CLI `draft` command prints the new fields as part of the JSON. The MCP `draftOut` schema passes them through. The CLI fallback in the skill uses the same flow.

### Privacy enforcement

- `apps/api/test/no-suggestion-leak.test.ts` (or a sibling) gets cases proving `plan` and `pending` content never appears in `/v1/org/*`, `/v1/manage/*`, webhooks, the digest or the setup page.
- Logs carry the source and the error code only, never titles, URLs or text.

### Docs

- `docs/site/members/claude-code.md`, `members/mcp.md` and `members/cli.md` (en and pt-BR) describe the new opening of the daily and the pending list.
- `docs/site/privacy.md` (en and pt-BR) says planned against done and pending are shown only to the person and are not stored.
- Product changelog: one bullet under Unreleased (en) and Não lançado (pt-BR).

### Tests

- Core: the plan matcher cases above.
- Use case: plan from the previous daily; `plan: null` without one; pending from the three sources with fakes; each source failing on its own produces a warning and the rest of the draft; another installation's dailies and cards never appear; a member who is not in any team still gets `not_in_team` as today.
- Adapters: the GitHub pending query (both searches, variables, mapping of `reviewDecision` and `statusCheckRollup`, timeout); the GitHub plan query with aliases built only from a fixed template and values passed as variables; the Linear plan query by identifier; the Linear assigned-open query filters and priority mapping.
- API: the privacy cases above and the draft response shape.

## Calls made in the design (check these)

- `not_moved` only after a successful direct lookup; every blind spot is `unknown`.
- A plan older than 7 days is not shown.
- "Waiting on you" counts only reviews requested from the person directly, not from their GitHub teams.
- Pending pull requests come from one GraphQL query with `reviewDecision` and the checks state, not from the worker's per-PR snapshot function.
- At most 10 planned items are looked up per source; 5-second timeout per request.

## Left to the builder

- Exact field and function names, and where the URL normalizer lives in core.
- The Linear priority number to label mapping (Linear uses 1 urgent, 2 high, 3 medium, 4 low, 0 none).
- The exact wording of the skill and of the CLI strings, within the rules above.
- Whether the plan matcher also uses `suggestions` as evidence (for example a resolved `pr_no_review`). Not required.
