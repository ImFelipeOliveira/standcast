# How it works

A day in the life of a team, with this configuration:

```text
team backend · timezone America/Sao_Paulo · workdays mon–fri
remind_at 09:30 · digest_at 10:00 · channel #daily-backend
```

## 08:50 · Alice drafts her daily

Alice runs `/daily` in Claude Code. The skill asks Standcast for a draft. Standcast looks at Alice's GitHub activity in the organization since her last daily:

- pull requests she opened;
- pull requests she merged;
- pull requests she reviewed (not her own);
- commits she authored, grouped by repository;
- her own Linear cards, when the organization connected Linear: `card_started` when a card moved to in progress and `card_done` when it was completed.

The window starts when she sent her last daily, if that was on or after the previous workday. Otherwise it starts at midnight of the previous workday. On Monday, the previous workday is Friday, so the weekend is covered. The cards use the same window. The draft has up to 50 items in total, newest first. If Linear fails, the draft still comes back with the GitHub activity.

Alice edits yesterday, writes today and one blocker, asks for a review on her migration as a support request, and confirms. Standcast stores the daily for today's date. She can send it again until the digest goes out: the last version wins.

## 09:30 · Reminder

At `remind_at`, in the team's time zone and only on workdays, people who have not sent the daily get a direct message in Slack or Google Chat, depending on the team. The message says when their digest goes out. It is the earliest pending digest if the person is in several teams.

- At most one reminder per person per day, even across several teams.
- It is sent only while `remind_at` has passed and `digest_at` has not. If the worker was down, it can still go out up to 60 minutes after `remind_at`, but never at or after `digest_at`, and never once the team's digest has been posted.
- People without a chat identity get the failed delivery `no_chat_identity` on the setup page. See the delivery errors for [Slack](/admin/slack#delivery-errors) and [Google Chat](/admin/google-chat#delivery-errors).
- `remind_at` must be before `digest_at`, otherwise the file is invalid.

## 10:00 · The digest

At `digest_at`, in the team's time zone and only on workdays, Standcast posts one message to `#daily-backend`:

1. the title, with the team and the date;
2. **Blockers**, with who reported each one;
3. **Support requests**, with who asked for each one, when anyone did;
4. each person's yesterday and today, in the order of `members` in `standcast.yml`;
5. the people who did not send the daily.

People are mentioned in Slack or Google Chat when Standcast knows their user there. Otherwise they appear as `@` followed by their GitHub login, as plain text. See [Slack](/admin/slack#how-people-are-mentioned) and [Google Chat](/admin/google-chat#how-people-are-linked).

There is exactly one digest per team per day. If the worker is down at 10:00, the digest goes out when it comes back, as long as that is within 120 minutes. After 12:00 the worker no longer sends it on its own: the first daily sent that day after 12:00 sends the digest, with every daily sent so far. A failed post is retried up to 3 attempts in total, and the error shows up on the setup page.

## 10:40 · Bob sends a late daily

Bob sends his daily after the digest. Standcast replies in the digest thread with his daily. The CLI and the MCP tools tell him `late: true`.

Only the first late daily of the day goes to the thread. If Bob sends again, Standcast stores the new version and sends the webhook, but does not post a second reply.

## Blocker routing

Each new blocker in a submitted daily is sent once by direct message to whoever can help, in this order:

1. A pull request link in your own organization goes to the requested reviewers and the members of requested teams. With none of those, it goes to the CODEOWNERS of the files changed in the pull request, at its base branch, with teams expanded to their members.
2. A card link in the connected Linear workspace goes to the people it depends on, in this order:
   1. the assignees of the cards that block it ("blocked by");
   2. otherwise, the card's own assignee;
   3. otherwise, its creator;
   4. otherwise, the managers of the author's first team.
3. Anything else goes to the managers of the author's first team.

Rules:

- The author never receives their own blocker, and at most 5 people get it.
- For cards, only people linked to Standcast are considered, and cards from another Linear workspace are never read: they go to the managers. If Linear is not connected or its access was revoked, a card blocker goes to the managers.
- If none of the people found has a chat identity, or GitHub could not be read, the blocker goes to the managers.
- Pull requests from other organizations are not read, and go to the managers.
- A blocker with a link is identified by the link, so rewording it or sending the daily again does not send it again. Without a link, the text identifies it. At most 10 different blockers per daily are routed.
- The message says why the person got it: requested reviewer, code owner, owner of the blocking card, assignee, creator or team manager.
- The message has only who reported it, the blocker text, the link and the date. It never includes the rest of the daily.
- If there is no recipient at all, for example when the author is the team's only manager, the failed delivery `no_route_target` shows on the setup page. A manager without a chat identity shows as `no_chat_identity`.

Blockers also appear at the top of the digest, in the `blocker.opened` webhook and in the manager tools.

## Stale blocker alert

A team can ask Standcast to speak up when a blocker stays open too long. Set [`signals.blocker_alert_days`](/admin/configuration#signals) on the team, for example `5`. Without it, nothing is sent.

On each workday, once that day's digest is posted, Standcast looks at the team's open blockers. A blocker counts when it is still in its author's latest daily, nobody marked it as resolved, and at least that many days passed since the day it was first reported. For each one, Standcast posts one message in the team's channel or space, the same place as the digest, with:

- a mention of the team's managers (at most 20, in login order), using their Slack or Google Chat identity when Standcast knows it;
- the blocker text and its link;
- how many days it has been open and who reported it;
- who it was routed to, when it was [routed](#blocker-routing) to someone.

Rules:

- Each blocker is alerted once per team. It is not alerted again on the next days, after it leaves the daily and comes back, or after it is marked as resolved and comes back. A blocker with a different link, or with a different text when it has no link, is a different blocker and can be alerted.
- When the person who reported the blocker is in more than one team with the alert on, each of those teams gets its own message, once.
- At most 10 blockers per team per day, oldest first. The others go out on the next workday.
- Nothing is sent when the team has no managers Standcast can find, for example when its managers are a GitHub team with no members.
- If the digest of the day is not posted, the alert waits for the next workday.

The alert is about the blocker, to get it unstuck. It never counts blockers per person or compares people.

## Support requests

A support request is something you need from someone else without being blocked: a review, a decision, a pairing session. It is an optional section of the daily, asked for right after the blockers, and it goes exactly as you wrote it.

- It appears in the digest right after the blockers, with who asked, and in a late daily after its blockers.
- It is not routed by direct message, and Standcast does not track whether anyone answered it.
- It is in the `support` field of the dailies in the organization API, the `daily.submitted` webhook and the manager tools. There is no separate event.
- A suggested blocker never becomes a support request.
- Like blockers, support requests are content you chose to share. Standcast never counts them or turns them into a metric about anyone.

## Suggested blockers

Standcast can notice blockers you may have missed. There are three signals:

- your own open pull request, not a draft, with no review for `pr_review_hours` (default 48) since it was ready for review;
- failing CI on the head commit of your pull request for 24 hours;
- one of your Linear cards (`card_stale`) in progress for `signals.card_stale_days` (default 5) days or more, counting from when it was started.

They are checked about an hour before `remind_at`, and, for pull request suggestions, also in real time when a pull request, review or check suite changes. Card suggestions are only checked by the daily scan. Only people who have signed in at least once get them. If your Linear link goes away, your pending card suggestions are resolved.

A suggestion shows only to you, in your draft. It never appears in the digest, the organization or manager tools, webhooks or the setup page. Your manager sees a blocker only after you put it in your daily. With `signals.direct_message: true` (default `false`) you also get a direct message, once per suggestion.

To answer:

- **Confirm:** add it to your blockers with its link. Submitting the daily confirms it. From a terminal, `standcast suggestion confirm <id>`.
- **Ignore:** `standcast suggestion ignore <id>`, the MCP tool `standcast_decide_suggestion`, or answer when the `/daily` skill asks you.

An ignored suggestion comes back only if the signal changes: a new head commit that is still failing, or a new period without review, after a review is dismissed or the pull request is marked ready for review again. A stale card comes back only if the card is restarted. The agent never adds a suggestion without your answer. See [CLI](/members/cli#standcast-suggestion).

## Time zones, workdays and several teams

- **All times are in the team's time zone.** `remind_at` and `digest_at` are local times, `HH:MM`, 24 hours.
- **Digests run only on workdays.** With `workdays: [mon, tue, wed, thu, fri]`, there is no digest on Saturday or Sunday.
- **The standup date follows your first team.** "Today" and "previous workday" use the time zone and workdays of the first team in `standcast.yml` that lists you. A daily sent on a day off counts for the next workday.
- **One daily, every team.** If you are in two teams, your daily appears in both digests. You write it once.
- **One daily per organization.** If you belong to two organizations that use Standcast, you write one daily for each. The CLI and the MCP tools ask which one, or take `--org` / `org`.
- **Changing the file.** Standcast reloads `standcast.yml` on every push to the default branch of the `.github-private` or `.github` repository, force pushes included. `.github-private` wins when it has the file. If a push makes the file invalid, Standcast keeps using the last valid version until you fix it: digests still go out, and drafts and submissions still work. Deleting the file switches Standcast off for the organization. Without a valid version in use, drafts and submissions get `org_not_configured`. See [Install](/admin/install#configuration-states).
- **Checking the file before it lands.** When a push to any branch of `.github-private` or `.github` touches `standcast.yml`, or a pull request in one of them changes it, Standcast creates a check run named `Standcast config` in that repository. In a public repository, identity overrides under `members` fail the check. See [Install](/admin/install#configuration-states).
