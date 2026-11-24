# Production report

The production report tells sales and support what reached production, in plain language. Standcast posts it to a Slack channel or a Google Chat space chosen for each team, usually the sales or support one. It lists new features and fixes, with no person's name.

The text is rewritten by DeepSeek for people who do not read code. You need a DeepSeek key for that. Without one, the report still goes out with the raw pull request titles.

## What counts as production

Each team has a production branch, `main` by default. When a push reaches that branch, Standcast records the pull requests behind it and when the push reached Standcast. That time is the **Live since** date in the report.

- Only pushes that arrive after you turn the report on are recorded. Nothing from before is reported.
- A pull request merged into `dev` is not in the report until it reaches the production branch.
- A report covers the time since the previous report, up to 60 seconds before it runs, so a push still being recorded is not missed.
- Only pull requests by members of the team are listed. GitHub teams count.
- Reverts by people outside the team, such as whoever is on call, are also considered: the team item they revert drops out of the report, or goes under **Removed** when it was already reported. Their other pull requests are not listed.
- When nothing new reached production, nothing is posted.
- A report that fails loses no items: the next one picks them up.

## 1. Set the DeepSeek key

An organization admin does this once for the organization. In the [web app](/admin/web-app), open **Settings → Reports** (`/orgs/<id>/settings/reports`).

1. Create an API key in your DeepSeek account.
2. Paste it in the key field and choose the model. The default is `deepseek-chat`.
3. Save.

The key is write only. The panel shows its last four characters. If DeepSeek rejects the key with a 401, the panel flags it and reports use the raw titles until you replace it. Only a 401 marks the key as rejected; other DeepSeek errors only send the affected items raw.

When a key is set, Standcast sends DeepSeek the title and description of each pull request, and the title and description of its linked Linear card. Raw pull request bodies and card descriptions are never stored. The rewritten items are stored for 90 days.

## 2. Set up a team's report

Organization admins and the team's managers set each team's report in the same tab.

| Setting | What it does |
| --- | --- |
| On or off | Turns the report on for the team. |
| Channel | The Slack channel or Google Chat space that gets the report. It uses the team's `chat.provider` from `standcast.yml`. |
| Weekday | The day the report is posted. |
| Time | The time of day, in the team's time zone. |
| Production branch | The branch that means "in production". Default `main`. |

Saving checks the channel and shows a warning when it cannot post there:

- Slack: add the Standcast bot to the channel.
- Google Chat: the space must be linked to your organization. See [Google Chat](/admin/google-chat).

A team removed from `standcast.yml` keeps its settings, but its report stops.

## What the report looks like

The main message is a short list, one line per item, with links to the pull request and the card. Each item also gets a reply in the thread with details. The text is in the team's language.

| Section | Contents |
| --- | --- |
| New | What changes, who it is for, where to find it, and a ticket link. |
| Fixed | The problem, who was affected, what the customer needs to do, and a ticket link. |
| Removed | Shown only when something already reported was reverted. Lists the item, its **Removed since** date and the revert pull request. |

Every item has a title, the **Live since** date and its links. A detail is left out when the pull request and the card do not say it.

- Pull requests that link the same Linear card are one item.
- A revert of something already reported goes under **Removed**.
- A feature and its revert in the same report both disappear.
- A **Ticket** link is kept only when it is an http(s) URL that appears in the pull request or card text and is not already one of the item's links. It is kept intact, so a long ticket id is not cut.
- A long report continues in more messages.

## What is left out

- Internal changes: titles that start with `chore`, `ci`, `build`, `test`, `docs`, `style` or `refactor`, pull requests by bots, and items the model classifies as internal.
- Customer identifiers. The model is told not to include customer names, people's names, usernames or account IDs. Standcast also removes emails, runs of 8 or more digits with separators (phones, account numbers; ISO dates are kept) and @mentions from the text. Ticket links are kept intact instead: a ticket link is left out when it has an email, a user name or password, or contact data in its query or fragment.
- Any person's name or login, and any count per person.

## If DeepSeek fails

Each item is rewritten on its own. If one answer fails, or no key is set, that item goes out with the raw pull request title, with no details. It is **Fixed** when a title starts with `fix`, `fixes`, `fixed`, `hotfix` or `bugfix`, or when the pull request or the card has the `bug` label, and **New** otherwise. The report is never blocked.

## Tip: a "For the customer" section

Add a section to your pull request template, for example "For the customer", where the author says in one or two sentences what changes for the customer. The model works only from what the pull request and card say, so the report gets better when that text exists.
