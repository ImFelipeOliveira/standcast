# Review guide

Patterns Standcast follows, code smells to flag and bugs that have actually happened here. Reviewers use it: people, the CodeRabbit bot (`.coderabbit.yaml` points here) and coding agents. Each item says what to look for and what the fix looks like.

## Architecture

- **Business rules live in use cases.** They take `deps` and throw `DomainError` with a stable `code`. Each module lives in `packages/orchestrator/src/modules/<name>` and owns its use cases: `access`, `beta`, `chat`, `daily`, `delivery`, `github`, `linear`, `org`, `retention`, `session` and `setup`. Shared helpers (`deps`, logging, tokens, teams, membership) stay at the package root.
- **Routes, jobs, the CLI and the MCP server stay thin.** They parse input, call one use case and map the result.
  - Smell: a branch on business state, a database query or a GitHub/Slack/Linear call inside a route, a job or the CLI.
- **Pure rules live in `@standcast/core`:** config parsing, calendar, fingerprints, URL parsing, CODEOWNERS, message builders.
  - They have no I/O and no `Date.now()`. They take `now` as a parameter.
- **Adapters** (`packages/adapters/*`) translate external APIs into small typed functions. They do not decide product behaviour.
- **Dependencies.** A package may import only what it declares in its own `package.json` (`bun run check-deps` enforces this).
  - Smell: an app importing `drizzle-orm` or `postgres` directly. Use a function from `@standcast/db` instead.
- **Layer direction.** `bun run check-layers` fails when `src` imports a package its layer must not see, or a relative path into another workspace package. Docs, scripts and the root `package.json` are not other packages. Tests are not scanned.
  - `@standcast/core` sees no other `@standcast` package.
  - `@standcast/db` sees only `@standcast/core` among workspace packages, and is the only package that may import `drizzle-orm` or `postgres`.
  - `@standcast/queue` sees only `@standcast/core`, and is the only package that may import `pg-boss`.
  - Adapters see only `@standcast/core`. They do not see each other, the database, the queue or the orchestrator.
  - `@standcast/orchestrator` sees core, the database, the queue and the adapters it composes. It does not see `@standcast/google-chat` (that stays behind `ChatChannel`) or any app.
  - The API and the worker may wire adapters. The web app sees only the orchestrator. The CLI sees only core. Apps do not import one another.

## Multi-tenant

- **Scope every query by `installation_id`,** plus `member_id` when the data belongs to a person.
  - Smell: a lookup by `id` alone, for example `getDelivery(id)` or `findMemberByIdentity(externalId)`, without the installation.
- **Check owners and workspaces.** A GitHub owner or Linear workspace taken from a URL or payload is used only if it matches the installation's account or connected workspace.
  - Smell: calling the GitHub API for a pull request URL whose owner was not checked.
- **Redirects** are built only from configured URLs (`PUBLIC_URL`, `DOCS_URL`), never from request headers or paths.

## Anti-surveillance (product rule)

- **Private data.** Suggestions (`pr_no_review`, `ci_failing`, `card_stale`), Linear card activity and per-person signals are visible only to the person. They must never reach:
  - the digest;
  - `/v1/org/*` or `/v1/manage/*`;
  - outgoing webhooks;
  - the setup page, including failed deliveries (`listFailedDeliveries` uses an allowlist of kinds);
  - logs.
- **No per-person metrics,** rankings, counts of commits or "productivity".
- **Nothing is sent on a person's behalf** without their confirmation.
- **Tests.** A new org, manage or webhook output needs a case in `apps/api/test/no-suggestion-leak.test.ts`.

## Once-only and idempotency

- **Deliveries claim first.**
  - Messages to Slack (digest, reminder, blocker routing, suggestion DM) go through `claimDelivery` → `completeDelivery`/`failDelivery`, with the fencing token.
  - Every call after the claim must sit inside the `try`, so a thrown error records a failure instead of leaving the row `pending`.
- **Delivery keys** are `(installation, teamName, date, kind, subject)`. Person-level kinds use `teamName: ''`. Subjects must identify the recipient so retries do not resend.
- **Queue jobs.**
  - Every `queue.enqueue` uses the same policy (`plain`, `keyed`, `stately`) as the worker's `queue.work` for that job name. A mismatch strands jobs forever.
  - `singletonKey`s include everything that makes the job unique.
- **Retries never repeat side effects.** Check what a retried job does a second time.
- **Races.**
  - Use compare-and-swap (`WHERE` on the previous value) or a transaction-scoped advisory lock when two workers can update the same row.
  - Counting rows and then inserting is a race unless both happen under the same lock.

## External calls

- **Timeouts.** Every HTTP call to GitHub, Slack or Linear has one (`AbortSignal.timeout`).
  - Smell: a `fetch` without a signal.
  - Smell: a network call made while holding a database lock or an open transaction, unless it is bounded.
- **Pagination.** Paginated APIs are read page by page up to a cap. Code that reads one page and treats it as complete is a bug.
  - When the cap is reached, the caller must not resolve or delete things that are merely missing from the truncated list.
- **Errors.**
  - Map provider errors to typed errors: `LinearAuthError`, `LinearRateLimitError`, `GitHubRateLimitError`, `ChatDeliveryError` codes.
  - Read the provider's docs for what a code means. Slack's `account_inactive` means the bot token is dead, not that the recipient left.
- **Treat external input as untrusted:** titles, CODEOWNERS files, webhook payloads, URLs.
  - Pass GraphQL inputs as variables.
  - No regex that can backtrack on user-controlled input (ReDoS).
  - Fence untrusted text before giving it to an agent (MCP).
- **Never resolve or delete state because a source failed.** When GitHub or Linear errors, skip that source's sync. Do not call it with an empty list.

## Security

- **Logging.** Log only through `logError(label, error, extra)`, which keeps `name`, `code` and `message`.
  - Never log tokens, secrets, emails, daily or card text, request bodies or Drizzle params.
  - Smell: `console.error(error)` or `console.log(payload)`.
- **Secrets.** Store them encrypted (`encryptSecret`). Never render them in HTML or put them in error messages.
- **Server pages** (`apps/api/src/web`) run under a strict CSP:
  - no `style="…"` attributes and no `<script>`;
  - styles come only from classes in `styles.ts`;
  - forms that change state carry the CSRF field;
  - a cross-site request must not change state.
- **Public endpoints** like `/health` must not be cheap to abuse. Bound them in time and coalesce concurrent work.
- **Authorization is never bypassed.** Org and installation access always goes through `authorizeInstallation` / `resolveOrgContext`, and admin actions through `requireAdmin`.

## Time and dates

- **Team times.** `remind_at` and `digest_at` are local times in the team's time zone. Use `localDate`, `localInstant` and `isDue` from core. Never compare local times as strings across time zones.
- **Workdays** come from the team config. "Today" for a person follows their first team in `standcast.yml`.
- **Reminders** go out only while `remind_at ≤ now < digest_at`.

## i18n and copy

- **Text through i18n.** Every user-visible string goes through `t(lang, key)` with keys in both `pt-BR` and `en`. A missing key is a type error. The default language is `en`.
- **Error codes.** API error messages are English and the `code` is the contract. New codes are added to the error tables in the docs.
- **Copy for one person** (reminders, suggestions) never implies that someone else is watching.

## Code style

- **No comments in code:** TS, TSX, CSS, shell, YAML and Dockerfile. Names and tests carry the meaning.
- **Small focused files.** Split by responsibility when a file grows past about 400 lines.
- **No dead code.**
  - Smell: unused exports, unused i18n keys, CSS classes nothing renders.
  - Smell: a helper duplicated in two files with different signatures.
- **Clever code.** Prefer explicit booleans and named helpers to clever expressions.

## Tests

- **Tests assert behaviour,** not implementation. A test that would pass if the feature were removed is a smell.
- **Every fix gets a test** that fails without the fix.
- **Edge cases worth a test:**
  - exact thresholds (`>=`);
  - a provider error;
  - a retry;
  - two concurrent runs;
  - another installation's data;
  - a member who is not an admin;
  - pt-BR copy;
  - long values (URLs, names) that must wrap.
- **No real network.** Use the fake fetch, `fakeDeps`, `fakeChat` and the Postgres test database.

## Docs

- **Language parity.** Behaviour or configuration changes update `docs/site` in both `en` and `pt-BR` (`bun run check-docs` checks parity).
- **Product changelog and API changelog are separate.** Write each change in the file that matches what changed. Do not put an API contract note in the product changelog, and do not put a product note in the API changelog. A pull request that changes both writes one bullet in each place. `docs`, `chore`, `ci` and `test` commits do not cut a release and need neither.
- **Product.** A `feat`, `fix`, `perf` or `refactor` that a person can see (landing, app, CLI, digest, setup, configuration) adds one bullet under `Unreleased` in `docs/site/changelog.md` and the same news under `Não lançado` in `docs/site/pt-BR/changelog.md`, before the pull request merges. On release those bullets become the version notes. The release job moves them and does not write a product note, so a `fix` a person cannot see can release with that section empty.
  - Smell: a change a person can see with no new product line, or a line in only one language.
- **API.** A change to the public API contract (paths, fields, status codes, scopes, webhook payloads) adds one bullet under `Unreleased` in `docs/api/CHANGELOG.md` before the pull request merges. Versions there match the GitHub releases. If the release does not change the public API, that file gets "No public API changes." Internal routes stay out of this file.
- **Internal routes** (`/v1/sessions`, `/v1/draft`, `/v1/dailies`, `/v1/today`, `/v1/manage/*`, `/v1/suggestions/*`) stay out of the public OpenAPI document.
