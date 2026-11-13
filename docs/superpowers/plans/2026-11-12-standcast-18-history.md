# History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A team's history in the panel: past digests by day with the full digest, search over confirmed dailies, the weekly shipped list with Markdown/CSV export, and "Open in Slack/Google Chat" links named after the team's provider.

**Architecture:** New orchestrator module `modules/history/` with four team-scoped use cases behind `loadTeamAccess` (members and managers of the team, admins). Data comes from `deliveries` (digest status and message ref) and `dailies` (confirmed payloads); nothing new is stored. A pure `chatLink(provider, ref, slackTeamId)` builds the link. Web page `/orgs/:id/history?team=&tab=digests|search|shipped&date=&q=&from=&to=`.

**Tech Stack:** Bun, Drizzle, Hono, React 19, TanStack Router/Query, bun:test.

**Spec:** `docs/superpowers/specs/2026-11-12-panel-v2-roadmap-design.md` (PR 4) and the phase 2 spec section "Histórico (2c)".

## Global Constraints

- No "who did not send" for past days, no per-person counts: day rows carry team counts only (dailies, blockers).
- Chat link: Slack opens the channel via `https://slack.com/app_redirect?team=<team id>&channel=<channel id>` (the exact message permalink needs the workspace domain, which is not stored); Google Chat opens the digest thread `https://chat.google.com/room/<space id>/<thread id>`; no link when there is no sent digest or no ref.
- Search: query of 2 to 100 characters, range at most 92 days (default last 28), at most 100 results, matches text, ref URL, ref title and card identifiers case-insensitively.
- Shipped: pull requests and cards from the `yesterday` section of confirmed dailies, grouped by daily date; default range is the last 7 days.
- Copy in pt-BR and en; no code comments.

## Review Focus

1. A member of another team gets 403 on every history route; unknown team 404.
2. A day without a digest delivery but with dailies still shows (status `none`), and a digest that failed shows `failed` without a link.
3. `q` shorter than 2 or longer than 100 characters and ranges over 92 days are rejected with 422 (the repo convention for invalid_request), not silently widened.
4. CSV export escapes quotes, commas and newlines in item text.
5. The Today header's chat button uses the provider name and hides when the digest is not sent.

---

### Task 1: `chatLink` and the Today chat button data
- `packages/orchestrator/src/modules/history/chat-link.ts`: `chatLink(provider: ChatProvider, ref: MessageRef | null, slackTeamId: string | null): string | null`. Tests for Slack, Google Chat, missing ref, missing Slack team.
- `TeamToday.chat: { provider: ChatProvider; url: string | null }` filled from today's digest delivery. API test in `apps/api/test/app-today.test.ts`.

### Task 2: History use cases and routes
- `getTeamHistory`, `getTeamDigest`, `searchTeamDailies`, `getTeamShipped` in `modules/history/`; routes under `/v1/app/orgs/:id/teams/:team/history/{digests,digests/:date,search,shipped}`. API tests in `apps/api/test/app-history.test.ts`.

### Task 3: Web history page
- Queries, route, `pages/history/HistoryPage.tsx` with tabs, digest list/detail, search form, shipped list with "Copy as Markdown", "Export Markdown", "Export CSV" (pure `shippedMarkdown`, `shippedCsv` in `pages/history/export.ts` with unit tests), Today header chat button. Replaces the "coming soon" History section.
