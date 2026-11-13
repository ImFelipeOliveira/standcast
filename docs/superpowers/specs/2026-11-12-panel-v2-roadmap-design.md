# Panel v2, landing v2 and brand kit: roadmap

## Why

The web panel (`apps/web`) has Hoje and Configuração, but no sign-in screen, no history, no blocker view and a look that reads as generated. Felipe asked (2026-11-12) for a complete panel, a decent GitHub sign-in, WCAG 2.2 AA everywhere, English URLs, a new landing with a calm pixel animation, new marketplace and README images, and better docs.

The product principle from the phase 2 spec still holds: the panel exists to unblock the team and keep its memory, never to measure people.

## Visual references (approved in conversation)

- Panel: "Standcast — Painel v2", https://claude.ai/artifact/93d8s2jb5YttKrMVwP6QwX
- Landing: "Standcast — Landing v2", https://claude.ai/artifact/UQmkYYbA7cvQ8hWSVnZkU2
- Images: "Standcast — Brand kit", https://claude.ai/artifact/KongL9qbP2W1JLd8x6ufCu

Follow them in spirit; exact values that matter are copied below.

## Decisions

**Felipe's calls (2026-11-12):**
- Sign-in is GitHub only, on its own page in the app; the app never jumps straight to GitHub on a 401.
- A failed sign-in shows a toast on the sign-in page, not an error page.
- URLs, pages and query parameters are in English.
- Headers are sticky and shrink a little on scroll.
- The "open in chat" button names the team's provider (Slack, Google Chat, later Teams), never "Slack" by default.
- WCAG 2.2 AA in the panel, landing and docs; fewer borders, colors that do not read as AI-made.
- New panel features: Blockers page, People and links, first steps, webhook delivery log, stale blocker alert, global search, a dynamic `standcast.yml` editor whose output and warnings follow the chosen chat and tracker.
- Microsoft Teams waits. Google Chat linking should need as little manual mapping as possible.
- The landing keeps an animated background, pixel based, no wave, safe for photosensitive people, plus light motion.

**Claude's calls:**
- Keep Standcast's own brand (bar mark, Saira wordmark, indigo `#3B4BC8`), not the organization's default design system.
- Error codes in the URL are API codes: `access_denied`, `invalid_state`, `unauthorized`, `sign_in_did_not_stick`, `generic`.
- Old app URLs redirect: `/orgs/:id/hoje` → `/today`, `/historico` → `/history`, `/configuracao` → `/settings`, keeping the query string. `/signed-out` → `/sign-in?signed_out=1`.
- Settings becomes tabs with their own routes: `/settings`, `/settings/people`, `/settings/config`, `/settings/api`. Personal settings live at `/account`.
- Stale blocker alert is a new per team field, `signals.blocker_alert_days` (positive integer, optional; absent means off), sent once per blocker to the team's managers in the team chat.
- The yml editor validates in the browser with `parseConfig` from `@standcast/core`; the app never writes to the repository (the GitHub App keeps `contents: read`).

## Palette (measured, both themes)

Light: bg `#F4F4F5`, surface `#FFFFFF`, hover `#EBEBED`, text `#18181B`, text2 `#3F3F46`, muted `#5B5B66`, divider `#E7E7EA`, control border `#8A8A96`, ink (primary button) `#18181B`, accent `#3B4BC8`, accent text `#3446C2`, amber `#9A4A00`, red `#B42318`, green `#11703F`.

Dark: bg `#0E0E10`, surface `#18181B`, hover `#26262B`, text `#EDEDEF`, text2 `#C9C9CF`, muted `#A1A1AA`, divider `#2A2A30`, control border `#6E6E78`, ink `#EDEDEF`, accent `#8E9AF5`, accent text `#A5AFF7`, amber `#F0B35B`, red `#F5958C`, green `#5FCF95`.

Rules: text ≥ 4.5:1, control borders and focus ≥ 3:1 (1.4.11), states as a colored dot plus text (no pastel fills), cards without borders, primary action in ink, indigo only for links, focus and the mark. Docs dark brand color `#8B98F0`.

## Pull requests, in order

Each PR goes to `dev`, carries its own plan in `docs/superpowers/plans/`, and ships on its own. Web deploys before API whenever the API starts redirecting to new app routes.

| # | PR | Depends on | Done when |
|---|----|-----------|-----------|
| 1 | Sign-in page, toast errors, English routes, favicon | — | A 401 lands on `/sign-in`; every OAuth failure returns to `/sign-in?error=` with a toast; old URLs redirect; favicon served. Plan: `2026-11-12-standcast-13-sign-in.md` |
| 2 | Panel foundation: WCAG palette, borderless cards, dot badges, sticky shrinking header, mobile drawer | 1 | Every existing screen uses the new tokens; header shrinks 64→52px after 32px of scroll and grows back near the top; contrast test passes for every token pair |
| 3 | Blockers page (`/orgs/:id/blockers`), open and resolved, team filter, nav count | 2 | Managers see open blockers of their teams oldest first with age and routing, resolve and reopen; members see their teams read only |
| 4 | History (`/orgs/:id/history?tab=digests|search|shipped`) and chat links | 2 | Digest list and detail; search by text, ref or card in a date range; weekly shipped list with copy as Markdown and CSV/Markdown export; "Open in Slack/Google Chat" built from `deliveries.ref`, hidden when there is no link |
| 5 | Settings tabs, People and links, webhook delivery log | 2 | People tab lists each config member with chat link (and its source), tracker identity and CLI session; webhook tab lists the last 7 days of deliveries with redeliver |
| 6 | `standcast.yml` editor and `signals.blocker_alert_days` in the schema | 5 | Editor output equals what `parseConfig` accepts; warnings follow chat and tracker; Teams option disabled "coming soon" |
| 7 | Stale blocker alert (worker) | 6 | One chat message per blocker to managers once its age passes the team's limit; never repeated; nothing sent when the field is absent |
| 8 | First steps and ⌘K search | 4 | New orgs see a five-step checklist instead of Today until the first digest; ⌘K searches screens, refs and dailies the person can read |
| 9 | Account page (`/account`) | 2 | Language, theme, sign out of every panel session (CLI sessions untouched) |
| 10 | Google Chat one-click link | — | Reminder card button "Link my account" links the clicker by email; People tab reflects it |
| 11 | Landing v2 (pt-BR and en) | — | New sections from the landing artifact; 2D canvas pixel field with pause button, reduced-motion still frame, offscreen pause, ≤ 30 fps; Lighthouse accessibility 100 |
| 12 | Brand assets and README | — | SVG sources in `docs/marketplace/brand/`, rendered PNGs at the sizes in the brand kit, README with `<picture>` light/dark banner and at most four badges, marketplace copy updated |
| 13 | Docs v2 (VitePress) | 12 | Dark brand token, underlined links, visible focus, sidebar Getting started / Members / Admin / API / Reference, code groups, local search, edit link, last updated, per page OG image |
| 14 | Accessibility checks in CI | 2, 11, 13 | axe runs on the panel e2e pages, the landing and a docs sample; serious or critical violations fail CI |

PRs 10 to 14 do not touch the panel and can run in parallel worktrees.

## Anti-goals (unchanged)

Per person metrics, rankings, punctuality or participation rates, history of who did not send, and anything that shows a person's private suggestions to someone else.

## Left to each PR's plan

Component breakdown, query keys, migration names, exact copy beyond what is fixed here.
