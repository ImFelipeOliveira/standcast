# How it works

> From your work to one team digest. Standcast drafts your daily from GitHub and Linear, you confirm it in your AI agent or the terminal, and each team gets one digest in Slack or Google Chat at the time it chose. [Jira, ClickUp and others are coming.](https://standcast.app/#integrations)

## A day with Standcast

Set two times in standcast.yml. Standcast runs the rest. This team has `remind_at: "09:30"` and `digest_at: "10:00"` in São Paulo time, Monday to Friday.

- **08:50, draft.** Ana runs /daily. She edits the draft, adds a blocker that links a pull request and confirms. The reviewer gets a direct message.
- **09:30, remind_at.** Davi hasn't written yet, so he gets one reminder. Never more than one a day.
- **10:00, digest_at.** One digest per team in #daily-backend: blockers first, then updates, then who hasn't sent.
- **10:40, late.** Davi sends late. His daily goes in the digest thread, so nobody misses it.

## What it does

Collects, consolidates and delivers. You only write.

- **A draft from real work.** Pull requests opened, merged and reviewed, commits by repository, and Linear cards that started or finished. Monday covers the weekend.
- **Blockers reach who can help.** A blocker that links a pull request goes to its reviewers, then CODEOWNERS, then the team managers. A Linear card goes to the owner of the blocking card.
- **Nothing sent without you.** The MCP submit tool needs `confirmed: true`, which the agent passes only after you approve the text.
- **Several teams, one daily.** Write once and appear in every team digest you belong to, each in its own time zone and workdays.
- **Managers read from their agent.** Team digests, dailies and blockers for the last 90 days, through MCP read tools. Confirmed content only.
- **API and webhooks.** Read-only API keys with scopes, an OpenAPI reference, and signed `daily.submitted` and `blocker.opened` webhooks.

## Configuration as code

One file in your .github repository. Teams, times, chat channels and managers live in `standcast.yml`. Every change is reviewed like code.

- **Checked on every push.** A `Standcast config` check run points to the line with the error.
- **Never breaks the team.** An invalid push keeps the last valid config in effect.
- **Teams from GitHub.** Members can be logins or `@org/team`.

```yaml
# .github/standcast.yml
teams:
  - name: Backend
    timezone: America/Sao_Paulo
    workdays: [mon, tue, wed, thu, fri]
    remind_at: "09:30"
    digest_at: "10:00"
    chat:
      provider: slack
      channel: "#daily-backend"
    tracker:
      provider: linear
      team: BE
    managers: [bruno]
    members: ["@acme/backend"]
```

[standcast.yml reference](https://docs.standcast.app/admin/configuration)

## Three ways to write

Pick the one that fits how you work.

### Claude Code plugin

The `/daily` skill drafts, asks for today and blockers, and confirms with you.

```text
/plugin marketplace add \
  ImFelipeOliveira/standcast
/plugin install standcast@standcast
/daily
```

### Any MCP client

Cursor, Codex, Claude Desktop and VS Code run the local [MCP server](https://docs.standcast.app/members/mcp).

```json
{
  "mcpServers": {
    "standcast": {
      "command": "standcast",
      "args": ["mcp"]
    }
  }
}
```

### Terminal

One binary for macOS, Linux and Windows, checked against SHA256SUMS.

```sh
standcast login
standcast draft
standcast submit
```

## More about Standcast

- [Home](https://standcast.app/index.md)
- [Privacy](https://standcast.app/privacy/index.md)
- [Pricing](https://standcast.app/pricing/index.md)
- [FAQ](https://standcast.app/faq/index.md)
- [Join the beta](https://standcast.app/beta/index.md)
- [Terms of use](https://standcast.app/terms/index.md)
- [Versão em português](https://standcast.app/pt-BR/como-funciona/index.md)

Support: support@standcast.app
