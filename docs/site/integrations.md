# Integrations

What Standcast connects to today, and what is still to come. A tracker adds your cards to the draft. A chat is where the team digest, reminders and direct messages go. Each team picks its own chat in `standcast.yml`.

## Available now

### GitHub

The source of the draft: pull requests opened, merged and reviewed, and commits, since your last daily. An organization installs Standcast as a [GitHub App](/admin/install). Standcast also reads `standcast.yml`, team membership and CODEOWNERS. It never reads source files.

### Linear

Optional tracker. An admin connects one Linear workspace on the setup page, read-only. Your own cards that started or finished show in the draft. A blocker that links a card goes to the people who own the blocking card, then the card's assignee, its creator or the team managers. A card stuck in progress can become a suggestion that only you see. See [Install](/admin/install#_5-connect-linear-optional).

### Slack

One digest per team in the channel set in `standcast.yml`, late dailies in that digest's thread, one reminder a day, and direct messages for routed blockers. See [Slack](/admin/slack).

### Google Chat

The same deliveries in a Google Chat space, through the Standcast app. One organization can use Slack for one team and Google Chat for another. See [Google Chat](/admin/google-chat).

## Coming

These are not connected. Standcast reads nothing from them.

| Name | Role | Notes |
| --- | --- | --- |
| Jira | Tracker | `tracker.provider: jira` is already accepted in `standcast.yml`. The setup page says the integration is not available yet, and nothing else happens. |
| ClickUp | Tracker | Same role as Linear: cards in the draft and card blockers. |
| Asana | Tracker | Same role as Linear. |
| GitHub Projects | Tracker | Same role as Linear. |
| Microsoft Teams | Chat | Same role as Slack: digest, thread, reminder and direct messages. |
| Discord | Chat | Same role as Slack. |

Nothing is read from a service until it ships. The list can grow; a new tracker or chat is another adapter, and the draft, the confirmation and the digest stay the same.
