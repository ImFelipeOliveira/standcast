# Away periods: vacation without a daily

Date: 2026-11-16. Status: design, waiting for approval.

## Why

When someone is on vacation, Standcast still treats them as a person who owes a daily. They get the reminder in the chat, they show up under "Not sent" in the digest, and the web app's **Today** shows them as missing. Teams work around it by ignoring the noise, which teaches everyone to ignore the "Not sent" list. Today the only way to skip a day is `workdays`, which applies to the whole team.

An away period tells Standcast that a person is out between two dates, so it stops asking them for a daily on those days.

## Goals

- A person can mark their own away period from the CLI (and from the MCP server, which uses the same API).
- A manager of a team, or an admin of the organization, can mark an away period for a member of that team from the web app.
- On a day inside an active away period, for that person in that organization:
  - no reminder is sent, including **Remind now** from **Today**;
  - the digest does not list them under "Not sent";
  - **Today** in the web app shows them as away instead of missing, and the Remind button is not shown for them.
- A period can be listed and cancelled. The person can always cancel a period, including one a manager marked for them.
- When a manager marks or cancels a period for someone else, that person gets a direct message in the chat saying who did it and the dates.

## Non-goals

- Partial days, half days or recurring days off. One period is a range of whole days.
- Holidays for a whole team. `workdays` covers fixed days off; a team holiday is a separate feature.
- Changing blocker routing or blocker alerts when the person who would receive them is away.
- Marking away periods through `standcast.yml`.
- Importing periods from a calendar or an HR tool.

## Anti-goals (a failure even if it works)

- **Absence is not published.** The digest shows nothing about who is away: the person only leaves the "Not sent" list. Away periods never reach the digest, `/v1/org/*`, `/v1/manage/*`, outgoing webhooks (`digest.sent` keeps its `missing` list, now without people who are away), the setup page or logs.
- **No absence metrics.** No counts of days away, no history per person shown to anyone but the person and the managers who can mark periods for them.
- **Nothing hidden from the person.** A period someone else marked is always visible to the person, with who marked it, and the person can cancel it.
- **A daily is never refused.** A person who is away can still submit a daily, and it is shown like any other.

## Constraints

- Business rules live in use cases under `packages/orchestrator/src/modules/` (a new `away` module). Routes, the CLI and the MCP server stay thin. Pure date rules go to `@standcast/core`, with `now` passed in.
- Every query is scoped by `installation_id`, plus the person's login (lowercased) for their periods.
- Dates are calendar dates (`YYYY-MM-DD`) compared with the daily `date` that reminders, digests and **Today** already use (`dailyDateFor` in the team's time zone). No time zone conversion happens on away dates.
- User-visible text goes through i18n in `en` and `pt-BR`. Docs in `docs/site` in both languages, and a changelog bullet in both.
- The direct message follows the delivery rules: `claimDelivery` → `completeDelivery`/`failDelivery`, a subject that identifies the recipient, every call after the claim inside the `try`.
- The new routes are internal (`/v1/sessions`-style for the CLI, `/v1/app/*` for the web app). They are not part of the public API contract.

## Approaches

1. **A table of periods** (chosen). `away_periods` with installation, member, `from_date`, `until_date`, who marked it, when, and when it was cancelled. Reminder, digest and **Today** ask "does this person have an active period covering this date?". It supports future periods, a list, cancel, and records who marked each one.
2. **One row per day away.** Lookups are trivial, but a two-week vacation is fourteen rows, cancelling means deleting many rows, "who marked it" repeats on each one, and the CLI and web app would rebuild periods from days anyway.
3. **An "away until" field on the person.** Smallest, but only one period at a time (no marking December while a November day off is set), and `members` is shared across organizations, so a manager in one organization would change a value another organization uses.

The user picked 1, scoped per organization (installation).

## Decisions taken with the user

- Who marks: the person, for themselves, through the CLI (and MCP). For someone else, through the web app: a manager of a team the person belongs to, or an organization admin. This is the same rule as **Remind now** (`loadTeamAccess(...).elevated`).
- The digest shows nothing about away people. They are only left out of "Not sent".
- Periods are per organization. The CLI takes `--org` like `standcast submit`, optional when the person belongs to one organization.
- Periods are stored by the person's GitHub login, not by their Standcast account, so a manager or admin can mark people who have never run `standcast login`. Reminders and the digest already work from the logins in `standcast.yml`. Once that person signs in, they see the period and can cancel it.

## Design

### Data

New table `away_periods`:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | primary key |
| `installation_id` | bigint | FK to installations, cascade on delete |
| `login` | text | GitHub login, stored lowercased; the person does not need a `members` row |
| `from_date` | date | first day away, inclusive |
| `until_date` | date | last day away, inclusive |
| `created_by` | uuid | FK to members: who marked it (the person, a manager or an admin; all of them are signed in) |
| `created_at` | timestamptz | default now |
| `cancelled_at` | timestamptz | null while active |
| `cancelled_by` | uuid | FK to members, null while active |

Index on `(installation_id, login, until_date)` for "active periods of these people on this date". An active period is `cancelled_at IS NULL AND from_date <= date AND until_date >= date`.

Repository functions in `@standcast/db`: create a period, cancel a period (compare-and-swap on `cancelled_at IS NULL`), list a person's periods from a date on, and `awayLogins(installationId, logins, date)` that returns which of those logins are away on that date (one query for a whole team).

Rows are removed with the installation (cascade). Cancelled and past periods are kept until then; retention follows the existing retention job if it has a matching rule, otherwise they stay (they are small).

### Rules (`@standcast/core`)

- `until_date >= from_date`.
- A period is at most 90 days long.
- `from_date` cannot be before today, where today is the daily date of the person's first team (`dailyDateFor(now, team)`). Days that are already gone are not rewritten, so a digest that already listed someone stays true.
- A new period cannot overlap an active period of the same person in the same installation (`away_overlap`). To change dates, cancel and mark again.

### Use cases (`modules/away`)

- `markAway(deps, member, { installationId, login?, from, until })`
  - Without `login`, or with the caller's own login: the caller marks themselves. They must belong to the installation and to at least one of its teams.
  - With another `login`: the caller must be elevated on a team the target belongs to in that installation (manager of that team, or installation admin, as `loadTeamAccess` decides). Otherwise `forbidden`. The target must be in the resolved members of one of the installation's teams (logins from `standcast.yml`, GitHub teams expanded), whether or not they ever signed in (`not_found` otherwise).
  - Validates the rules above, inserts, and when the target is not the caller enqueues the notice (below).
- `cancelAway(deps, member, { installationId, periodId })`: allowed for the person, and for a manager of one of the person's teams or an installation admin. Compare-and-swap on `cancelled_at IS NULL`. Notice when the canceller is not the person.
- `listAway(deps, member, { installationId, login? })`: the caller's own periods, or, for a manager or admin, the periods of a member of a team they can act on. Returns active and future periods, newest first, each with who marked it.
- `isAway` checks are not a use case: reminder, digest and **Today** call the repository function `awayLogins` directly in their existing flow.

Error codes: `invalid_away_period`, `away_overlap`, `forbidden`, `not_found`. Added to the error tables in the docs.

### Effects on existing flows

- **Reminder** (`send-reminder.ts`): after the "already submitted" check, return early when the person is away on `job.date`. No delivery row is claimed.
- **Remind now** (`remind-now.ts`): returns a new result `'away'` and does not enqueue.
- **Digest** (`send-digest.ts`): load `awayLogins` for `team.memberLogins` on `job.date`; a person without a daily who is away goes to neither `entries` nor `missing`. A person who is away and did send a daily is an entry as usual. The `digest.sent` webhook payload and the delivery event use the reduced `missing` list; no new field.
- **Today** (`get-team-today.ts`): a member without a daily who is away gets status `'away'` instead of `'missing'`. The web app shows them in a neutral "Away" state, without the Remind button. The status is visible only in the web app's team view, which only members, managers and admins of the team can open.
- **Suggestions and signals** (private DMs to the person): the person's signal scan is skipped while they are away, judged on the daily date of their first team (event-triggered scans have no job date). Nothing is held back to be sent later. *(Builder's call, settled in review.)*
- **Org digests API** (`/v1/org/digests`): today it recomputes `missing` on every request from the current team members, so it would disagree with the `digest.sent` webhook and reveal who was away. The digest send stores its `missing` logins on the digest delivery (new nullable column), and the endpoint returns the stored list when present, falling back to the current computation for digests sent before this change. The org API never reads away periods. *(Builder's call, settled in review.)*

### Notice to the person

New delivery kind `away_notice`. Key: `(installation, teamName: '', date: <the day it was marked>, kind: 'away_notice', subject: '<login>:<periodId>:<marked|cancelled>')`. Sent as a direct message on the chat of the person's first team, in that team's language:

- marked: "@manager marked you away from 01/12 to 05/12. You won't get daily reminders on those days. To undo it: `standcast away cancel <id>`."
- cancelled: "@manager cancelled your away period from 01/12 to 05/12."

The chat user is found the same way reminders find it (`directMessageIdFor`: the `members` override in `standcast.yml`, or the identity linked at sign-in). Without one, which is common for people who never signed in, the delivery fails with `no_chat_identity` like reminders do; the period is still valid.

### API

Web app (`/v1/app/orgs/:installationId`):

- `GET /away?login=` — list (own, or a managed member's).
- `POST /away` — `{ from, until, login? }`.
- `POST /away/:periodId/cancel`.

CLI and MCP (session token, like `/v1/dailies`):

- `GET /v1/away?org=`
- `POST /v1/away` — `{ org, from, until }`. No `login`: the CLI only marks the caller.
- `POST /v1/away/:periodId/cancel` — `{ org }`.

### CLI

```
standcast away --from 2026-12-01 --until 2026-12-05 [--org orangebr]
standcast away list [--org orangebr]
standcast away cancel <id> [--org orangebr]
```

Dates accept `YYYY-MM-DD`. `--from` defaults to today. Output in the CLI's language, like the other commands. The MCP server gets `away_mark`, `away_list` and `away_cancel` tools that mark only the person, and the tool descriptions tell the agent to confirm the dates with the person before calling.

### Web app

- **Account**: an "Away" section with the person's active and future periods (dates, who marked them, Cancel) and a form to mark a new one. One form per organization the person belongs to, using the organization switcher the app already has.
- **Today**, for a manager of the team or an admin: each person's card gets "Mark away" (a small date-range form) next to Remind. An away person's card shows "Away until 05/12" and Cancel. Members who are not managers see "Away" without the actions.

### Docs

- `docs/site/members/` page section: how to mark yourself away (CLI, MCP).
- `docs/site/admin/web-app.md`: managers marking someone away, the notice.
- `docs/site/how-it-works.md`: reminders and the digest skip people who are away.
- `docs/site/privacy.md`: what is stored (dates, who marked, cancellations) and who sees it.
- API error tables: the new codes.
- Changelog `Unreleased` bullet in both languages.

## Tests worth writing

- Reminder not sent on a day inside a period; sent on the day after `until`; sent again after cancel.
- Digest: away person without a daily is in neither list; away person with a daily is an entry; `digest.sent` payload has the reduced `missing`.
- Period boundaries: `from` and `until` both count (`>=`, `<=`).
- Overlap refused; a cancelled period does not block a new one.
- A manager of team A cannot mark a person who is only in team B; an admin who is not a manager can mark and cancel; another installation's period never applies.
- The person can cancel a period a manager marked; compare-and-swap under two concurrent cancels.
- Notice: sent once on retry (delivery key), pt-BR copy, no notice when the person marks themselves.
- No away data in `/v1/org/*`, `/v1/manage/*`, webhooks (`apps/api/test/no-suggestion-leak.test.ts` gets a case).

## Left to the builder

- Exact component layout and copy of the Account section and the Today card actions, following the existing design system.
- The retention rule for old cancelled periods, if the retention job has a natural place for it.
- Pagination of `listAway` (a person rarely has more than a handful of periods; a cap of 50 is fine).
