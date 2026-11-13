# Standcast 21: stale blocker alert

PR 7 of the [panel v2 roadmap](../specs/2026-11-12-panel-v2-roadmap-design.md). When a team sets `signals.blocker_alert_days`, Standcast posts one message in the team chat for every open blocker that reached that age, mentioning the team's managers. The alert is about the blocker. It never counts or ranks people.

## Behavior

- `signals.blocker_alert_days` is optional, a positive integer. Absent means off. Zero, negative and fractional values fail the `standcast.yml` check with `teams.N.signals.blocker_alert_days: blocker_alert_days must be a whole number of days greater than 0`.
- Once per team per workday, after that day's digest is sent, the worker scans the team's open blockers: `blocker_states` rows with `resolved_at` null that are still current (`last_seen_on` equals the author's latest daily, the same rule as `listCurrentOpenBlockerStates`), never alerted in that team, with age `opened_on → digest date` in calendar days at least the limit.
- Each one gets its own message in the digest channel or space: the managers mentioned with the existing chat identity lookup, the blocker text, the author, the ref link, the age, and who the blocker was routed to when a route was recorded.
- A blocker is alerted once per team. The same `blocker_states` row never alerts again in that team, also after it leaves the daily and comes back or is resolved and reopened. A blocker with a different `blockerId` (another link, or another text without a link) is a new row and can alert. When the author is in two teams with the alert on, each team gets its own message once.
- Nothing is sent when the field is absent or the team resolves to no managers.
- At most 10 alerts per team per day, oldest first; the rest go out on the next workday.

## Design

- Per blocker: new nullable column `blocker_states.alerted_at` (migration `0017`, first alert time) and `blocker_states.alerted_teams text[] not null default '{}'` (migration `0018`, the teams already alerted; filtering and marking go by team so a member in two teams alerts in both, and concurrent scans of different teams never block each other). It lives and dies with the blocker state, so "never repeat for this state, may alert for a new state" holds without extra keys. A `deliveries` row per blocker would be keyed by date (the alert must not depend on the day), and person deliveries are pruned after 90 days, which would re-alert blockers open longer than that.
- Per team and day: a `deliveries` row with the new kind `blocker_alert` (subject empty), claimed, completed and failed with the existing `claimDelivery` model. It gives one scan per team per day, serializes concurrent jobs, retries up to 3 attempts and recovers stale claims, like the digest.
- Scheduling: `runTick` already computes the due digest date per team. For teams with the field, when the digest delivery for that date is `sent` and the `blocker_alert` delivery is not settled, it enqueues `send-blocker-alerts` with `singletonKey blocker-alert:<installation>:<team>:<date>`. Teams without the field cost nothing.
- Each alert posts and then adds the team to `alerted_teams` (and sets `alerted_at` when empty) with `where not team = any(alerted_teams)`. A failed post fails the team delivery and throws, and the retry skips blockers already alerted.

## Tasks (TDD)

1. Config: failing tests for valid, absent, zero, negative, fractional; add `blocker_alert_days` to `teamSchema.signals` and `blockerAlertDays?` to `TeamConfig`.
2. Message: failing tests for `buildBlockerAlert` in en and pt-BR, and rendering through `renderSlack` and `renderGoogleChat`; add i18n keys and the builder.
3. DB: migration and schema column; failing repo tests for `listStaleBlockerStates` and `markBlockerStateAlerted`; implement.
4. Use case: failing tests for `sendBlockerAlerts` (threshold, before, twice, resolved, field absent, no managers, mentions, routed to, not current, reopened state, cap, failure retry); implement.
5. Scheduler: failing `runTick` tests (enqueued once per team per day, only after digest sent, never for teams without the field, not after the scan is settled); implement and register the worker job.
6. Docs (en and pt-BR): configuration reference, How it works section, changelog under Unreleased / Não lançado.
7. `bun test`, `bun run lint`, `bun run typecheck`, `bun run check-docs`, `bun run check-layers`.
