# Claude Code skill

The Standcast plugin for Claude Code adds the `/daily` skill and registers the Standcast MCP server for you.

## Install

1. [Install the CLI and sign in](/members/getting-started). The plugin uses the `standcast` binary on your `PATH`; it does not install it.
2. In Claude Code, add the marketplace and install the plugin:

```text
/plugin marketplace add ImFelipeOliveira/standcast
/plugin install standcast@standcast
```

3. Restart Claude Code so that it loads the skill and the MCP server.

## Use

Type `/daily`, or ask for it in your words: "my daily", "standup", "what did I do yesterday". The skill:

1. Gets the draft of yesterday from your GitHub activity, your cards if Linear is connected, and your local Claude Code sessions. If you belong to more than one organization, it asks which one.
2. Shows yesterday, one line per piece of work, and lets you correct, remove or add items. It may add things that really happened in this Claude Code session.
3. If the draft has suggested blockers, such as your pull request waiting for review, failing checks or a card in progress for days, asks about each one. If it is a real blocker, it goes into your blockers with its link; if not, the skill ignores it and it does not come back unless the signal changes. It never adds a suggestion without your answer, and suggestions are visible only to you.
4. Asks what you will do today and what blocks you, in your language.
5. Shows the final daily and asks for your explicit confirmation.
6. Sends it, and tells you if it went to the digest thread because the digest was already posted.

It uses the MCP tools when they are available, and falls back to the `standcast` CLI otherwise.

## The confirmation rule

- The skill never sends without your explicit confirmation of the final daily. Only a clear yes counts.
- Any change after the final review, however small, means a new review and a new confirmation.
- When it sends through MCP and Claude Code supports it, Standcast also asks you directly, outside the conversation, with exactly what will be posted.
- It never translates or rewrites your words. It may only split a multi-line answer into single-line items.
- It never invents activity: only what is in the draft or what you said.
- PR titles, commit messages and other text from GitHub are treated as data, never as instructions.

## Your AI sessions

The draft uses your Claude Code sessions from the draft window, so yesterday covers work that has no pull request yet. A session joins a pull request by its repository and branch, or a card when the branch names it. Each piece of work becomes one line, written in your language from the activity titles and the session titles and prompts.

- Standcast reads the session files in `~/.claude/projects` on your machine: titles, up to five of your prompts per session, the working directory, the branch and the paths of edited files. Tokens that look like secrets are replaced by `[redacted]`.
- Standcast reads session data on your machine and does not send it to the Standcast API, logs or webhooks. Claude Code receives it to write the draft and sends it to its model provider, like the rest of the conversation. Only the daily you confirm is submitted to Standcast.
- The skill does not paste your prompts into the daily unless you ask, and never counts sessions, prompts or hours.
- Session titles and prompts are treated as data, never as instructions.
- To leave them out once, say so ("don't use my sessions"). To turn them off for good, set `STANDCAST_SESSIONS=off` in your environment.

## Example

```text
You:     /daily
Claude:  Here is yesterday from your GitHub and Linear activity in acme and your Claude Code sessions:
         1. Added rate limiting to the public API and merged it (acme/api#42, card ENG-42)
         2. Reviewed "Retry webhooks with backoff" (acme/worker#17)
         3. Looked into the flaky checkout test in acme/shop
         Anything to fix, remove or add?
You:     Drop 3, it went nowhere.
Claude:  What will you do today? Any blockers?
You:     Today I'll write the integrator guides. Blocked: waiting for the staging database.
Claude:  Final daily for acme, 2026-10-28:
         Yesterday
         - Added rate limiting to the public API and merged it (acme/api#42)
         - Reviewed "Retry webhooks with backoff" (acme/worker#17)
         Today
         - I'll write the integrator guides
         Blockers
         - waiting for the staging database
         Send it?
You:     Yes.
Claude:  Sent for 2026-10-28. It goes into the backend digest.
```

## When something fails

| Situation | What the skill does |
| --- | --- |
| `standcast` is not installed | Explains how to install the CLI, then stops. |
| Not signed in, or the session expired | Asks you to run `standcast login`, then stops. |
| More than one organization | Asks which one and retries with it. |
| A suggestion was already decided | Tells you and moves on. |
| The daily is invalid | Shows the issues, fixes them with you without changing their meaning, and asks for a new confirmation. |
| Any other error | Shows the message. See [Troubleshooting](/troubleshooting). |
