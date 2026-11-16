# Post each daily when it is sent

## Intent

Teams want to see a daily in the chat the moment a person sends it, not at `digest_at`. Today a daily sent before `digest_at` stays in the database until the digest, so people think it did not arrive (orangebr, team `pigz`, 2026-11-16). This becomes the default for every team.

## Goals

- Every confirmed daily is posted to the team's channel or space as its own message right after it is sent.
- At `digest_at` the team gets a summary instead of the full digest: blockers, support requests and who did not send.
- A team can turn it off and get today's behavior back.

## Non-goals

- Editing a posted message when the person sends again the same day.
- A thread per day, or one message that keeps being updated.
- Changes to reminders, blocker routing, webhooks or the history page.

## Anti-goals

- The same daily posted twice in the same chat on the same day.
- The summary repeating the dailies already posted.

## Approaches

1. **Reuse the late-daily delivery (picked).** The `send-late-daily` job becomes the job that posts any daily, enqueued on every submit instead of only after the digest. `send-digest` posts a summary when the team posts each daily. Reuses delivery claims, dedup, retries and the linked-space checks already in production.
2. **One thread per day.** The first daily opens a "Daily — team — date" message and the rest reply to it. Rejected: on Google Chat the thread is what hides dailies, the reason for #222.
3. **One message edited on each submit.** Needs a new edit method for Slack and Google Chat, and edits do not notify anyone. Rejected: the most expensive and the least visible.

## Decisions

- **Config:** `chat.post_each_daily: true | false`, default `true`, in `standcast.yml`.
  - `true`: each daily is posted as a new message in `chat.channel` when sent. At `digest_at`, the summary.
  - `false`: today's behavior. Full digest at `digest_at`, and a daily sent after it replies in the digest thread.
- **`chat.late_daily` (PR #222) is removed** before it ships. With `post_each_daily: true` every daily goes to the channel; with `false` the late daily goes to the thread, as before #222. #222 is closed in favor of this PR, and its web-editor fix (keep chat keys when writing `standcast.yml` and when switching provider) carries over for `post_each_daily`.
- **One message per person per day.** A second send on the same day updates the stored daily and the webhooks, but posts nothing new, like late dailies today.
- **Message:** the person, yesterday, today, blockers and support, as the late daily does now. The opening line says "Daily sent after the digest" only when the digest already went out; before that it carries no late label.
- **Summary at `digest_at`:** the digest title, the blockers section, the support section and the "did not send" line, without the per-person sections. When there are no blockers, no support requests and nobody missing, it says everyone sent and nobody is blocked. The Google Chat "link your account" action stays. `digest.sent` keeps the same payload.
- **Dailies sent while the summary is being built** are already posted on submit, so the digest does not re-enqueue them when `post_each_daily` is `true`.
- **Late flag:** the CLI and MCP keep returning `late: true` when the daily is sent after the digest.
- **Daily dated for a later workday** (sent on a non-workday) is posted when sent, with that date.

## Left to the builder

- The delivery kind for a posted daily: a new `daily` kind (added to the kind union and to the team failure kinds) or reuse of `late_daily`. Recommended: a new `daily` kind, so the history and failure views name it right.
- i18n keys for the summary's "everyone sent" line and the non-late opening line, in pt-BR and en.
- Docs in en and pt-BR: configuration, Google Chat, Slack, how it works, concepts, FAQ, home, changelog (Unreleased, replacing the `late_daily` entry).
