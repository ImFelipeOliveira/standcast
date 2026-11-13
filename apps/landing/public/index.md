# Standcast: your daily standup, written in your AI agent

> Open source (MIT), free during the public beta. GitHub, Linear, Slack and Google Chat today. Jira, ClickUp and others are coming.

Standcast is an open source daily standup tool for software teams. Run `/daily` in Claude Code, Cursor or the terminal. Standcast drafts yesterday from your GitHub and Linear activity, you confirm, and your team gets one digest in Slack or Google Chat.

```sh
curl -fsSL https://standcast.app/install.sh | sh
```

- [Join the beta](https://standcast.app/beta/)
- [Install for your org](https://docs.standcast.app/admin/install)
- [Documentation](https://docs.standcast.app/)
- [GitHub](https://github.com/ImFelipeOliveira/standcast)
- [Versão em português](https://standcast.app/pt-BR/index.md)

Write your daily where you already work: Claude Code, Cursor, Codex, Claude Desktop, VS Code and the terminal.

## A day with Standcast

Set two times in standcast.yml. Standcast runs the rest. This team has `remind_at: "09:30"` and `digest_at: "10:00"` in São Paulo time, Monday to Friday.

- **08:50, draft. Ana runs /daily.** She edits the draft, adds a blocker that links a pull request and confirms. The reviewer gets a direct message.
- **09:30, remind_at. Davi gets one reminder.** He hasn't written yet. Never more than one reminder a day.
- **10:00, digest_at. The digest arrives.** One per team in #daily-backend: blockers first, then updates, then who hasn't sent.
- **10:40, late. Davi sends late.** His daily goes in the digest thread, so nobody misses it.

[See how it works](https://standcast.app/how-it-works/index.md)

## What it does

Collects, consolidates and delivers. You only write.

- **A draft from real work.** Pull requests opened, merged and reviewed, commits by repository, and Linear cards that started or finished. Monday covers the weekend.
- **Blockers reach who can help.** A blocker that links a pull request goes to its reviewers, then CODEOWNERS, then the team managers. A Linear card goes to the owner of the blocking card.
- **Nothing sent without you.** The MCP submit tool needs `confirmed: true`, which the agent passes only after you approve the text.
- **Several teams, one daily.** Write once and appear in every team digest you belong to, each in its own time zone and workdays.
- **Managers read from their agent.** Team digests, dailies and blockers for the last 90 days, through MCP read tools. Confirmed content only.
- **API and webhooks.** Read-only API keys with scopes, an OpenAPI reference, and signed `daily.submitted` and `blocker.opened` webhooks.

## Three ways to write

Pick the one that fits how you work: the Claude Code plugin, any MCP client or the terminal.

- **Claude Code plugin.** The `/daily` skill drafts, asks for today and blockers, and confirms with you.
- **Any MCP client.** Cursor, Codex, Claude Desktop and VS Code run the local [MCP server](https://docs.standcast.app/members/mcp).
- **Terminal.** One binary for macOS, Linux and Windows, checked against SHA256SUMS.

## Integrations

GitHub builds the draft. Your chat gets the digest. A tracker adds your cards. Each team picks its own chat, and Linear is optional.

- **GitHub** (draft). Pull requests, reviews and commits in the draft. An organization installs Standcast as a GitHub App.
- **Linear** (optional tracker). Your cards show in the draft, and a card blocker goes to the people who own the blocking card.
- **Slack** (chat). One digest per team, late dailies in the thread, one reminder and direct messages.
- **Google Chat** (chat). The same digest in a space, through the Standcast app.

Coming: Jira, ClickUp, Asana, GitHub Projects, Microsoft Teams and Discord. Not connected yet, so Standcast reads nothing from them.

## Privacy

Built for teams, not for watching people. Standcast suggests blockers from your own signals. Those suggestions belong to you. A test in CI checks that they never leave your draft.

No productivity metrics. No rankings. No commit counts. Nothing sent on anyone's behalf.

[Read how privacy works](https://standcast.app/privacy/index.md)

## Configuration as code

One file in your .github-private repository, or in .github when .github-private has no `standcast.yml`. Teams, times, chat channels and managers live in that file. Every change is reviewed like code.

- **Checked on every push.** A `Standcast config` check run points to the line with the error.
- **Never breaks the team.** An invalid push keeps the last valid config in effect.
- **Teams from GitHub.** Members can be logins or `@org/team`.

[standcast.yml reference](https://docs.standcast.app/admin/configuration)

## Pricing

Free during the public beta. Pricing will be announced before the beta ends. Standcast is open source under the MIT license, so you can also [host it yourself](https://github.com/ImFelipeOliveira/standcast#self-hosting).

[See pricing](https://standcast.app/pricing/index.md)

## FAQ

Before you install. Another question? Write to support@standcast.app or read the [documentation](https://docs.standcast.app/).

- **Does Standcast read our code?** No. The GitHub App reads pull requests, reviews, checks, commit metadata, standcast.yml and CODEOWNERS. It never reads source files.
- **Can my manager see my suggested blockers?** No. Suggestions are visible only to you, in your own draft. They never reach the digest, the API, webhooks or managers.
- **Can Standcast send a daily for me?** No. The MCP submit tool needs `confirmed: true`, which the agent passes only after you approve the text.
- **What do I need?** A GitHub organization or personal account, and a Slack workspace or Google Chat in Google Workspace. Linear is optional.
- **Can we self-host?** Yes. Standcast is MIT licensed. The [self-hosting section of the README](https://github.com/ImFelipeOliveira/standcast#self-hosting) covers the API, the worker and Postgres.

[All questions](https://standcast.app/faq/index.md)

## Public beta

Try it with your team. We're looking for teams of 3 to 15 people on GitHub and Slack or Google Chat. We'll help you set it up. [Request beta access](https://standcast.app/beta/)

[Terms of use](https://standcast.app/terms/index.md)

Support: support@standcast.app
