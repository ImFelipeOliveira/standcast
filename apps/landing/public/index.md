# Standcast: your daily standup, written in your AI agent

> Open source (MIT), free during the public beta. Works with GitHub and Slack today. Google Chat and Jira are next.

Standcast is an open source daily standup tool for software teams. Run `/daily` in Claude Code, Cursor or the terminal. Standcast drafts yesterday from your GitHub and Linear activity, you confirm, and your team gets one digest in Slack.

```sh
curl -fsSL https://api-standcast.usefachada.dev/install.sh | sh
```

- [Join the beta](https://standcast.usefachada.dev/beta/)
- [Install for your org](https://docs-standcast.usefachada.dev/admin/install)
- [Documentation](https://docs-standcast.usefachada.dev/)
- [GitHub](https://github.com/ImFelipeOliveira/standcast)
- [Versão em português](https://standcast.usefachada.dev/pt-BR/index.md)

Write your daily where you already work: Claude Code, Cursor, Codex, Claude Desktop, VS Code and the terminal.

## A day with Standcast

Set two times in standcast.yml. Standcast runs the rest. This team has `remind_at: "09:30"` and `digest_at: "10:00"` in São Paulo time, Monday to Friday.

- **08:50, draft.** Ana runs /daily. She edits the draft, adds a blocker that links a pull request and confirms. The reviewer gets a direct message.
- **09:30, remind_at.** Davi hasn't written yet, so he gets one reminder. Never more than one a day.
- **10:00, digest_at.** One digest per team in #daily-backend: blockers first, then updates, then who hasn't sent.
- **10:40, late.** Davi sends late. His daily goes in the digest thread, so nobody misses it.

[See how it works](https://standcast.usefachada.dev/how-it-works/index.md)

## Privacy

Built for teams, not for watching people. Standcast suggests blockers from your own signals. Those suggestions belong to you. A test in CI checks that they never leave your draft.

No productivity metrics. No rankings. No commit counts. Nothing sent on anyone's behalf.

[Read how privacy works](https://standcast.usefachada.dev/privacy/index.md)

## Three ways to write

The Claude Code plugin, any MCP client or the terminal. Pick the one that fits how you work.

[Ways to write](https://standcast.usefachada.dev/how-it-works/index.md)

## Pricing

Free during the public beta. Pricing will be announced before the beta ends.

[See pricing](https://standcast.usefachada.dev/pricing/index.md)

## FAQ

What the GitHub App reads, what you need, who sees suggested blockers and whether you can self-host.

[Read the FAQ](https://standcast.usefachada.dev/faq/index.md)

## Public beta

Try it with your team. We're looking for teams of 3 to 15 people on GitHub and Slack. We'll help you set it up. [Request beta access](https://standcast.usefachada.dev/beta/)

Support: support.standcast@usefachada.dev
