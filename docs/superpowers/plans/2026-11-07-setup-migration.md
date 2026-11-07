# Setup Migration (Phase 2a, PR 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop rendering setup in the API. After install, Slack connect, and Linear connect, the person lands on Configuração in the web app.

**Architecture:** `GET /setup` on the API becomes a 302 to `APP_URL/setup`, keeping the query string, except the one case where the installation is not in the session yet: that still does today's single GitHub resync and, if it is still missing, stays on the API pending page. Slack and Linear success callbacks 302 to the app's Configuração with `connected=slack` or `connected=linear`. Their failure pages stay on the API. The HTML setup page, its POST forms, and the flash cookie go away. API keys, webhooks, and Google Chat already run through `/v1/app/*` and stay there. No feature flag.

**Tech Stack:** Bun 1.4.4, Hono on `apps/api`, React 19 and TanStack Router on `apps/web`. Hosts: API `https://api.standcast.app`, app `https://app.standcast.app`.

**Spec:** `docs/superpowers/specs/2026-11-01-phase-2-web-app-design.md`, section "Setup migration (2a)". PR 1 is already shipped: `apps/web/src/router.tsx` route `/setup` redirects to `/orgs/$installationId/configuracao`, and Configuração calls the existing use cases.

## Global Constraints

- No comments in any code file: TS, TSX, CSS, HTML, JS, shell, YAML, JSONC.
- Commits, identifiers, and engineering docs in English. App copy in both `apps/web/src/i18n/en.ts` and `apps/web/src/i18n/pt-BR.ts`.
- Business rules stay in use cases under `packages/orchestrator/src/modules/` and throw `DomainError(code, message)`. Routes stay thin.
- Anti-surveillance: Configuração shows no per-person metric, rate, ranking, or history of who did not send.
- A package imports only what its own `package.json` declares (`bun run check-deps`).
- The app and the API stay on `standcast.app`. Do not point `APP_URL` at another registrable domain.
- Every task ends green on `bun test` for the files it names, plus `bun run lint` and `bun run typecheck`.

## Review Focus

- A brand-new GitHub install opens `/setup?installation_id=777` before that installation is in the session. The person must not be sent to the empty home and lose the id. One resync login, then a pending page, never a loop.
- Slack or Linear returns `error` or a failed exchange. The browser stays on the API error page (`slack_oauth_failed` or `linear_oauth_failed`), not on a blank Configuração.
- `GET /setup` forwards every query parameter, not only `installation_id`.
- A created API key or webhook secret is shown once inside the app and never put on a redirect URL.
- An install that still uses the old GitHub Setup URL `https://api.standcast.app/setup` keeps working because that URL 302s and keeps the query string.

---

### Task 1: API `/setup` redirects to the app

**Files:**
- Modify: `apps/api/src/routes/web.tsx` (`GET /setup`, `resyncOnPending`)
- Test: `apps/api/test/web.test.ts`

**Interfaces:**
- Consumes: `deps.env.appUrl`, existing `getSetupStatus`, `RESYNC_CODES`, `ErrorPage` for `installation_pending`.
- Produces: `GET /setup` response behavior below. Later tasks must not render `setupPage`.

- [ ] **Step 1: Write the failing tests** in `apps/api/test/web.test.ts`

Assertions:
- No session, `GET /setup?installation_id=42&from=github` returns 302 `Location: ${APP_URL}/setup?installation_id=42&from=github`. No `Set-Cookie`.
- Session present and `getSetupStatus` succeeds: 302 to `${APP_URL}/setup?installation_id=${id}` with the original query. The body is not HTML.
- Session present, `getSetupStatus` throws `installation_pending`, query has no `resynced`: 302 to `/auth/github/login?next=` the same `/setup` path with `resynced=1` added. Do not send this response to `APP_URL`.
- Same pending error with `resynced=1` already set: the existing localized pending HTML page, not a redirect to the app.
- `GET /setup` with no query: 302 to `${APP_URL}/setup`.

- [ ] **Step 2: Run the new tests**

Run: `bun test apps/api/test/web.test.ts`
Expected: FAIL on the assertions that still expect HTML from `GET /setup`.

- [ ] **Step 3: Change `GET /setup`**

Keep `resyncOnPending` for the pending codes. On success, and when there is no session, `c.redirect(`${deps.env.appUrl}/setup${search}`)` where `search` is the raw query string including `?` when present. Do not call `setupPage` from `GET /setup`.

- [ ] **Step 4: Run `bun test apps/api/test/web.test.ts`**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(api): redirect /setup to the web app"
```

### Task 2: The app keeps a missing installation instead of going home

**Files:**
- Modify: `apps/web/src/router.tsx` (`setupRoute`)
- Modify: `apps/web/src/i18n/en.ts` and `apps/web/src/i18n/pt-BR.ts`
- Test: `apps/web` router or page test next to `configuracao.test.tsx` (new `setup-route.test.tsx` if none exists)

**Interfaces:**
- Consumes: Task 1's redirect to `/setup?installation_id=`.
- Produces: search `{ installation_id?: number; resynced?: '1' }`. `connected` is added in Task 3.

- [ ] **Step 1: Write the failing test**

Assertions:
- `/setup?installation_id=42` with a session that lists 42 redirects to `/orgs/42/configuracao`.
- `/setup?installation_id=777` with a session that does not list 777, and no `resynced`, redirects to the sign-in URL whose `next` is `/setup?installation_id=777&resynced=1`.
- The same URL with `resynced=1` renders a pending page. It does not redirect to `/` and it does not call `signInUrl` again.
- Copy keys exist in both languages: title and body for that pending page, plus a refresh link back to `/setup?installation_id=777&resynced=1`.

- [ ] **Step 2: Run the test**

Run: `bun test apps/web/src/setup-route.test.tsx` (or the file you added)
Expected: FAIL.

- [ ] **Step 3: Implement the branch in `setupRoute.beforeLoad`**

Load the session before redirecting to Configuração. Missing installation and no `resynced`: `redirectToSignIn`. Missing installation and `resynced=1`: render the pending page. Present installation: today's redirect to Configuração, dropping `resynced` from the next URL.

- [ ] **Step 4: Run the test**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(web): hold a new installation on /setup instead of the home page"
```

### Task 3: Slack and Linear land on Configuração

**Files:**
- Modify: `apps/api/src/routes/web.tsx` (`/oauth/slack/callback`, `/oauth/linear/callback`)
- Modify: `apps/web/src/router.tsx` (`configuracaoRoute` search)
- Modify: `apps/web/src/pages/configuracao/` and both i18n files
- Test: `apps/api/test/web.test.ts`, `apps/web/src/pages/configuracao/configuracao.test.tsx`

**Interfaces:**
- Consumes: `completeSlackConnect` and `completeLinearConnect` return `{ installationId }`.
- Produces: query `connected: 'slack' | 'linear'` on `/orgs/$installationId/configuracao`.

- [ ] **Step 1: Write the failing tests**

API:
- Slack success redirects to `${APP_URL}/orgs/${id}/configuracao?connected=slack`, not to `/setup`.
- Linear success redirects to `${APP_URL}/orgs/${id}/configuracao?connected=linear`.
- Slack or Linear `error` query, or a thrown `slack_oauth_failed` / `linear_oauth_failed`, still renders the API error page. `Location` does not start with `APP_URL`.

App:
- `?connected=slack` shows the English and Portuguese notice that Slack is connected.
- `?connected=linear` shows the Linear notice.
- No `connected` param shows neither notice.
- The notice text is not a secret and is not the OAuth `code`.

- [ ] **Step 2: Run**

Run: `bun test apps/api/test/web.test.ts apps/web/src/pages/configuracao/configuracao.test.tsx`
Expected: FAIL on the new redirects and notices.

- [ ] **Step 3: Implement the two redirects and the notice**

On success only, redirect to the app URL above. Leave the existing `ErrorPage` path unchanged. In Configuração, read `connected` from the route search and render one paragraph. Add `setup.connected.slack` and `setup.connected.linear` to both i18n files.

- [ ] **Step 4: Run the same test command**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: send Slack and Linear connect back to Configuração"
```

### Task 4: Remove the server-rendered setup

**Files:**
- Modify: `apps/api/src/routes/web.tsx` (delete `POST /setup/api-keys`, `POST /setup/api-keys/:id/revoke`, `POST /setup/webhooks`, `POST /setup/webhooks/:id/disable`, `POST /setup/webhooks/:id/test`, `POST /setup/google-chat`, `setupPage`, and `flashAndRedirect` if nothing else uses them)
- Delete the setup page component under `apps/api/src/web/` only if no remaining route renders it. Keep `apps/api/src/web/error.tsx`.
- Modify: `apps/api/test/web.test.ts` and `apps/api/test/ui.test.tsx` (drop assertions that `GET /setup` or those POSTs return setup HTML)
- Modify: `docs/deploy.md` external settings checklist, the GitHub App setup URL row, to `APP_URL/setup` (`https://app.standcast.app/setup`)
- Modify: `docs/site/changelog.md` and `docs/site/pt-BR/changelog.md` Unreleased

**Interfaces:**
- Consumes: Tasks 1–3. `/v1/app` API key, webhook, and Google Chat routes stay.
- Produces: no HTML setup page. `GET /connect/slack` and `GET /connect/linear` still start OAuth.

- [ ] **Step 1: Delete the setup HTML tests that can no longer pass, and add one assertion that `POST /setup/api-keys` is 404.**

- [ ] **Step 2: Run `bun test apps/api/test/web.test.ts apps/api/test/ui.test.tsx`**

Expected: FAIL only where the route still exists and returns HTML, or PASS if the assertion is the new 404 and the route is still mounted. Fix toward 404.

- [ ] **Step 3: Remove the setup page routes and unused flash helpers.**

Do not remove `/auth/github/login`, `/auth/github/callback`, `/logout`, `/install.sh`, `/connect/slack`, `/connect/linear`, or the OAuth callbacks from Task 3. Do not remove `ErrorPage`.

- [ ] **Step 4: Docs**

In `docs/deploy.md`, set the GitHub App Setup URL row to `https://app.standcast.app/setup`. Note that `https://api.standcast.app/setup` keeps working as a redirect until that GitHub setting is changed, and the change is manual after this deploys. Add one Unreleased line in both changelogs: setup lives in the web app; the API `/setup` redirects there.

- [ ] **Step 5: Run `bun test apps/api/test/web.test.ts apps/api/test/ui.test.tsx`, `bun run lint`, and `bun run typecheck`**

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(api): remove the server-rendered setup page"
```

## Self-review

- Spec "GET /setup redirects with the query string" is Task 1. The pending-install case is Task 2 because the current app route would drop it; the spec's silence there would send a new install to the empty home.
- Spec "OAuth callbacks go to the app" is Task 3, success only. Failures stay on the API, which the spec names.
- Spec "remove server-rendered setup" is Task 4. One-time secrets stay in the app's existing `OneTimeSecret` and are not part of the redirect.
- Spec runbook (change the GitHub Setup URL after deploy) is the `docs/deploy.md` step in Task 4, not a code change to GitHub.
- Use-case paths in this plan are `packages/orchestrator/src/modules/`, not the old `use-cases/` folder.
