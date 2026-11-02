# Phase 2: the Standcast web app

## Why

Today the only web pages are the setup and error pages, server-rendered by the API at `api-standcast.usefachada.dev/setup`. Managers read the team through the Slack digest, one message per day, so continuity is lost: a blocker that drags for three days looks new every morning, and "what did we ship last week?" means scrolling Slack.

Felipe's goal for a manager opening the app (2026-11-01): see what was done, the blockers and what people will do today, to get an overview and align with the team. Felipe agreed with this framing: the app exists to **unblock the team and keep its memory**, never to check who worked more.

## What it is

A React single-page app on its own subdomain (`app-standcast.usefachada.dev`, later `app.standcast.app`). It replaces the server-rendered setup, adds the manager views, and hosts personal settings. The API goes back to being API, OAuth, webhooks and `install.sh`.

Visual reference: **"Standcast — Painel v2"** (https://claude.ai/artifact/93d8s2jb5YttKrMVwP6QwX), with the screens Hoje, Histórico and Configuração. It refines the first prototype (https://claude.ai/artifact/Fq5pXiRmM9i7KqpH5t8Hjt), whose logo and scroll behavior it keeps on Felipe's request: white sidebar, sticky at full height from 900px, only the content scrolls. Follow it in spirit, not pixel by pixel. A summary of the first prototype lives in the appendix.

## Goals

- A manager sees, in one screen, today's team: who sent, open blockers with their age, open support requests, and each person's daily.
- A manager can look back: past digests, a searchable timeline, and a weekly "what we shipped" list to copy as markdown.
- Admins do everything the setup page does today, in the app.
- Each person manages their own settings, including the email digest.

## Non-goals (phase 2)

- Editing `standcast.yml` by opening pull requests from the app. The GitHub App has `contents: read`; adding write permissions forces every organization to re-approve. The app links to the GitHub editor, as the setup page does today.
- Server-side rendering, SEO, a public marketing area (the landing covers that).
- Remote MCP over HTTP.

## Anti-goals

- Per-person metrics of any kind: participation or punctuality rates, "on time %", commit or PR counts per person, rankings, comparisons, "who blocks most". The prototype's "88% no horário" tile, the per-day "Não enviaram" history and the "3 commits em…" style counts are dropped.
- History of who did not send. "Who has not sent" exists only for **today**, as a nudge, exactly like the digest.
- Anything that shows a person's private suggestions to anyone else.

## Build order (each part ships on its own)

1. **2a. Foundation and setup migration.** App shell, auth, org switcher, the setup screens (connections, config status, teams, failed deliveries, API keys, webhooks), redirect of the old `/setup`.
2. **2a+. Draft from AI sessions (Felipe, 2026-11-01).** The `/daily` skill, MCP and CLI read the person's local Claude Code sessions (`~/.claude/projects/*.jsonl`) since the last workday and cross-reference them with the server draft: session → repository and git branch → pull request (by head branch) → Linear card (identifier in the branch name, PR title or body, or the link Linear adds to the PR). The draft then shows one item per piece of work ("Login simplificado (FEL-12, site#2914): opened the PR and adjusted the CPF and Pix flow"), with sessions that match no PR or card grouped by project. Everything runs on the person's machine: sessions never leave it, and only the daily text the person confirms reaches the server. Later: readers for Cursor and Codex sessions. Gets its own short spec and plan; touches no web app code.
3. **2b. Today.** The team's day, blocker lifecycle, support requests, "remind now".
4. **2c. History.** Past digests, timeline with search, weekly shipped list, copy and export.
5. **2d. Personal settings and email digest.** The approved email digest spec (`docs/superpowers/specs/2026-11-01-email-digest-design.md`) ships here; its setup "Email" section becomes a settings screen.
6. **2e. Billing.** Per active person per month, only after the public beta ends (see the pricing decision in memory; out of scope for the first plans).

Support requests (`docs/superpowers/specs/2026-11-01-support-requests-design.md`) and the emoji labels are already built on `feat/support-requests` and merge before or with 2b.

## Decisions

**Felipe's calls (2026-11-01):** React front on its own subdomain; setup leaves the API subdomain; dashboard and settings live in the app; email digest belongs to phase 2; follow the panel design loosely; manager view = done, blockers, today, for alignment; Claude's proposed manager areas (needs me now, the team's day, memory, dependencies) accepted; no per-person metrics.

**Claude's calls:**

### Stack and hosting

- New workspace `apps/web`: Vite, React 19, TypeScript, TanStack Router (file routes), TanStack Query, Tailwind CSS v4, shadcn/ui components (Radix) copied into the repo, as the original spec planned for phase 2. Next.js is not used: the app is fully authenticated, needs no SSR, and a static build deploys the same way as the landing and docs.
- Deployed as a Cloudflare Worker with static assets (`apps/web/wrangler.jsonc`, SPA fallback to `index.html`), custom domain `app-standcast.usefachada.dev`. CSP without inline scripts; `connect-src` limited to the API origin.
- Copy in pt-BR and en, chosen from the browser and switchable; strings live in the app, product tone of the existing i18n.

### Auth and API access

- Sign-in stays on the API: the app sends the browser to `GET /auth/github/login?next=<app path>` (the existing `next` parameter, validated by `completeWebLogin` as today); after the OAuth callback the API sets its existing session cookie (host-only on the API domain, `HttpOnly`, `Secure`, `SameSite=Lax`) and redirects to `APP_URL + next` when the login started from the app. `next` must be a relative path; anything else falls back to `/`.
- **Sessions and orgs.** `GET /v1/app/session` returns the person (login, avatar), the CSRF token and the installations linked to them (`listMemberInstallations`, as the setup page's org select does today). The role is computed per request and per installation with the existing checks: membership with `MembershipCheck`, admin with `isInstallationAdmin`, managed teams with the manager rules of `list-managed`/`readable-teams`, all behind their existing TTL caches. Nothing new is stored. `GET /v1/app/orgs/:installationId/context` returns `{ admin, managerOf, memberOf }`.
- **One-time secrets.** Creating an API key or a webhook returns the secret once in the POST response; the SPA keeps it in memory and shows it with "copy it now, it will not be shown again". A refresh loses it, which is accepted. The sealed flash cookie stays only for the server-rendered pages until they are removed.
- **Local development.** The Vite dev server proxies `/v1`, `/auth` and `/oauth` to the local API, so the app and the API share an origin in development and the cookie works over http (the API already relaxes `Secure` outside production; keep that). Component and use-case tests run in CI; one end-to-end smoke test (Playwright) runs against the local API with a session created directly in the test database, without real GitHub OAuth.
- App and API are same-site (both under `usefachada.dev`, later both under `standcast.app`), so `fetch(..., { credentials: 'include' })` carries the cookie. The API answers CORS only for `APP_URL` with credentials.
- State-changing requests from the app require the existing CSRF token (`csrfToken`), returned by `GET /v1/app/session` and sent in an `X-Standcast-CSRF` header, plus an `Origin` equal to `APP_URL`.
- New env var `APP_URL` on the api (https, no trailing slash; required, no default).
- A new route group `/v1/app/*`, session-cookie auth, internal (not in the public OpenAPI document, like `/v1/draft`). Routes stay thin and call use cases. Existing use cases are reused wherever they exist (`getSetupStatus`, API key and webhook use cases, `listOrgDailies`, `listOrgBlockers`, `listOrgDigests`, manager visibility rules from `readable-teams`/`list-managed`).

### Who sees what

- **Admin** (installation admin, as today): everything, including connections, API keys, webhooks, failed deliveries.
- **Manager** of a team (listed in `managers`): Today and History for their teams.
- **Member**: their own teams' Today and History read-only (the digest is already visible to the team in Slack), their own settings.
- **Configuração by role (2a):** it shows exactly what `getSetupStatus` shows that person today, no more and no less: every member of the installation sees connections, config status, teams and failed deliveries as on the current setup page; API keys and webhooks appear only when `manage: true` (admins); connect and reconnect buttons only for admins, with the current "only an admin can…" notes otherwise. A person who is not a member of the installation gets the current forbidden state.
- Visibility rules are the existing ones used by the manager MCP tools; the app does not invent new ones.

### Screens

Navigation follows the prototype: left sidebar with the Standcast mark, org name and org switcher (the prototype had none; Standcast supports several installations), items **Hoje / Histórico / Configuração**, a team switcher with "sent/total" for today, and at the bottom the person's avatar menu (settings, docs, sign out).

**Hoje (2b)**
- Header: team, timezone, date; reminder time and digest status ("Consolidado enviado às 10:00" / scheduled).
- "Precisa de você": open blockers with age ("há 3 dias"), recurring flag when the same ref or text came back on consecutive dailies, the routed recipients and reason, and a "provavelmente resolvido" hint when the ref's pull request was merged or its card done. Actions: "Marcar como resolvido" / "Reabrir" (manager or the author).
- "Pedidos de apoio": today's support requests with who asked.
- "Quem já enviou · N de M" with Todos / Enviaram / Faltam, for today only. "Lembrar agora" on a missing person sends the regular reminder through the existing reminder use case and its one-per-day rule.
- "Dailies": one card per person with yesterday, today, blockers and support, a drawer with the full daily and a link to the Slack thread.
- **Blocker state** is new: a `blocker_states` record keyed by installation and blocker identity (ref URL, else normalized text plus author), with `opened_on`, `last_seen_on`, `resolved_at`, `resolved_by`. Submitting a daily upserts it; the age and the recurring flag come from it. It never stores counts per person.

**Histórico (2c)**
- Past digests list by day (team counts of dailies and blockers only), with the selected day's full digest and "Abrir no Slack". No "who did not send" for past days.
- Timeline: search dailies of the team by text, ref or card id, filtered by date range.
- "Entregas da semana": pull requests merged and cards done that appear in the team's confirmed dailies, grouped by day, with "Copiar como markdown" and export (Markdown, CSV) for a date range.
- The prototype's trend tiles are replaced by this list.

**Configuração (2a)**
- The setup content, regrouped: connections (GitHub installation, Slack, Linear), `standcast.yml` status with errors and "Editar no GitHub", teams (with the channel notices), failed deliveries (admins), API keys and webhooks (admins).
- The install flow: the GitHub App Setup URL points to `APP_URL/setup?installation_id=…`, which links the installation and lands on Configuração.

**Configurações pessoais (2d)**
- Language, email digest on/off and status, sign out of all sessions.

### Setup migration (2a)

- **Sequence.** PR 1 adds `apps/web` and `/v1/app/*`; the API's `/setup` keeps working unchanged, and the app is deployed and tested at its domain. PR 2 switches over: `/setup` redirects, the OAuth callbacks go to the app, the server-rendered setup pages are removed; right after it deploys, Felipe changes the GitHub App Setup URL. Because the redirect keeps the query string, an install that happens before the Setup URL change still lands in the app with its `installation_id`. No feature flag.
- `GET /setup` on the API redirects (302) to `APP_URL/setup` with the same query string. OAuth callbacks for Slack and Linear redirect to the app's Configuração with a flash code in the query instead of rendering pages. The server-rendered setup pages and their tests are removed once the app ships; the browser error pages stay for OAuth failures that cannot reach the app.
- Runbook: the GitHub App Setup URL changes to `APP_URL/setup`; add the row to the external settings checklist in `docs/deploy.md`.

### Design

- Tokens from the panel: background `#F5F6F8`, surface `#FFFFFF`, border `#D9DCE3`, text `#15171C`, muted `#4A5060`, accent `#3B4BC8` (hover `#26318A`), warning `#B4410E`; success, danger and amber states from the setup redesign. Inter for UI, JetBrains Mono for logins, refs and times, the Saira wordmark. Cards 12px radius, 1px border, no shadow; buttons and inputs 8px; pills 999px.
- **Light and dark themes (Felipe, 2026-11-01).** A toggle in the sidebar switches them; the first visit follows `prefers-color-scheme`, and the choice is remembered in the browser. Colors are CSS variables with a light and a dark set, as in the Painel v2 design (dark: background `#0E1016`, surface `#161922`, text `#E8EAF0`, muted `#A3A9B8`, links `#9AA5F5`, filled accent `#4F5BD5`); both sets keep WCAG AA contrast.
- All copy says Standcast. Accessible: keyboard navigation, visible focus ring, WCAG AA contrast, 44px touch targets on mobile, the sidebar collapses below 900px.

## Left to the builder

Component breakdown, exact routes, query keys, table and migration names, test structure (unit tests for use cases, component tests for screens, one end-to-end smoke of sign-in → Configuração), copy wording.

## Appendix: prototype summary

Hoje: header with team, timezone and digest badge; "Quem já enviou" chips with filter; blockers list with kind pill, author, routed recipients and resolve button; dailies cards with drawer. Histórico: trend tiles (dropped here), digest list and detail. Configuração: config validity, team form that opened a PR (dropped here), connections, failed deliveries. Missing in the prototype and taken from the setup redesign: API keys, webhooks, docs link, sign out, org switcher, support requests.
