# Support requests

## Why

Teams that run written dailies often separate two things: a **blocker** ("I am stuck") and a **support request** ("I am not stuck, but I need something from someone": a review, a decision, a pairing session). Felipe brought a real daily template that ends with "🤝 Solicitação de apoio" next to "🚧 Impedimentos". Today Standcast only has yesterday, today and blockers, so people either overload blockers (which routes a DM to managers) or leave the request out.

## What it is

A fourth, optional section of the daily: `support`. Same item shape as the other sections (text up to 500 characters, optional ref to a pull request, issue, commit or card). It is written and confirmed by the person like every other section.

## Goals

- A person can add support requests to their daily from the `/daily` skill, the MCP server or the CLI.
- The team digest shows support requests prominently, right after the blockers, with who asked.
- Integrators can read them through the read API and the `daily.submitted` webhook.

## Non-goals

- Routing support requests by DM, mentions of specific people, or tracking whether a request was answered.
- A separate webhook event or a separate `support:read` scope.

## Anti-goals

- Any count, rate or per-person aggregate of support requests. They are content the person chose to share, like blockers, never a metric.

## Decisions

**Felipe's calls (2026-11-01):** optional section; skill, MCP and CLI ask for it after blockers; digest section right after blockers; no DM routing; additive API and webhook field.

**Claude's calls:**

- **Schema.** `DailySubmissionSchema` gains `support: z.array(ItemSchema).max(10).default([])` in `packages/core/src/daily.ts`. Input may omit it; parsed output always has it. Dailies stored before this change have no `support` in their `payload` jsonb, so every reader treats a missing field as `[]`. No database migration.
- **Digest.** In `buildDigest`, a section headed by a new i18n key `support` ("Pedidos de apoio" / "Support requests") follows the blockers section and precedes the per-person sections. Each item is `<person>: <item>` like blockers. No section when nobody asked. The late daily (`buildLateDaily`) shows the person's support requests after their blockers the same way.
- **Per-person section.** Unchanged: support requests appear only in the dedicated section, as blockers do.
- **MCP.** `standcast_submit_daily` input gains optional `support` (described as "What the person needs help with from others, without being blocked."). The confirmation text built for elicitation lists it under a new `cli.confirm.support` label when non-empty. Manager read tools return `support` on dailies.
- **CLI.** `standcast submit --file` accepts the field (it validates with the same schema). Any human-readable confirmation or listing that prints blockers prints support after them.
- **Skill.** `packages/plugin/skills/daily/SKILL.md`: after asking about blockers, ask whether they need support from anyone; keep the answer verbatim; show it in the final review; include it in the JSON. "No" means an empty list. Same verbatim and confirmation rules.
- **Read API and webhooks.** `support` (array of items, possibly empty) is added to the daily objects in the org read API (`GET /v1/org/...` dailies), the OpenAPI schemas and examples, and the `daily.submitted` webhook payload. The API changelog lists it under Unreleased as an additive change. `blocker.opened` and `digest.sent` are unchanged.
- **Suggestions.** Suggested blockers stay blockers; they never become support requests.
- **Docs.** Concepts, how it works, the members pages (getting started, Claude Code, CLI, MCP), the API overview and webhooks pages, in en and pt-BR, plus both product changelogs and `docs/api/CHANGELOG.md` under Unreleased. Landing copy is unchanged.

## Left to the builder

Exact copy in both languages (product tone of the neighbors), emoji or not in the digest heading (follow how the blockers heading is rendered today), test layout.
