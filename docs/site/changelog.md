---
outline: [2, 3]
---

# Changelog

What changed in Standcast. Versions match the [GitHub releases](https://github.com/ImFelipeOliveira/standcast/releases). The API section follows the [versioning policy](/api/overview#versioning).

## Product

### Unreleased

- The documentation meets WCAG 2.2 AA in the light and dark themes: links in the text are underlined, focus shows a 2px ring, and text and code reach 4.5:1 contrast. The sidebar is grouped into Getting started, Members, Admin, API and Reference, install and setup examples show each option in its own tab, and every page has its own link preview image, a link to edit it on GitHub and the date it was last updated. The members page *Getting started* is now *Write your first daily*, at the same address.
- The landing at standcast.app has a new look in English and Portuguese: new colors that meet WCAG 2.2 AA in light and dark themes, a skip link, and a home page with a day with Standcast, what it does, three ways to write, integrations, privacy, configuration, pricing and FAQ. The wave in the background is now a calm pixel grid. It has a **Pause animation** button, stops when it is off screen or the tab is hidden, and shows a still frame when your system asks for reduced motion.
- The web app has its own sign-in page. Opening the app without a session shows it instead of jumping straight to GitHub, and **Continue with GitHub** brings you back to the page you asked for.
- When signing in fails (you cancel on GitHub, the link expires, GitHub does not confirm the account or the browser drops the session cookie), you return to the sign-in page with a message saying what happened and a **Try again** button, instead of an error page on the API.
- Web app addresses are in English: `/orgs/<id>/today`, `/history` and `/settings`. Old links to `/hoje`, `/historico` and `/configuracao` still work and keep their query string.
- The web app shows the Standcast icon in the browser tab.
- Stale blocker alert: with `signals.blocker_alert_days` set on a team, a blocker still open that many days after it was first reported gets one message in the team's channel or space after the digest, mentioning the team's managers, with the blocker, its link, its age, who reported it and who it was routed to. Each blocker is alerted once in each team. Without the key, nothing changes. See [Stale blocker alert](/how-it-works#stale-blocker-alert).
- The web app has a new look: higher contrast colors that meet WCAG 2.2 AA in light and dark themes, cards without borders, status shown as a colored dot with text, a page header that stays at the top and shrinks a little as you scroll, and on phones the side menu opens from a menu button.
- Google Chat: while someone in a team's digest is not linked to Google Chat and shows as `@login`, the digest ends with a **Link my account** button. A click links the person who clicked, by the same email match as a direct message to the app, and the answer is visible only to them. Mentioning the app in a space links the person the same way. The worker needs `PUBLIC_URL` for the button. See [Google Chat](/admin/google-chat#how-people-are-linked).
- New images from the Standcast brand kit: app icons, the Google Chat avatar and card banner, a light and dark README banner, social and link preview images, and five marketplace screenshots.

### 0.9.4 — 2026-11-12

- The `/daily` skill and the MCP server summarize yesterday in at most 5 lines, grouped by project or theme, instead of one line per pull request.
- On a workday, when the digest window closes before the digest is sent, the first daily submitted that day after the window queues the digest, with every daily sent so far. It is not queued again once the digest has used all its attempts, and a queued digest can still fail like any other. Before, that daily was stored but never posted.
- **Create the .github-private repository** in the web app opens GitHub's form with the organization as the owner, instead of your personal account. When the GitHub App only has access to selected repositories, the page also reminds you to add the new repository to the app.

### 0.9.3 — 2026-11-11

- The English messages of the Google Chat app and the web app point to Settings → Google Chat, the name of the page in English, instead of Configuration.
- The Google Chat app answers in spaces and direct messages when it is set up as a Google Workspace add-on, the mode Google now uses for new Chat apps.
- A personal account that installed the GitHub App no longer shows up in the organization list of the web app and the CLI for people who only collaborate on one of its repositories. Only the owner of the personal account sees it. They never had access to its data.

### 0.9.2 — 2026-11-08

### 0.9.1 — 2026-11-08

- The install guide sends you to `https://app.standcast.app/setup` after you install the GitHub App. `https://api.standcast.app/setup` only redirects there.
- The install command is `curl -fsSL https://standcast.app/install.sh | sh`. The same path on the API redirects there.
- The install script shows a progress bar while it downloads the CLI.

### 0.9.0 — 2026-11-08

- `managers` in `standcast.yml` accepts GitHub teams written `"@org/team-slug"`, alone or mixed with logins, so a public configuration repository does not need to list who manages each team. Manager access follows the team on GitHub within 5 minutes. A manager team that is missing, of another organization or too large gives manager access to nobody and shows a notice on the Settings page. When GitHub fails, the team gives manager access to nobody for a minute and the Settings page shows a notice. A blocker routed to the managers goes to up to five managers who can get it in chat, and when a manager team cannot be read and no listed manager can get it, it is sent again a few minutes later. Operators of their own GitHub App can subscribe it to the `Membership`, `Team` and `Organization` events so the API process that receives them applies changes sooner. A value in `members` that starts with `@` must now be a GitHub team written `"@org/team-slug"`, as in `managers`; anything else, such as `@alice`, is rejected instead of matching nobody. See [Configuration](/admin/configuration#managers).

### 0.8.2 — 2026-11-07

- The landing and the README no longer name beta testers.

### 0.8.1 — 2026-11-07

- Standcast reads `standcast.yml` from the private `.github-private` repository when it exists and has the file, and from `.github` otherwise, so organizations whose `.github` is public can keep the file private. Nothing changes when only `.github` has the file. The setup page links the file in the repository in use and offers to create `.github-private`. See [Where the file lives](/admin/configuration#where-the-file-lives).
- The `Standcast config` check fails when `standcast.yml` is in a public repository and has identity overrides under `members` (`linear`, `slack`, `google_chat`, `jira`), because they publish work emails and the login to email mapping. The setup page shows the same warning. The configuration in use does not change. Move the file to `.github-private`, make the repository private, or remove the overrides and use the default linking by the GitHub verified email and the Google Chat direct message. See [Identity mapping](/admin/configuration#identity-mapping).
- The landing and the README named Pigz and Usebill as the first beta testers.

### 0.8.0 — 2026-11-07

- The landing page and the docs list what is connected today (GitHub, Linear, Slack, Google Chat) and what is still to come (Jira, ClickUp, Asana, GitHub Projects, Microsoft Teams, Discord). See [Integrations](/integrations).
- The hosted service is at [standcast.app](https://standcast.app), with the app at [app.standcast.app](https://app.standcast.app), the docs at [docs.standcast.app](https://docs.standcast.app) and the API at [api.standcast.app](https://api.standcast.app). Support is support@standcast.app. The old API hostname `https://api-standcast.usefachada.dev` still serves the API, with no redirect, so an existing integration keeps its base URL.
- Setup lives in the web app. The API `/setup` redirects there.

### 0.7.0 — 2026-11-06

- The home page draws an animated field behind the hero.

### 0.6.0 — 2026-11-06

- The landing banner shows Google Chat, the agents and the public beta.

### 0.5.0 — 2026-11-06

- Google Chat: a team with `chat.provider: google-chat` gets the digest in a Google Chat space, late dailies in its thread, and reminders, routed blockers and suggested blockers by direct message, through the Standcast app for Google Chat. Add the app to a space, and an admin pastes the link code it posts in the web app (Settings → Google Chat) or on the setup page. People link themselves by sending the app a direct message once, or with `members.<login>.google_chat: users/<digits>` in `standcast.yml`. One organization can use Slack for one team and Google Chat for another. The app works in Google Workspace domains where it is available; a Google Workspace Marketplace listing is coming. See [Google Chat](/admin/google-chat).
- The `standcast.yml` template on the setup page has one team on Slack and one on Google Chat. Delete the one you do not use.
- In the web app, failed deliveries that any chat can cause no longer name Slack.
- A team with `chat.provider: google-chat` needs a space name (`spaces/...`) in `chat.channel`. Before, any text passed the `standcast.yml` check and the digest failed later with `space_not_linked`. When the value is the space link, the error tells you the name to use.
- When the Google Chat app finds no account for your email, or more than one, it also answers with your Google Chat id (`users/<digits>`), ready for an admin to put under `members.<login>.google_chat` in `standcast.yml`.

### 0.4.1 — 2026-11-02

- Documentation only: the 0.4.0 changelog entries. No product changes.

### 0.4.0 — 2026-11-02

- The daily draft can use your local AI sessions: `standcast draft --sessions`, the MCP `standcast_get_draft` tool (`includeSessions`, on by default) and the `/daily` skill read your Claude Code sessions on your machine and group them with your pull requests, cards and commits into `work`, so yesterday becomes one line per piece of work. Standcast never sends session data to its API; your AI client receives it and may send it to its model provider. Turn it off with `STANDCAST_SESSIONS=off`. See [Privacy](/privacy#your-ai-sessions-on-your-machine).
- The setup page warns when a team's Slack channel is missing or the bot is not in it; digest links no longer unfold into previews and show a short label (repo#123, FEL-12); a pull request opened and merged in the same window appears once in the draft.
- The web app is live at [app-standcast.usefachada.dev](https://app-standcast.usefachada.dev), starting with the setup screen. The server-rendered setup page still works.
- Today in the web app: one team on the current day, with open blockers and how long they have been open, support requests, today's dailies, what shipped yesterday and who sent today. Managers, admins and the author can resolve and reopen a blocker, and managers and admins can remind someone who has not sent yet. It shows no per-person metric and no history of who did not send. See [Web app](/admin/web-app).
- Support requests: an optional section of the daily for what you need from someone else without being blocked, such as a review, a decision or a pairing session. The `/daily` skill, the MCP server and the CLI ask for it after the blockers, and the digest shows it right after the blockers, with who asked. It is not routed by direct message.
- The digest and the late daily label their sections with emoji so they read faster in Slack: 📅 title, 🗓️ Yesterday, 🎯 Today, 🚧 Blockers, 🤝 Support requests and ⏳ for who did not send. The confirmation shown before sending a daily uses the same labels.

### 0.3.1 — 2026-11-01

- The documentation site publishes `robots.txt` and a `sitemap.xml`, and the landing page serves its own fonts.

### 0.3.0 — 2026-11-01

- Standwise is now **Standcast**: new name, CLI binary `standcast`, config file `standcast.yml`, `STANDCAST_*` environment variables, `Standcast-*` webhook headers, `sc_`/`sck_` token prefixes and new URLs (`api-standcast.usefachada.dev`, `docs-standcast.usefachada.dev`). Existing sessions and API keys stop working: sign in again and create new keys.
- Landing page at [standcast.usefachada.dev](https://standcast.usefachada.dev), in English and Portuguese, with a form to join the public beta. After sending it you land on the install guide.
- Documentation for AI agents: `llms.txt`, `llms-full.txt` and a Markdown copy of every page, in English and Portuguese. The api serves its own `llms.txt` with links to the OpenAPI document and the API guides.
- The privacy page explains what the beta form stores and for how long.
- CODEOWNERS files are parsed in linear time.

### 0.2.1 — 2026-10-31

- Release tooling only: versions match the GitHub releases everywhere. No product changes.

### 0.2.0 — 2026-10-31

First public beta.

- Hardening:
  - The setup page shows a notice when a GitHub team in `standwise.yml` cannot be found or is too large (only the first 5,000 members are used).
  - **Sign out** on the setup page ends the web session.
  - Pull request links are matched without regard to letter case, so a blocker is not routed twice for the same pull request.
  - Reviews, timeline events and check runs are read page by page from GitHub, so large pull requests are no longer cut short.
  - The health check is bounded and does not pile up queries when the database is slow.
  - The installer works with BusyBox shells.
  - A stale Slack identity is removed automatically when Slack answers `user_not_found` or `user_disabled`. The person signs in again to relink.

- Documentation site in English and Portuguese, with the product overview, guides for admins and members, the `standwise.yml` reference and the API guides.
- Claude Code plugin with the `/daily` skill and the bundled MCP server.
- `standwise mcp`: local MCP server with draft and confirmed submit tools, plus read tools for managers and admins.
- `standwise` CLI: `login`, `logout`, `whoami`, `draft`, `submit` and `suggestion`.
- Team digest in Slack at `digest_at`, with late dailies in the thread.
- Setup page: configuration state, Slack connection, failed deliveries, API keys and webhooks.
- Reminders by direct message at `remind_at`, once per person per day. `remind_at` must be before `digest_at`.
- Blocker routing by direct message: reviewers, then CODEOWNERS, then managers.
- Suggested blockers for pull requests without review and failing CI, visible only to the person, with `signals.direct_message` to also get them by direct message.
- `Standwise config` check run on changes to `standwise.yml`.
- Retention: webhook delivery logs after 30 days, resolved suggestions after 90 days, expired sessions removed.
- English is the default language when none is set.
- Linear integration: an admin connects one Linear workspace per installation on the setup page (OAuth app acting as itself, read-only scope `read`, encrypted tokens refreshed automatically). **Deploy requirement:** the api and the worker now need `LINEAR_CLIENT_ID` and `LINEAR_CLIENT_SECRET`, and fail to start without them.
- `tracker: { provider: linear, team: <KEY> }` per team and `members.<login>.linear` (email); people are also linked by their GitHub email. `tracker.provider: jira` is accepted with a setup notice.
- Your own Linear cards (`card_started`, `card_done`) in the draft, and card blockers routed to the assignees of the blocking cards, then the card's assignee, its creator or the managers.
- Suggested blocker `card_stale` for cards in progress for `signals.card_stale_days` (default 5), visible only to the person.

## API

<!--@include: ../api/CHANGELOG.md{3,}-->
