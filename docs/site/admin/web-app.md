# Web app

The web app at [app.standcast.app](https://app.standcast.app) shows your organization in two screens: **Settings** and **Today**. Sign in with GitHub. The app lists the organizations where Standcast is installed and you are a member.

The app is in Portuguese and English, with a light and a dark theme.

## Settings

Settings shows everything Standcast knows about the organization:

- the GitHub App installation;
- the Slack and Linear connections, with a button to connect or reconnect them (admins only);
- the Google Chat card: the linked spaces, each with its display name, its `spaces/...` name and a **Copy** button. Admins paste a link code and click **Link space**, and can **Unlink** a space after confirming. See [Google Chat](/admin/google-chat);
- the state of `standcast.yml`: valid, invalid with its errors, or missing, with a link to create it from a template;
- each team, with its reminder and digest times, its channel and any GitHub team, Slack channel or Google Chat space Standcast cannot find or is not linked;
- the latest failed deliveries, so you can see when a digest, a reminder or a routed blocker did not arrive.

## Today

Today shows one team on the current day, in the team's timezone. Pick the team in the sidebar. On a day that is not one of the team's workdays, Today shows the next workday.

- **Summary**: how many people sent today's daily, open blockers, support requests and what shipped yesterday.
- **Needs you**: open blockers and support requests. Each blocker shows how long it has been open, whether it came back on later dailies, who it was routed to and why, and, when the referenced pull request was merged on or after the day the blocker opened, a hint that it is probably resolved, with the merge date when it was not today.
- **Dailies**: today's dailies, with a filter for who sent and who did not. **View full daily** opens the whole daily.
- **Shipped yesterday**: pull requests and cards mentioned in yesterday's items.
- **Who sent today**: the names, for today only.

A team member can open Today for their own team. Managers open the teams they manage. Only admins can open any team.

### Resolve a blocker

Managers, admins and the person who wrote the blocker can mark it as resolved, and reopen it. A resolved blocker leaves the open list. If the person lists it again in the daily of a later day, it opens again. Resending the daily of the day it was resolved keeps it resolved. A resolved blocker can be reopened only while it is in the person's latest daily: once they send a daily without it, it stays resolved until they list it again.

### Remind now

Managers and admins see **Remind now** next to a person who has not sent today's daily. It sends the same direct message as the scheduled reminder, at most once a day. It works only on the team's workday and before that team's digest is posted, even when the person is also in a team whose digest comes later.

### Away

Managers and admins see **Mark away** on a person's card, with the first and last away day. The card also lists the person's upcoming periods, each with **Cancel**, which ends it. A person who is away on the day and has not sent shows **Away until** the date instead of **Remind now**, and has no reminder. A person who is away and sent a daily shows as sent. Everyone marks and cancels their own periods in **Account**, under **Away**.

- Periods belong to the organization and to the person's GitHub login. You can mark someone who has never run `standcast login`. Once they sign in, they see the period and can cancel it.
- A period has at most 90 days, counting both ends, cannot start before today and cannot overlap another active one. To change the dates, cancel it and mark again.
- A manager can mark and cancel for people in the teams they manage. An admin can do it for anyone in the organization.
- When a manager or admin marks or cancels a period for someone else, that person gets a direct message in the chat of their first team, in the team's language. It says who did it and the dates, and, when the period was marked, how to undo it with `standcast away cancel <id> --org <org>`. The message needs the person's chat user, from their sign-in or from `members` in `standcast.yml`. Without it, the message is not sent and the period still applies.

See [How it works](/how-it-works#away-periods) for what changes on those days.

## Link Google Chat

The private sign-in link the Google Chat app sends opens `/link/google-chat` in the web app. It shows which Google Chat account will be linked to your GitHub account, and in which organization, and links it only when you click **Link**. See [Google Chat](/admin/google-chat#the-sign-in-link).

## What the app does not show

Standcast exists to unblock the team, not to watch people:

- no per-person metric, rate, score or ranking;
- no history of who did not send. Today shows who is missing today only, and there is no screen for past days;
- a daily sent after the digest shows "after the digest" on that day's card only.

See [Privacy](/privacy) for what Standcast stores and who sees what.
