# standcast.yml reference

Standcast reads its whole configuration from one file: `standcast.yml` at the **root** of a configuration repository of the organization (or personal account), on the default branch. There is no other place to configure teams.

## Where the file lives

Standcast looks in two repositories, in this order:

1. `.github-private`, when it exists **and** has `standcast.yml`. This is the private repository GitHub uses for the member-only organization profile.
2. `.github`, otherwise. In most organizations this repository is **public**, because it holds the community health files and the public organization profile.

Keep `standcast.yml` in `.github-private`, or in a `.github` you made private. The file names the people of your teams, and anything in a public repository can be read by anyone. When both repositories have the file, `.github-private` wins and the file in `.github` is ignored. When only `.github` has it, nothing changes for you: that is where Standcast always read it.

To keep the file free of logins, list people through GitHub teams (`members: ["@org/team-slug"]` and `managers: ["@org/team-slug"]`, see [GitHub teams](#github-teams)) and leave out the top-level `members` map: the default [identity mapping](#identity-mapping) needs no entry per person.

Every `yaml` example on this page is checked against the real parser when the docs are built.

## Minimal example

```yaml
teams:
  - name: backend
    timezone: America/Sao_Paulo
    remind_at: "09:30"
    digest_at: "10:00"
    managers: [alice]
    members: [alice, bob]
    chat:
      provider: slack
      channel: "#daily-backend"
```

## Full example

```yaml
teams:
  - name: backend
    timezone: America/Boa_Vista
    workdays: [mon, tue, wed, thu, fri]
    remind_at: "09:30"
    digest_at: "10:00"
    language: pt-BR
    managers: [felipeoliveira]
    members: [alice, bob]
    chat:
      provider: slack
      channel: "#daily-backend"
    tracker:
      provider: linear
      team: BE
    signals:
      pr_review_hours: 48
      card_stale_days: 5
      direct_message: false
      blocker_alert_days: 5
members:
  alice: { slack: U0123, linear: alice@acme.com }
```

## Top level

| Key | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `teams` | list of teams | yes | | At least one team. Team names must be unique. |
| `members` | map of GitHub login to identities | no | `{}` | Manual identity mapping, only for exceptions. Rejected in a public repository. See [Identity mapping](#identity-mapping). |

No other keys are accepted. An unknown key fails validation with `Unrecognized key`.

## Team keys

| Key | Type | Required | Default | Example |
| --- | --- | --- | --- | --- |
| `name` | text, not empty | yes | | `backend` |
| `timezone` | IANA time zone | yes | | `America/Sao_Paulo` |
| `workdays` | list of `mon` `tue` `wed` `thu` `fri` `sat` `sun`, at least one | no | `[mon, tue, wed, thu, fri]` | `[mon, tue, wed, thu]` |
| `remind_at` | `HH:MM`, 24 hours | yes | | `"09:30"` |
| `digest_at` | `HH:MM`, 24 hours | yes | | `"10:00"` |
| `language` | `en` or `pt-BR` | no | `en` | `pt-BR` |
| `managers` | list of GitHub logins or GitHub teams, at least one | yes | | `[felipeoliveira, "@acme/leads"]` |
| `members` | list of GitHub logins or GitHub teams, at least one | yes | | `[alice, "@acme/backend"]` |
| `chat.provider` | `slack` or `google-chat` | yes | | `slack` |
| `chat.channel` | text, not empty | yes | | `"#daily-backend"` or `spaces/AAAAbbbbCCC` |
| `tracker.provider` | `linear` or `jira` | no | | `linear` |
| `tracker.team` | text, not empty | with `tracker` | | `BE` |
| `signals.pr_review_hours` | number greater than 0 | no | `48` | `24` |
| `signals.card_stale_days` | number greater than 0 | no | `5` | `3` |
| `signals.direct_message` | `true` or `false` | no | `false` | `true` |
| `signals.blocker_alert_days` | whole number greater than 0 | no | off | `5` |

### `name`

The team name, as it appears in the digest title, in the API and in the MCP tools. It must be unique in the file. Renaming a team starts a new history under the new name.

### `timezone`

An IANA time zone name, such as `America/Sao_Paulo`, `Europe/Lisbon` or `UTC`. Abbreviations like `BRT` or city names like `Brasilia` are rejected.

### `workdays`

The days the team has a standup. Digests go out only on these days. A daily sent on another day counts for the next workday.

### `remind_at`

The local time of the reminder, sent as a direct message in Slack or Google Chat on workdays to people who have not sent the daily. At most one per person per day. It must be before `digest_at`, otherwise the file is invalid. See [How it works](/how-it-works).

### `digest_at`

The local time the digest is posted. Quote the value (`"10:00"`) to keep it a string. Use two digits for the hour: `"09:00"`, not `"9:00"`.

### `language`

The language of the digest and of the late dailies posted in its thread: `en` or `pt-BR`. When you leave it out, the team uses English. It does not change what people wrote: dailies are never translated.

### `managers`

Who manages the team. Managers can read the team's digests, dailies and blockers through the [MCP manager tools](/members/mcp#manager-tools) and the web app, mark its blockers as resolved or open again, and send the reminder now. Organization admins can do the same in every team without being listed. Blockers with no one else to route to go to the managers.

Each entry is either:

- a GitHub login, such as `felipeoliveira`; or
- a GitHub team of your organization, written `"@org/team-slug"`, such as `"@acme/leads"`. Quote it, because YAML does not allow a value to start with `@`.

You can mix both, as in `[felipeoliveira, "@acme/leads"]`. Keep at least one entry. Any other value starting with `@`, such as `@alice` or `@acme/`, is rejected.

On GitHub, the members of a team include the members of its child teams, so a parent team in `managers` makes everyone in its child teams a manager too. List the child team when that is too broad.

Manager access follows the GitHub team. Standcast keeps the members of each GitHub team for up to 5 minutes, so someone added to or removed from the team gains or loses manager access within 5 minutes. That includes the blockers routed to managers. When the app receives the GitHub membership event, the API process that receives it drops its copy at once, but the worker and any other API process keep theirs until the 5 minutes are up, so count on 5 minutes. A team that Standcast cannot read gives manager access to nobody:

- a team of another organization, a team that does not exist, or a team the app cannot see (check the Members permission) shows a notice on the Settings page;
- a team with 5,000 members or more shows a notice and is not used;
- when GitHub fails or does not answer within 5 seconds, the team is skipped and a notice shows on the Settings page. Standcast asks GitHub again after a minute. A blocker routed to the managers in the meantime goes to the managers listed by login; when none of them can get it, it is sent again a few minutes later;
- when GitHub takes more than 3 seconds, the manager tools, `/v1/manage` and the list of teams you manage in the web app skip the team without waiting. The read goes on, and the requests that come after it use its answer.

Logins listed directly keep working in all these cases.

If your configuration repository is public, list managers as a GitHub team instead of logins: the file then shows only the team name, and who manages each team stays on GitHub, where team visibility and membership are controlled by your organization.

### `members`

Who writes dailies in this team. Each entry is either:

- a GitHub login, such as `alice`; or
- a GitHub team, written `"@org/team-slug"`, such as `"@acme/backend"`. Quote it, because YAML does not allow a value to start with `@`.

GitHub teams are read from GitHub, so changes on GitHub apply without editing the file, within the same 5 minutes as for [`managers`](#managers). A GitHub team listed in `members` and in `managers`, or in several teams, is read once. Standcast reads up to 5,000 members of each GitHub team. Any other value starting with `@`, such as `@alice` or `"@acme/back end"`, is rejected. Logins are matched without case.

A person can be in several teams. Their daily appears in every team's digest, and their standup date uses the time zone and workdays of the **first** team that lists them.

### `chat`

Where the digest goes.

- `provider`: `slack` or `google-chat`. Each team picks its own, so one organization can use both.
- `channel` for Slack: the Slack channel, as `"#name"` (quoted, because `#` starts a comment in YAML) or as a channel id such as `C0123456789`. For a private channel, invite the Standcast bot first. See [Slack](/admin/slack).
- `channel` for Google Chat: the space name, such as `spaces/AAAAbbbbCCC`. Any other format fails the `standcast.yml` check; if you paste the space link (`https://chat.google.com/room/AAAAbbbbCCC`), the error tells you the name to use. The space must have the Standcast app and be linked to your organization with a code, otherwise the digest fails with `space_not_linked`. See [Google Chat](/admin/google-chat).

::: code-group

```text [Slack]
chat:
  provider: slack
  channel: "#daily-backend"
```

```text [Google Chat]
chat:
  provider: google-chat
  channel: spaces/AAAAbbbbCCC
```

:::

### `tracker`

The project tracker of the team: `provider` (`linear` or `jira`) and `team` (the team key).

```text
tracker:
  provider: linear
  team: BE
```

- `provider: linear`: Standcast reads the cards of the Linear workspace that an admin connected on the setup page. `team` is the Linear team key, such as `BE`, and limits the activity and the signals to that Linear team. See [Install](/admin/install#_5-connect-linear-optional).
- `provider: jira` is accepted by the parser, but Jira is still coming soon. The setup page shows a notice and nothing else happens. ClickUp, Asana, GitHub Projects, Microsoft Teams and Discord are not accepted yet. See [Integrations](/integrations).
- If a team uses Linear and Linear is not connected, the setup page warns about it. Nothing breaks: the draft just has no cards.

### `signals`

Settings for suggested blockers, which show only to the person they are about:

- `pr_review_hours`: your open pull request, not a draft, with no review for this many hours since it was ready for review. Default `48`.
- `card_stale_days`: one of your Linear cards in progress for this many days or more, counting from when it was started. Default `5`. The suggestion is `card_stale`.
- `direct_message`: when `true`, a suggested blocker is also sent to the person by direct message, once per suggestion. Default `false`.

CI failing on a pull request's head commit counts after 24 hours, and is not configurable.

One setting is for managers instead:

- `blocker_alert_days`: a whole number of days. When a blocker in a daily is still open this many days after the day it was first reported, Standcast posts one message about it in the team's channel or space, mentioning the team's managers. Leave it out to turn the alert off, which is the default. `0`, negative numbers and fractions fail the check. See [Stale blocker alert](/how-it-works#stale-blocker-alert).

## GitHub teams

Use a GitHub team instead of listing people one by one, in `members` and in `managers`. This is the recommended way: the team changes on GitHub without editing the file, and the file lists no logins. The app needs the Members (read) permission, which it asks for on install.

```yaml
teams:
  - name: platform
    timezone: Europe/Lisbon
    remind_at: "09:00"
    digest_at: "09:30"
    managers: [carol, "@acme/platform-leads"]
    members: ["@acme/platform", dave]
    chat:
      provider: slack
      channel: C0123456789
```

## Several teams

Each team has its own channel, time zone and times. Here `mobile` uses Google Chat. Erin is in both teams, so her standup date follows `backend`, the first team that lists her.

```yaml
teams:
  - name: backend
    timezone: America/Sao_Paulo
    remind_at: "09:30"
    digest_at: "10:00"
    language: pt-BR
    managers: [felipeoliveira]
    members: [alice, bob, erin]
    chat:
      provider: slack
      channel: "#daily-backend"
  - name: mobile
    timezone: America/New_York
    workdays: [mon, tue, wed, thu]
    remind_at: "08:45"
    digest_at: "09:15"
    managers: [frank]
    members: [erin, grace]
    chat:
      provider: google-chat
      channel: spaces/AAAAbbbbCCC
```

## Identity mapping

By default nobody needs an entry in the file. Standcast mentions people in Slack by matching the primary verified email of their GitHub account, captured when they sign in with `standcast login`, with the email of their Slack user. In Google Chat, people link themselves by sending the Standcast app a direct message, matched with any verified email of their GitHub account. Linear users are linked by the same GitHub email.

Only when the emails differ, map the person by hand under the top-level `members` key, using their GitHub login. Each entry puts the person's login next to a work email or a chat user id, so it is personal data: the mapping is accepted only when `standcast.yml` is in a private repository. In a public repository, the `Standcast config` check fails with "standcast.yml exposes personal data", annotated on the `members` key, and the setup page shows a warning. Move the file to `.github-private` (or make `.github` private), or remove the entries and let people link through the default above.

```yaml
teams:
  - name: backend
    timezone: America/Sao_Paulo
    remind_at: "09:30"
    digest_at: "10:00"
    managers: [alice]
    members: [alice, bob]
    chat:
      provider: slack
      channel: "#daily-backend"
members:
  bob: { slack: U0456 }
  erin: { google_chat: users/123456789 }
```

| Key | Used today | Value |
| --- | --- | --- |
| `slack` | yes | Slack member id, such as `U0456`. In Slack, open the person's profile, click the three dots and **Copy member ID**. |
| `google_chat` | yes | Google Chat user, as `users/` followed by digits, such as `users/123456789`. The digits are the person's Google user id. See [Google Chat](/admin/google-chat#how-people-are-linked) |
| `linear` | yes | Email of the person in Linear. Optional: without it, Standcast uses their primary verified GitHub email. It must be an email |
| `jira` | coming soon | Jira account |

A `slack` mapping is used from the next digest on, even for people who have never signed in. People without a mapping are linked by email when they sign in with `standcast login` or on the setup page. If you connect a different Slack workspace, the email links are cleared and made again at the next sign-in.

A `google_chat` mapping wins over the link made by a direct message to the app for digest mentions. When the mapping differs from that link, direct messages use it only if that user is a member of a Google Chat space linked to your organization; otherwise they fail with `no_chat_identity`. See [Google Chat](/admin/google-chat#how-people-are-linked).

The `linear` email has priority over the GitHub email. Linear links are made when the person signs in, right after Linear is connected, and whenever `standcast.yml` changes, including people who are in a team through a GitHub team (`@org/team`). Standcast stores the Linear user id, never the email. If you connect a different Linear workspace, the Linear links are cleared.

## Common validation errors

These are the messages the setup page shows, as `path: message`. `teams.0` is the first team, `teams.1` the second, and so on.

| Message | Cause | Fix |
| --- | --- | --- |
| `teams.0.digest_at: must be HH:MM (24h)` | A time like `"9:30"`, `"10h"` or `"25:00"` | Use two digits and 24 hours: `"09:30"` |
| `teams.0.digest_at: Invalid input: expected string, received undefined` | `digest_at` is missing (same for `remind_at`, `timezone`, `name`) | Add the key |
| `teams.0.timezone: unknown IANA timezone` | `Brasilia`, `BRT`, `GMT-3` | Use a name like `America/Sao_Paulo` |
| `teams.0.workdays.0: Invalid option: expected one of "mon"\|"tue"\|"wed"\|"thu"\|"fri"\|"sat"\|"sun"` | `monday`, `Mon`, `seg` | Use the three-letter lowercase English names |
| `teams.0.workdays: Too small: expected array to have >=1 items` | `workdays: []` | List at least one day, or remove the key |
| `teams.0.language: Invalid option: expected one of "pt-BR"\|"en"` | `pt`, `pt_BR`, `english` | Use `pt-BR` or `en` |
| `teams.0.chat.provider: Invalid option: expected one of "slack"\|"google-chat"` | `teams`, `Slack`, `google_chat`, `gchat` | Use `slack` or `google-chat` |
| `teams.0.members: Too small: expected array to have >=1 items` | `members: []` (same for `managers`) | List at least one person |
| `teams.0.managers.0: managers must be GitHub logins or GitHub teams written as @org/team-slug` | `managers: ["@leads"]` | Write a login, such as `alice`, or a team, such as `"@acme/leads"` |
| `teams.0.members.0: members must be GitHub logins or GitHub teams written as @org/team-slug` | `members: ["@alice"]`, `members: ["@acme/back end"]` | Write a login, such as `alice`, or a team by its slug, such as `"@acme/back-end"` |
| `teams.0: Unrecognized key: "reminder"` | A misspelled or unknown key | Check the key against the tables above |
| `members.alice.slack: must be a Slack user id like U0123ABCD` | A name, an email, a channel id or `<!channel>` | Use the member id, which starts with `U` or `W` |
| `members.alice.google_chat: must be a Google Chat user like users/123456789` | An email, a name or a bare number | Use `users/` followed by the digits of the user id |
| `members.alice: Unrecognized key: "slak"` | A misspelled identity key | Use `slack`, `google_chat`, `linear` or `jira` |
| `standcast.yml exposes personal data` (check run) | Identity overrides under `members` in a public repository | Move the file to `.github-private`, make the repository private, or remove the overrides |
| `teams.1.name: duplicate team name "backend"` | Two teams with the same name | Rename one of them |
| `teams.0.signals.pr_review_hours: Too small: expected number to be >0` | `0` or a negative number | Use a positive number |
| `teams.0.signals.blocker_alert_days: blocker_alert_days must be a whole number of days greater than 0` | `0`, a negative number, a fraction or a quoted value | Use a whole number such as `5`, or remove the key to turn the alert off |
| `teams: Too small: expected array to have >=1 items` | `teams: []` | Add a team |
| `: Invalid input: expected object, received null` | The file is empty | Add at least one team |
| A YAML syntax message with a line and column | Broken indentation, an unclosed `[` or quote | Fix the YAML at that line |

While the file is invalid, Standcast keeps using the last valid version until you fix it. See [Configuration states](/admin/install#configuration-states).
