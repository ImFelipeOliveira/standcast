# Accessibility checks in CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every panel page is checked with axe in the e2e job, in light and dark theme and on a phone with the drawer open; serious and critical violations fail CI.

**Architecture:** `apps/web/e2e/a11y.e2e.ts` uses `@axe-core/playwright` (exact pin) against the seeded API. The seed grows the data the pages need (a second member, past dailies with pull request refs, sent and failed digests, a resolved blocker, a linked identity, an API key and a webhook with a failed delivery). The e2e GitHub stub answers the org membership as admin so Settings shows People and API. The CI e2e step already runs every `*.e2e.ts`.

**Spec:** `docs/superpowers/specs/2026-11-12-panel-v2-roadmap-design.md` (PR 14).

## Global Constraints

- Tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`; fail on `serious` and `critical` impact only.
- A failure prints rule id, help and targets for each violation, so the CI log is enough to fix it.
- Fixes stay inside `apps/web` and reuse the measured palette tokens; `palette.test.ts` keeps guarding contrast.
- Landing (`apps/landing`) and the docs site are out of scope here; they get axe in a follow-up once their branches merge.

## Review Focus

1. Pages are checked after their content has loaded, not while a skeleton is on screen.
2. Dark theme is set before the first paint (localStorage), so the check never runs mid-transition.
3. The phone check runs with the drawer open and focus inside it.
4. The seed additions do not change what the smoke tests assert (one of two sent today).

### Task 1: `@axe-core/playwright` pinned, seed data and admin stub
### Task 2: `a11y.e2e.ts` (failing first) over sign-in, toast, Today, Blockers, History, Settings in both themes and on a phone
### Task 3: Fix every serious or critical violation in `apps/web`
### Task 4: CI step name covers the accessibility spec; changelog entry if user-visible fixes landed
