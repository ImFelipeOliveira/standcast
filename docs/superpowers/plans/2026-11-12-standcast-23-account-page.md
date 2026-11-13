# Account page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Personal settings get their own page: profile from GitHub with the role in each org, language and theme for this browser, and a button that signs the person out of every panel session while the CLI and plugin stay connected.

**Architecture:** The page lives at `/orgs/$installationId/account`, inside the shell, so the sidebar, org switcher and phone drawer keep working. A top-level `/account` redirects to the first org's account page and, for someone without any org, renders the same page without the shell. `POST /v1/app/sessions/revoke-all` (web session plus CSRF, like every app write) calls `revokeAllWebSessions` in the orchestrator, which calls `deleteMemberSessions(db, memberId, 'web')`; `cli` sessions are untouched. Language and theme stay in `localStorage`; "follow the browser" and "System" clear the stored choice, and the app keeps following `languagechange` and `prefers-color-scheme` live while nothing is stored.

**Spec:** `docs/superpowers/specs/2026-11-12-panel-v2-roadmap-design.md` (PR 9).

## Global Constraints

- Name and photo come from GitHub; the page only links to https://github.com/settings/profile.
- Roles come from the org context the shell already reads (`/v1/app/orgs/:id/context`), one cached request per org.
- Revoke deletes only `kind = 'web'` rows of the signed-in member, never another member's, never `cli`.
- The user menu is Account, Documentation, Sign out. Language leaves the menu.
- Segmented controls are native radio groups (`fieldset` + `legend`), 44px targets on phones, visible focus on the segment.
- All copy in `apps/web/src/i18n` (pt-BR and en).

## Review Focus

1. Revoke-all keeps CLI sessions and other members' sessions; the current browser's cookie is cleared.
2. Revoke-all rejects cross-origin and missing CSRF like `/v1/app/logout`.
3. Switching org on the account page stays on the account page; no nav item is marked current there.
4. "System" theme follows a live change of `prefers-color-scheme`; an explicit Light or Dark choice does not.
5. "Follow the browser" clears the stored language and picks the browser's language again.

### Task 1: `deleteMemberSessions` repo function (test in `packages/db/test/repo.test.ts`)
### Task 2: `revokeAllWebSessions` use case (test in `packages/orchestrator/test/use-cases/web-login.test.ts`)
### Task 3: `POST /v1/app/sessions/revoke-all` (test in `apps/api/test/app-session.test.ts`)
### Task 4: Theme and language choices (`getThemeChoice`, `followSystemTheme`, `watchSystemTheme`, `getLangChoice`, `followBrowserLang`, `watchBrowserLang`) with unit tests
### Task 5: Routes `/account` and `/orgs/$installationId/account`, `AccountPage`, user menu with Account (SSR tests in `apps/web/src/pages/account/account.test.tsx`)
### Task 6: e2e visit of the account page, changelog entries, troubleshooting note
