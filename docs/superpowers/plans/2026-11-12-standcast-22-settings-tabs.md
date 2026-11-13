# Settings tabs, People and links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Settings splits into tabs (General, People and links, API and webhooks); admins see how Standcast finds each config member in the chat and tracker, and can redeliver a failed webhook delivery.

**Architecture:** `getPeopleLinks` (admins only) reads the config members, `member_identities`, `standcast.yml` overrides and CLI sessions; nothing calls Slack, Google or Linear. `redeliverWebhookDelivery` (admins only) puts a failed delivery back to pending for the worker. Web routes `/orgs/:id/settings`, `/settings/people`, `/settings/api`.

**Spec:** `docs/superpowers/specs/2026-11-12-panel-v2-roadmap-design.md` (PR 5) and the panel artifact boards "Configuração · Geral / Pessoas e vínculos / API e webhooks".

## Global Constraints

- People and links is configuration diagnosis, not a metric: no counts per person, no activity; only linked/missing and the source of the link.
- Admin only (same gate as API keys and webhooks); non-admins get 403 on the API and do not see the tab.
- Chat status per provider of the person's teams: `linked` with source `config` (override in `members.<login>`) or `identity` (stored link), else `missing`. Linear: `linked` via override or stored identity, else `missing`. Jira gets no column while the integration is not available. CLI: an active CLI session.
- Redeliver only `failed` deliveries of an active endpoint of the same installation: status → `pending`, attempts → 0, next attempt now, last error cleared, delivery job enqueued right away.

## Review Focus

1. A member listed only through a GitHub team (`@org/team`) shows up resolved by login.
2. A person in two teams with different chat providers gets one row with both providers.
3. A config member who never signed in to Standcast shows all missing and no CLI, without errors.
4. Redeliver of a delivered or foreign delivery is rejected (404), not silently reset.
5. Old `/settings` links with `?connected=` keep working on the General tab.

### Task 1: `getPeopleLinks` and route `GET /v1/app/orgs/:id/people`
### Task 2: `redeliverWebhookDelivery` and route `POST /v1/app/orgs/:id/webhooks/deliveries/:deliveryId/redeliver`, Redeliver button
### Task 3: Settings tabs (routes, tabs in the header, People page with the issue callout and options)
