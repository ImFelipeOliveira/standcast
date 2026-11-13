# Write your first daily

Send your first daily in a few minutes. Before you start, your admin must have [installed Standcast](/admin/install) and listed you in a team in `standcast.yml`.

## 1. Install the CLI

The `standcast` CLI is a single binary. It also runs the MCP server and is what the Claude Code skill calls.

Download the binary for your system from the [latest release](https://github.com/ImFelipeOliveira/standcast/releases/latest):

| System | File |
| --- | --- |
| macOS, Apple silicon | `standcast-bun-darwin-arm64` |
| macOS, Intel | `standcast-bun-darwin-x64` |
| Linux, x64 | `standcast-bun-linux-x64` |
| Linux, ARM64 | `standcast-bun-linux-arm64` |
| Windows, x64 | `standcast-bun-windows-x64.exe` |

On macOS or Linux, the install script downloads the right binary, checks it against the release's `SHA256SUMS` file and installs it to `~/.local/bin/standcast`. To install by hand, download the binary and `SHA256SUMS`, check the binary's hash and put it on your `PATH` as `standcast`; the manual tab shows it for a Mac with Apple silicon and installs nothing if the hash does not match. On Linux, use `sha256sum -c` instead of `shasum -a 256 -c`.

::: code-group

```bash [Install script]
curl -fsSL https://standcast.app/install.sh | sh
```

```bash [Manual, Mac with Apple silicon]
mkdir -p ~/.local/bin
cd "$(mktemp -d)"
curl -fsSLO https://github.com/ImFelipeOliveira/standcast/releases/latest/download/standcast-bun-darwin-arm64
curl -fsSLO https://github.com/ImFelipeOliveira/standcast/releases/latest/download/SHA256SUMS
grep ' standcast-bun-darwin-arm64$' SHA256SUMS | shasum -a 256 -c \
  && install -m 755 standcast-bun-darwin-arm64 ~/.local/bin/standcast \
  && standcast --version
```

:::

## 2. Sign in

```bash
standcast login
```

The CLI shows a code and opens GitHub in your browser. Enter the code and authorize Standcast. The CLI then prints "Signed in as" and your login.

Signing in also links you to your Slack user, so that the digest can mention you. If your admin connects Slack or changes `standcast.yml` after you sign in, run `standcast login` again. If your team uses Google Chat, also link your Google Chat user once: click **Link my account** under your team's digest in Google Chat, mention the Standcast app in a space, or send the app a direct message. To get reminders by direct message, send the app a direct message once anyway: Google Chat lets the app message you only after that. See [Google Chat](/admin/google-chat#how-people-are-linked).

Check who you are and which organizations you can write dailies for:

```bash
standcast whoami
```

```json
{"login":"alice","orgs":[{"installationId":12345678,"login":"acme"}]}
```

## 3. Write your daily

Pick the way that fits your tools:

- **Claude Code:** install the plugin and run `/daily`. See [Claude Code skill](/members/claude-code).
- **Cursor, Codex, Claude Desktop, VS Code or another MCP client:** add `standcast mcp` to your client and ask for your daily. See [MCP server](/members/mcp).
- **Only the terminal:** use `standcast draft` and `standcast submit`. See [CLI](/members/cli).

In every case, the flow is the same:

1. Standcast builds a draft of yesterday from your GitHub activity since your last daily, plus your own Linear cards if your organization connected Linear.
2. You fix yesterday, then write today, any blockers and, if you need something from someone, a support request.
3. You see the final daily and confirm it. Nothing is sent before that.

## 4. After you send it

- Your daily is stored for today's standup date. If you send again the same day, the new version replaces the old one.
- At the team's `digest_at`, your daily appears in the digest of every team you are in.
- If the digest already went out, your daily is posted as a reply in the digest thread, and the result says `late: true`.
- Webhooks registered by your admin receive a `daily.submitted` event, with your support requests in it, and a `blocker.opened` event for each new blocker.

Something went wrong? See [Troubleshooting](/troubleshooting).
