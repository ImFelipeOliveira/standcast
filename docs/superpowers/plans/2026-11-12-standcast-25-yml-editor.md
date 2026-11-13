# standcast.yml editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins build `standcast.yml` in the panel: a form per team whose YAML preview and notes follow the chosen chat and tracker, validated by the server's own `parseConfig`, then copied or opened in the GitHub editor.

**Architecture:** The web app may only depend on `@standcast/orchestrator` (scripts/check-layers.ts), so validation is an API call: `POST /v1/app/orgs/:id/config/validate { source }` runs `parseConfig` and returns its errors. `GET /v1/app/orgs/:id/config` returns the current operational config for prefill. Both are admin only. A pure `toYaml` in the web builds the text. The app never writes to the repository (`contents: read`).

**Spec:** roadmap PR 6; `signals.blocker_alert_days` mirrors the stale blocker alert branch exactly (`blockerAlertDays` zod + custom message, `blockerAlertDays?: number`).

## Global Constraints

- Admin only; non-admins get 403 and no tab.
- Teams is shown as "coming soon" and cannot be chosen (not in `CHAT_PROVIDERS`).
- Validation requests are debounced (600 ms) and cached by source; body limit 64 KB.
- Notes: Google Chat explains that people need `members.<login>.google_chat` or the link button/DM to be mentioned; Linear explains `members.<login>.linear` when the GitHub email differs; Slack explains automatic linking by email.

## Review Focus

1. The YAML the editor produces for every chat/tracker combination is accepted by `parseConfig` (API test with generated sources).
2. Quotes in times (`"09:30"`) and `#channel` survive (YAML would read `#` as a comment).
3. An invalid draft shows the server's errors with their paths, never a silent "valid".
4. Typing does not fire a request per keystroke.
5. Existing `members` overrides are kept in the output.
