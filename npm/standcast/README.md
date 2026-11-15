# Standcast

Write your daily standup in your AI agent. Standcast drafts yesterday from your GitHub activity, Linear cards and local Claude Code sessions, sends the daily only after you confirm it, and posts one digest per team to Slack or Google Chat.

This package installs the `standcast` command: the CLI and its MCP server.

## Use it

```sh
npx -y standcast login
```

Then add the MCP server to your client:

```json
{ "mcpServers": { "standcast": { "command": "npx", "args": ["-y", "standcast", "mcp"] } } }
```

Ask your agent for your daily. See the [MCP server guide](https://docs.standcast.app/members/mcp) for Claude Desktop, Cursor, VS Code and Codex.

## Platforms

macOS (Apple silicon and Intel), Linux (x64 and arm64) and Windows (x64). npm installs only the binary for your platform, from `@standcast/cli-<platform>-<arch>`.

## Links

- Site: https://standcast.app
- Docs: https://docs.standcast.app
- Source: https://github.com/ImFelipeOliveira/standcast

MIT license.
