# Web App Foundation and Configuração (Phase 2a, PR 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Standcast web app at `app-standcast.usefachada.dev` with sign-in, org switcher, light/dark theme and a Configuração screen that does everything the API's server-rendered `/setup` does today, while `/setup` keeps working unchanged.

**Architecture:** A new Vite + React SPA in `apps/web`, deployed as a Cloudflare Worker with static assets. It talks to the API through a new session-cookie route group `/v1/app/*` (CORS for `APP_URL`, CSRF header on writes) whose thin routes call the existing use cases (`getSetupStatus`, API key and webhook use cases, `listMemberInstallations`, `isInstallationAdmin`, `readableTeams`). Sign-in reuses the API's GitHub web login; a new `target=app` flag sends the browser back to the app.

**Tech Stack:** Bun 1.4.4, TypeScript, Hono (API), React 19, Vite 6, TanStack Router (code-based routes) and TanStack Query 5, Tailwind CSS 4 (`@tailwindcss/vite`), shadcn/ui components (Radix) copied into `apps/web/src/components/ui`, Playwright for one smoke test, Wrangler for deploy. Pick the latest stable versions published at least two weeks ago and pin them exactly in `package.json`.

**Spec:** `docs/superpowers/specs/2026-11-01-phase-2-web-app-design.md` (parts "Stack and hosting", "Auth and API access", "Who sees what", "Configuração (2a)", "Setup migration" sequence PR 1, "Design"). Visual: "Standcast — Painel v2", https://claude.ai/artifact/93d8s2jb5YttKrMVwP6QwX, artboards `Configuracao.dc.html` (screen) and the sidebar shared by all three. The controller saves a copy of the three artboards to `apps/web/design/` before Task 5; it is reference only and is deleted at the end of Task 7.

## Global Constraints

- No comments in any code file: TS, TSX, CSS, HTML, JS, shell, YAML, JSONC.
- Commits, identifiers and engineering docs in English. All app copy in pt-BR and en (`apps/web/src/i18n/`), product tone of `packages/core/src/i18n.ts`.
- Business rules stay in use cases (`packages/orchestrator/src/use-cases`) and throw `DomainError(code, message)`; `/v1/app/*` routes are thin.
- `/setup`, `/connect/*`, `/oauth/*` and the server-rendered pages keep working exactly as today (PR 2 switches them over; not in this plan).
- Anti-surveillance: the app shows no per-person metric, rate, ranking or history of who did not send.
- A package imports only what its own `package.json` declares (`bun run check-deps`). `apps/web` imports server packages only with `import type`.
- Dependency versions are pinned exactly (no `^`/`~`). CI actions stay pinned by commit sha (`bun run check-pins`).
- Colors only through the CSS variables of Task 4 (light and dark sets); WCAG AA contrast in both themes; visible focus ring `2px solid var(--accent)` offset 2px; touch targets ≥ 44px below 900px.
- URLs: API `https://api-standcast.usefachada.dev`, app `https://app-standcast.usefachada.dev`, docs `https://docs-standcast.usefachada.dev`.
- Every task ends green on `bun test` (with `TEST_DATABASE_URL`), `bun run lint`, `bun run typecheck`, `bun run check-deps`.

## Review Focus

1. A write from another origin with a valid cookie is rejected: `POST /v1/app/orgs/:id/api-keys` with `Origin: https://evil.test` or without `X-Standcast-CSRF` returns 403 `forbidden` (Task 2 test `rejects cross-origin writes`).
2. A member of org A cannot read or act on org B by changing the id in the URL: `GET /v1/app/orgs/<B>/setup` returns 403 (Task 3 test `other installation is forbidden`).
3. `next` that is absolute or protocol-relative (`https://evil.test`, `//evil.test`) never leaves the app domain after login with `target=app` (Task 1 test `app target keeps next relative`).
4. A refresh after creating an API key shows the key list without the secret and never re-reveals it (Task 6 test `secret is not persisted`).
5. A person with no installations, or whose session expired mid-use, lands on a clear state instead of a blank page: 401 from any `/v1/app` call redirects to sign-in; zero installations shows the install call to action (Task 5 tests `401 redirects to sign-in` and `no installations`).

---

### Task 1: API login can return to the app

**Files:**
- Modify: `apps/api/src/env.ts` (new `APP_URL`), `packages/orchestrator/src/deps.ts` (env type gains `appUrl`), `apps/api/src/main.ts` (wire it)
- Modify: `packages/orchestrator/src/use-cases/start-web-login.ts`, `packages/orchestrator/src/use-cases/complete-web-login.ts`, `apps/api/src/routes/web.tsx` (`/auth/github/login`, `/auth/github/callback`)
- Test: `packages/orchestrator/test/use-cases/web-login.test.ts` (or the existing web login test file), `apps/api/test/web-login.test.ts` (or the existing one)

**Interfaces:**
- Produces: `startWebLogin(deps, { next?: string; target?: 'app' })`; `completeWebLogin(...)` returns `{ token: string; next: string; target: 'api' | 'app' }`; env `appUrl: string` (https, no trailing slash, default `https://app.standcast.app`).

- [ ] **Step 1: Write the failing tests**
  - `app target redirects to APP_URL`: `GET /auth/github/login?next=/setup%3Finstallation_id%3D42&target=app` then the callback redirects to `https://app.test/setup?installation_id=42` (test env `APP_URL=https://app.test`).
  - `app target keeps next relative`: with `target=app` and `next` in `https://evil.test`, `//evil.test`, `/\\evil.test`, the callback redirects to `https://app.test/`.
  - `no target keeps today's behavior`: without `target`, the callback redirects to the relative `next` on the API as today.
  - `APP_URL must be https without trailing slash`: `parseEnv` rejects `http://x` and `https://x/`, and accepts `http://localhost:4173` (the only http form allowed, for local development and the smoke test).
- [ ] **Step 2: Run them and see them fail**
  Run: `bun test packages/orchestrator/test apps/api/test -t "app target|APP_URL|no target"` → FAIL.
- [ ] **Step 3: Implement**
  Store `target` in the existing login state next to `next` (only the literal `'app'` is accepted; anything else is `'api'`). The callback route builds `${env.appUrl}${next}` when `target === 'app'`, else `next`. `APP_URL` uses the same zod rules as `LANDING_URL`, except that `http://localhost` with an optional port is also accepted.
- [ ] **Step 4: Run the tests and see them pass**, then the full checks of the Global Constraints.
- [ ] **Step 5: Commit** `feat(api): web login can return to the app`

### Task 2: `/v1/app` session, CORS and CSRF

**Files:**
- Create: `apps/api/src/middleware/web-session.ts`, `apps/api/src/routes/app.ts`
- Modify: `apps/api/src/app.ts` (mount `appRoutes` before `webRoutes`)
- Test: `apps/api/test/app-session.test.ts`

**Interfaces:**
- Consumes: the web session cookie and `resolveSession(db, token, 'web')` already used by `webRoutes`; `csrfToken`, `verifyCsrf`; `logoutWebSession`; `listMemberInstallations`.
- Produces:
  - `webSessionAuth(deps, getClientIp): MiddlewareHandler<WebSessionEnv>` with `WebSessionEnv = RateLimitEnv & { Variables: { member: MemberRow; sessionToken: string } }`. Rejects with `unauthorized` (401) when the cookie is missing or invalid (same failed-auth rate limit as `sessionAuth`). For `POST`, `PUT`, `PATCH`, `DELETE`: requires `Origin === env.appUrl` and a valid `X-Standcast-CSRF` header, else `forbidden` (403).
  - CORS on `/v1/app/*` only: `Access-Control-Allow-Origin: <APP_URL>` (exact), `Access-Control-Allow-Credentials: true`, allowed headers `Content-Type, X-Standcast-CSRF`, methods `GET, POST, OPTIONS`, `Vary: Origin`; no CORS headers for any other origin.
  - `GET /v1/app/session` → `200 { login: string; avatarUrl: string; csrf: string; installations: { id: number; owner: string }[] }` (installations sorted by owner case-insensitively; `avatarUrl` is `https://github.com/<login>.png?size=80`).
  - `POST /v1/app/logout` → `204`, deletes the session like `POST /logout` and clears the cookie.
  - JSON errors use the existing envelope `{ error: { code, message } }`.
- [ ] **Step 1: Write the failing tests**: `session returns person, csrf and sorted installations`; `missing cookie is 401`; `preflight from APP_URL is allowed`; `preflight from another origin gets no CORS headers`; `rejects cross-origin writes` (wrong `Origin` → 403; missing header → 403; valid → passes); `logout clears the session` (a later `GET /v1/app/session` is 401).
- [ ] **Step 2: Run** `bun test apps/api/test/app-session.test.ts` → FAIL.
- [ ] **Step 3: Implement** the middleware and the two routes. Read the cookie name and options from the constants `webRoutes` already uses (export them from one place instead of duplicating).
- [ ] **Step 4: Run** the test file and the Global Constraints checks → PASS.
- [ ] **Step 5: Commit** `feat(api): session, cors and csrf for the web app`

### Task 3: `/v1/app/orgs/:installationId/*` setup endpoints

**Files:**
- Modify: `apps/api/src/routes/app.ts`
- Create: `packages/orchestrator/src/use-cases/get-org-context.ts`
- Test: `apps/api/test/app-orgs.test.ts`, `packages/orchestrator/test/use-cases/get-org-context.test.ts`

**Interfaces:**
- Consumes: `createMembershipCheck(deps)`, `getSetupStatus`, `createInstallationApiKey`, `revokeInstallationApiKey`, `createWebhookEndpoint`, `disableWebhookEndpoint`, `sendTestEvent`, `isInstallationAdmin`, `readableTeams`, `teamsForMember` (core).
- Produces:
  - `getOrgContext(deps, isMember, member, installationId): Promise<{ admin: boolean; managerOf: string[]; memberOf: string[] }>` — throws `forbidden` when the person is not a member of the installation; `managerOf` = team names where the person is in `managers`, `memberOf` = team names that resolve the person as a member.
  - `GET  /v1/app/orgs/:installationId/context` → the object above.
  - `GET  /v1/app/orgs/:installationId/setup` → `SetupStatus` as JSON (exactly what `getSetupStatus` returns).
  - `POST /v1/app/orgs/:installationId/api-keys` body `{ name: string; scopes: ApiKeyScope[] }` → `201 { key: ApiKeySummary; secret: string }`.
  - `POST /v1/app/orgs/:installationId/api-keys/:keyId/revoke` → `204`.
  - `POST /v1/app/orgs/:installationId/webhooks` body as the current `createWebhookForm` (url and events) → `201 { endpoint: <the summary type used by WebhookOverview>; secret: string }`.
  - `POST /v1/app/orgs/:installationId/webhooks/:endpointId/disable` → `204`; `POST …/webhooks/:endpointId/test` → `202`.
  - Body validation with zod; invalid body → `422 invalid_request` with the issues.
- [ ] **Step 1: Write the failing tests**: `setup returns the same status as the page` (compare with a direct `getSetupStatus` call); `other installation is forbidden` (member of 11 asking for 12 → 403); `non-admin cannot create keys` (403, same rule as today); `create key returns the secret once` (201 with `secret`; a following `GET …/setup` lists the key without any secret field); `revoke, disable and test` happy paths; `context` for an admin, a manager-only person and a plain member.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (routes call the use cases with `isMember` and `c.get('member')`; no rule lives in the route). **Step 4: Run** → PASS plus full checks.
- [ ] **Step 5: Commit** `feat(api): setup endpoints for the web app`

### Task 4: `apps/web` workspace, theme and i18n

**Files:**
- Create: `apps/web/package.json` (name `@standcast/web`, scripts `dev`, `build`, `preview`, `test:e2e`), `apps/web/tsconfig.json` (extends base, `"jsxImportSource": "react"`, `"types": ["bun", "vite/client"]`), `apps/web/vite.config.ts`, `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/styles.css`, `apps/web/src/theme.ts`, `apps/web/src/i18n/index.ts`, `apps/web/src/i18n/pt-BR.ts`, `apps/web/src/i18n/en.ts`, `apps/web/wrangler.jsonc`, `apps/web/public/_headers`
- Modify: root `tsconfig.json` (exclude `apps/web`), root `package.json` scripts (`typecheck` runs both projects; `web:dev`, `web:build`), `biome.json` if it needs the new globs, `.gitignore` (`apps/web/dist`)
- Test: `apps/web/src/theme.test.ts`, `apps/web/src/i18n/i18n.test.ts`

**Interfaces:**
- Produces:
  - CSS variables in `styles.css` under `:root` (light) and `:root[data-theme="dark"]`, names and values copied from the Painel v2 artboards' `.theme` blocks (`--bg`, `--surface`, `--text`, `--text2`, `--muted`, `--border`, `--border-strong`, `--line`, `--track`, `--seg`, `--hover`, `--dashed`, `--accent`, `--accent-hover`, `--accent-text`, `--accent-ink`, `--accent-soft`, `--accent-soft2`, `--accent-soft3`, `--accent-line`, `--accent-wash`, `--ink`, `--warn*`, `--ok-*`, `--bad-*`, `--amber-*`, `--mark`), exposed to Tailwind with `@theme inline`. Fonts Inter, JetBrains Mono and Saira 700 self-hosted under `public/fonts` (as the landing does), not from Google.
  - `theme.ts`: `type Theme = 'light' | 'dark'`; `initialTheme(stored: string | null, prefersDark: boolean): Theme`; `applyTheme(theme: Theme): void` (sets `data-theme` on `<html>`, writes `localStorage['standcast.theme']` inside try/catch).
  - `i18n`: `type Lang = 'pt-BR' | 'en'`; `detectLang(navigatorLanguages: readonly string[], stored: string | null): Lang`; `useT(): (key: MessageKey, vars?: Record<string, string>) => string`; both dictionaries typed by the same `MessageKey` union so a missing key fails typecheck.
  - `vite.config.ts`: React plugin, `@tailwindcss/vite`, dev proxy of `/v1`, `/auth`, `/oauth`, `/connect`, `/setup` to `http://localhost:3000`; `build.outDir` `dist`.
  - `wrangler.jsonc`: name `standcast-web`, assets `./dist`, `not_found_handling: "single-page-application"`.
  - `public/_headers`: CSP `default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' https://github.com https://avatars.githubusercontent.com data:; connect-src 'self' https://api-standcast.usefachada.dev; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`, plus `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`; hashed assets `Cache-Control: public, max-age=31536000, immutable`.
- [ ] **Step 1: Write the failing tests**: `initialTheme` (stored wins; else `prefersDark`; invalid stored ignored); `applyTheme survives a throwing localStorage`; `detectLang` (`pt`/`pt-BR` → pt-BR, others → en, stored wins); `dictionaries have the same keys`.
- [ ] **Step 2: Run** `bun test apps/web` → FAIL. **Step 3: Implement** and install deps (`bun add --exact` in `apps/web`). **Step 4: Run** → PASS; `bun run web:build` produces `apps/web/dist/index.html`; full checks green.
- [ ] **Step 5: Commit** `feat(web): app workspace with theme, i18n and deploy config`

### Task 5: Shell, API client, auth guard and org switcher

**Files:**
- Create: `apps/web/src/api/client.ts`, `apps/web/src/api/queries.ts`, `apps/web/src/router.tsx`, `apps/web/src/shell/AppShell.tsx`, `apps/web/src/shell/Sidebar.tsx`, `apps/web/src/shell/OrgSelect.tsx`, `apps/web/src/shell/ThemeToggle.tsx`, `apps/web/src/shell/UserMenu.tsx`, `apps/web/src/pages/ComingSoon.tsx`, `apps/web/src/pages/NoInstallations.tsx`, `apps/web/src/components/ui/*` (shadcn: button, card, badge, input, label, select, dropdown-menu, dialog, table, alert, checkbox, separator)
- Test: `apps/web/src/api/client.test.ts`, `apps/web/src/shell/shell.test.tsx`

**Interfaces:**
- Consumes: Task 2 and 3 endpoints; Task 4 theme and i18n.
- Produces:
  - `apiUrl: string` from `import.meta.env.VITE_API_URL` (empty in dev so the proxy is used; `https://api-standcast.usefachada.dev` in the build).
  - `class ApiError extends Error { status: number; code: string }`.
  - `apiGet<T>(path: string): Promise<T>` and `apiPost<T>(path: string, body?: unknown): Promise<T>` with `credentials: 'include'`; `apiPost` sends `X-Standcast-CSRF` from the cached session; on 401 both call `redirectToSignIn(currentPathAndSearch)` which navigates to `${apiUrl}/auth/github/login?target=app&next=<encoded>`.
  - Query hooks: `useSession()`, `useOrgContext(installationId)`, `useSetupStatus(installationId)`; mutations in Task 6.
  - Routes (TanStack Router, code-based): `/` → redirects to `/orgs/$installationId/configuracao` for the first installation (or `NoInstallations`); `/setup` → reads `installation_id`, redirects to `/orgs/<id>/configuracao` (no id → `/`); `/orgs/$installationId/hoje` and `/orgs/$installationId/historico` → `ComingSoon`; `/orgs/$installationId/configuracao` → Task 6 screen.
  - Sidebar per Painel v2: v1 logo (three `var(--mark)` bars + "Standcast" in Saira 700 19px), theme toggle next to it, `OrgSelect` (changing it keeps the current section for the new org), nav Hoje / Histórico / Configuração with `aria-current="page"` on the active one (Hoje and Histórico show a small "em breve"/"soon" badge in 2a), `UserMenu` at the bottom (avatar, login, role label from `useOrgContext`, links Documentação → docs URL, Sair → `POST /v1/app/logout` then reload). Sticky full-height sidebar from 900px, stacked above content below.
- [ ] **Step 1: Write the failing tests** (render with `react-dom/server` `renderToStaticMarkup` and a stubbed `fetch`; no DOM library): `401 redirects to sign-in` (stubbed 401 → `redirectToSignIn` called with `/orgs/11/configuracao`); `post sends csrf and credentials`; `api error carries status and code`; `sidebar marks the active section`; `no installations` (session with `installations: []` renders the install call to action linking to the GitHub App install page `https://github.com/apps/standcast/installations/new`); `org select lists installations by owner`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS plus full checks.
- [ ] **Step 5: Commit** `feat(web): shell, api client, sign-in guard and org switcher`

### Task 6: Configuração screen

**Files:**
- Create: `apps/web/src/pages/configuracao/ConfiguracaoPage.tsx`, `Connections.tsx`, `ConfigFile.tsx`, `Teams.tsx`, `FailedDeliveries.tsx`, `ApiKeys.tsx`, `Webhooks.tsx`, `OneTimeSecret.tsx`, `labels.ts`
- Test: `apps/web/src/pages/configuracao/configuracao.test.tsx`

**Interfaces:**
- Consumes: `useSetupStatus`, `useOrgContext`, `apiPost`; `SetupStatus` via `import type` from `@standcast/orchestrator`.
- Produces: mutations `useCreateApiKey`, `useRevokeApiKey`, `useCreateWebhook`, `useDisableWebhook`, `useTestWebhook` that invalidate `useSetupStatus` on success.
- Content and rules (mirror the current setup page, `apps/api/src/web/setup*.tsx`, field by field; copy keys move to the app's dictionaries):
  - Connections cards GitHub / Slack / Linear with status pills; connect and reconnect are links to `${apiUrl}/connect/slack?installation_id=<id>` and `${apiUrl}/connect/linear?installation_id=<id>` (PR 1 keeps the OAuth return on the API's `/setup`); shown only to admins, otherwise the current "only an admin can…" notes.
  - `standcast.yml` card: status (configured / invalid with the error table and "keeps the last valid" note / unconfigured with the create-repo or create-file link), "Editar no GitHub" when `configFileUrl` exists.
  - Teams grid: channel, tracker, times, and each team's notices (`teamNotices`, including the channel notices) in the warning style of the design.
  - Failed deliveries: team failures and person failure groups as today, translated kinds and reasons.
  - API keys and webhooks only when `manage: true`: list, create (dialog with name and scope checkboxes; webhook url and events), revoke / disable / send test.
  - `OneTimeSecret`: shows the secret from the create response with a copy button and "Copie agora. Ela não aparece de novo." / "Copy it now. It will not be shown again."; held in component state only.
  - Support line with `supportEmail` as a `mailto:` link.
- [ ] **Step 1: Write the failing tests**: `member sees status but no keys or webhooks` (fixture `SetupStatus` with `manage: false`); `admin sees keys and webhooks`; `invalid config lists errors`; `channel notice renders on its team`; `secret is not persisted` (after create the secret renders; re-render from a fresh query cache shows the list and no secret); `failed delivery reason is translated`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**, following `Configuracao.dc.html` in spirit (cards 14px radius, 1px `var(--border)`, pills, tables in an `overflow-x: auto` box with min-width 620px). **Step 4: Run** → PASS plus full checks.
- [ ] **Step 5: Commit** `feat(web): configuração screen`

### Task 7: Smoke test, CI, deploy and docs

**Files:**
- Create: `apps/web/e2e/smoke.spec.ts`, `apps/web/playwright.config.ts`, `apps/web/e2e/seed.ts`
- Modify: `.github/workflows/ci.yml`, `docs/deploy.md`, `docs/site/changelog.md`, `docs/site/pt-BR/changelog.md`, `docs/api/CHANGELOG.md` (no public API change: one line saying the internal `/v1/app` routes exist is not needed; leave it unless a public route changed), `README.md` (one line linking the app)
- Delete: `apps/web/design/`

**Interfaces:**
- Consumes: everything above.
- [ ] **Step 1: Write the smoke test**: `seed.ts` creates in the test database an installation `acme` (configured, one team), a member and a web session row, and returns the session token; the test starts the API (`bun run apps/api/src/main.ts` on port 3000 with test env and `APP_URL=http://localhost:4173`) and `vite preview` on 4173 with `VITE_API_URL=` (proxy), sets the session cookie, opens `/setup?installation_id=<id>`, and asserts: URL becomes `/orgs/<id>/configuracao`, heading "Configuração" visible, team name visible, theme toggle switches `data-theme` to `dark`.
- [ ] **Step 2: Run** `bun run --cwd apps/web test:e2e` → PASS (install Chromium with `bunx playwright install chromium` once).
- [ ] **Step 3: CI**: in `.github/workflows/ci.yml` after `bun test`, add `bun run web:build` and the smoke test (Playwright Chromium install step pinned through the existing `bun` toolchain, no new third-party action unless pinned by sha).
- [ ] **Step 4: Docs**: `docs/deploy.md` gains `APP_URL` in the api variables table, a "Web app (Cloudflare Worker)" section (`npx wrangler deploy -c apps/web/wrangler.jsonc`, build with `VITE_API_URL=https://api-standcast.usefachada.dev`, custom domain `app-standcast.usefachada.dev`), and the external settings checklist notes that the GitHub App Setup URL changes only in PR 2. Changelogs (en, pt-BR) get an Unreleased line: the web app at `app-standcast.usefachada.dev` with Configuração; the old setup page still works.
- [ ] **Step 5: Run** all Global Constraints checks plus `bun run docs:build` and `bun run check-docs` → PASS.
- [ ] **Step 6: Commit** `test(web): smoke test, ci, deploy docs`

## After the plan (controller, not a task)

Open the PR `feat/web-app` → `dev`. After merge: Felipe sets `APP_URL=https://app-standcast.usefachada.dev` on the api in Railway; the controller deploys the Worker and adds the custom domain on Cloudflare; then smoke-test sign-in on production. PR 2 (redirect `/setup`, OAuth callbacks to the app, remove server-rendered setup, GitHub App Setup URL) gets its own plan.
