# Email digest

> **Phase 2 (Felipe, 2026-11-01).** This ships with the React web app, not before. The setup page "Email" section below becomes a screen of personal settings in that app; everything else in this design stands.

## Why

Standcast is in public beta and needs more teams able to try it. Today the digest, the reminders and the forwarded blockers reach people only through Slack. Two kinds of teams are left out or underserved:

- teams with no Slack (and, until phase 1b, no Google Chat);
- people on a Slack team who would rather read the digest in their inbox.

Email is cheap to add: Resend is already configured and the worker already sends the beta request email through `@standcast/resend`. The panel and billing were postponed until beta teams say what they miss (Felipe, 2026-11-01).

## What it is

Email becomes one more destination, next to the chat. It is never a way to send team data to arbitrary addresses.

- A team enables email in `standcast.yml` with `email: true`. A team can have `chat`, `email: true`, or both. At least one is required.
- A person receives email only after **they** turn it on for that organization, and only to the verified primary email of their GitHub account (`members.email`, already stored at login). Nobody can subscribe someone else, and no email address ever appears in `standcast.yml`.
- What a subscribed person receives:
  - **Team with chat and email:** the team digest, by email, at `digest_at`, for each of their teams that has `email: true`. Reminders, forwarded blockers and suggestions keep going through the chat.
  - **Team with email only:** the digest, plus everything that would have been a chat direct message: the reminder, a forwarded blocker (to managers) and suggestions (to the person they belong to).
- Every email carries a one-click unsubscribe link that works without signing in.

## Goals

- A team without any chat can run Standcast end to end on email.
- A person on a chat team can also get the digest by email.
- Delivery is as reliable and idempotent as the chat deliveries: one digest email per person per team per day, retries never duplicate.

## Non-goals

- Weekly digests, choosing a frequency, AI summaries.
- Email for late dailies (on Slack they go as thread replies; by email they are not sent).
- Sending to addresses other than the person's own verified GitHub email.
- A per-team subscription choice: one switch per person per organization covers all their teams with `email: true`.
- Any billing or plan limit (free during the public beta).

## Anti-goals

- Any address typed by someone other than its owner. The digest holds confirmed dailies; it must not leak outside the organization by configuration.
- Anything that tells managers who subscribed or who reads email. Subscription state is visible only to the person themselves (anti-surveillance rule).
- An email that cannot be unsubscribed from in one click.

## Decisions

**Felipe's calls (2026-11-01):** email is an additional destination, not only an alternative; self opt-in only; one-click unsubscribe; `DRY_RUN`-style flag for development; no weekly digest or frequency choice in this version. In an email-only team, people who do not turn email on receive nothing, and that is accepted (an admin cannot subscribe others). The `usefachada.dev` domain is verified on Resend and the beta email was delivered, so `digest@usefachada.dev` can send.

**Claude's calls:**

- **Admin gate per team (`email: true`).** The GitHub primary email is often a personal address, so team data would leave the company inbox. The org decides per team in the config file, which goes through the same check run as every other change.
- **Config shape.** `chat` becomes optional; new optional `email: boolean` (default `false`). The schema rejects a team with neither (`path: teams.<n>`, message `a team needs chat, email: true, or both`). `TeamConfig.chat` becomes optional in the type; every reader of `team.chat` handles its absence.
- **Opt-in surfaces.** CLI `standcast email on|off|status` (uses `--org` like the other commands), and a section "Email" on the setup page for the signed-in person, shown to every member, admin or not. Both call one use case. There is no MCP tool.
- **No email on file.** If `members.email` is null, turning email on fails with `DomainError('no_verified_email')`, and both surfaces say: set a verified primary email on GitHub and sign in again.
- **Storage.** New table `email_subscriptions (member_id, installation_id, created_at)`, primary key `(member_id, installation_id)`, cascades on both. Off deletes the row. The address is read from `members.email` at send time, so a changed GitHub email takes effect at the next login.
- **Unsubscribe link.** `GET /email/unsubscribe?token=…` shows a confirmation page with one button; `POST /email/unsubscribe` deletes the row. The token is an HMAC (key derived from `STANDCAST_ENCRYPTION_KEY`) over `member_id` and `installation_id`; it does not expire and survives re-subscribing. The emails also send `List-Unsubscribe: <https://…/email/unsubscribe?token=…>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058) so Gmail and Yahoo show their own button; the `POST` accepts that one-click body without a CSRF token, because the token itself is the credential. Pages use the existing Hono JSX layout, in the person's language (`Accept-Language`, falling back to English).
- **Content.** The email is rendered from the same `Message` that `buildDigest`, `buildReminder` and the other builders already produce, so chat and email never drift. A new renderer in `@standcast/core` turns `Message` into `{ subject, html, text }`: escaped HTML, mentions shown as `@login`, links kept. Subject: `<team> — daily <date>` (localized by team language) for the digest; the reminder, blocker and suggestion subjects follow their message headings. The footer has the unsubscribe link and the reason ("you turned on Standcast emails for <org>").
- **Adapter.** `@standcast/resend` `EmailMessage` gains optional `html` and `headers`. The existing beta email keeps working unchanged.
- **Port.** A new `EmailChannel` port in `packages/core/src/ports.ts` with `send(to, email, idempotencyKey)`, implemented over Resend. Use cases depend on the port, not on Resend.
- **Deliveries.** Reuse the `deliveries` table: new kinds `digest_email`, `reminder_email`, `blocker_route_email`, `suggestion_email`, with `subject` set to the recipient's lowercased login so each person gets one row. The Resend `Idempotency-Key` is `<kind>:<installation>:<team>:<date>:<login>`. Failures show on the setup page like the other person failures, translated.
- **Jobs.** `send-digest` stays the chat job. A new job `send-digest-emails` is enqueued by the tick at the same instant as the digest, for teams with `email: true`; it builds the digest once and sends one email per subscribed member or manager of the team. When the team has no chat, `send-digest` is not enqueued and reminders, blocker routes and suggestions use the email path in their existing use cases (branch on `team.chat` presence inside the use case; jobs stay thin).
- **Who counts as a recipient of the digest.** Logins listed as members or managers of the team that have a `members` row with a non-null email and a subscription for that installation. A manager not listed under `members` still gets it once subscribed. People who never signed in cannot subscribe and are skipped without a delivery row.
- **Nobody to send to.** A digest email with zero recipients writes no row, except in an email-only team, where it writes one team failure `no_email_recipients` (shown on the setup page). In an email-only team, a forwarded blocker with no subscribed manager fails with `no_email_recipients`; a reminder or suggestion for an unsubscribed person writes nothing. People who do not turn email on in an email-only team get nothing: the setup page and the docs tell the admin to ask the team to run `standcast email on`.
- **Turning on.** Requires the person to belong to the installation (`member_installations`). It does not require any `email: true` team; `standcast email status` says when none of their teams sends email. Unsubscribing is idempotent: no row is still success, and the confirmation page does not reveal whether a row existed.
- **Config changes.** Jobs read the config at run time, as `send-digest` does today. The tick enqueues `send-digest` when the team has `chat` and `send-digest-emails` when it has `email: true`; each job exits without a row when its destination is no longer configured.
- **Several teams.** A person in two `email: true` teams gets two digest emails, one per team, like two Slack posts. Reminders keep the existing rule of at most one per person per day, keyed on the person's first team.
- **Unsubscribe token versioning.** Tokens are prefixed `v1.`; rotating `STANDCAST_ENCRYPTION_KEY` invalidates links already sent, which is accepted.
- **Links.** The worker builds absolute links from `PUBLIC_URL`. The worker env schema does not read it today: add it (https, no trailing slash, same rules as the api), required when `RESEND_API_KEY` is set. Railway already sets it on the worker.
- **Configuration.** Worker env: `DIGEST_EMAIL_FROM` (e.g. `Standcast <digest@usefachada.dev>`), required when `RESEND_API_KEY` is set; `DRY_RUN_EMAILS=true` logs `{ kind, to-hash, subject }` instead of sending and marks the delivery sent with `ref` `{ channel: 'dry-run', id: <uuid> }`. Without `RESEND_API_KEY`, email deliveries fail with `no_email_provider` (visible on the setup page) instead of crashing.
- **Resend limits.** The free Resend plan allows 100 emails a day. A `429` from Resend fails the delivery with `rate_limited`, is retried by the queue with backoff like other deliveries, and is never retried past the team's next digest instant (`localInstant` of the next workday's `digest_at` in the team timezone). Sends are first come, first served; no fairness between teams in this version.
- **Logs.** Email addresses never appear in logs; log the member id.
- **Webhooks and API.** No change. `digest.sent` still fires once per chat digest; email sends emit no event. The new routes are web routes, not part of the public API or the OpenAPI document. The CLI endpoints (`GET/PUT/DELETE /v1/email-subscription`, session auth) are internal like `/v1/draft`.
- **Retention.** Subscriptions live until the person turns them off, unsubscribes, or the member or installation is deleted. The privacy page (en and pt-BR) says what is stored and why.

## Docs and changelog

- `docs/site/admin/configuration.md` (and pt-BR): `email`, `chat` optional, the "neither" error, examples that pass `check-docs`.
- New page `docs/site/members/email.md` (and pt-BR): turning email on and off, what arrives, the personal-address caveat.
- `docs/site/privacy.md` (and pt-BR), CLI page, changelogs under Unreleased.

## Left to the builder

File layout inside the packages, HTML styling of the email (simple, inline styles, readable without images), test structure, migration name, and exact copy of the strings (both languages, product-tone like the existing ones).
