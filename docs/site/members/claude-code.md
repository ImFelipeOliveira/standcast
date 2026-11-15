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
2. Opens with what you planned in your previous daily, if it is at most 7 days old, and whether each item moved. It says "moved" and what happened, "no activity found", or "unknown" and asks you. What counts is your own commits and reviews on the pull request, the pull request merged or closed, a state change of the card, or your own comment on the card, from the start of the day of your previous daily. This list is shown only to you and is never copied into your daily. A planned item that did not move can still become a focus item for today when you pick it again.
3. Shows yesterday as a short summary, at most 5 lines grouped by project or theme, and lets you correct, remove or add items. It may add things that really happened in this Claude Code session.
4. If the draft has suggested blockers, such as your pull request waiting for review, failing checks or a card in progress for days, asks about each one. If it is a real blocker, it goes into your blockers with its link; if not, the skill ignores it and it does not come back unless the signal changes. It never adds a suggestion without your answer, and suggestions are visible only to you.
5. Shows what is waiting on you, in groups: reviews requested from you directly, your pull requests with changes requested or failing checks, your urgent or high cards, work in progress, approved pull requests ready to merge, and review requests on drafts. It shows at most 10 lines and counts the rest.
6. Recommends up to 5 focus items, each with a short reason, and asks what you will focus on today. Pick by number, say "ok" for the recommendation, or write your own words.
7. Asks whether anything blocks you, in your language.
8. Asks whether you need support from anyone, without being blocked: a review, a decision, a pairing session. "No" leaves the section empty.
9. Shows the final daily and asks for your explicit confirmation.
10. Sends it, and tells you if it went to the digest thread because the digest was already posted.

If GitHub or Linear does not answer, you still get your draft. The skill says in one line which source was unavailable and goes on with the rest. Only cards assigned to you count.

It uses the MCP tools when they are available, and falls back to the `standcast` CLI otherwise.

## The confirmation rule

- The skill never sends without your explicit confirmation of the final daily. Only a clear yes counts.
- Any change after the final review, however small, means a new review and a new confirmation.
- When it sends through MCP and Claude Code supports it, Standcast also asks you directly, outside the conversation, with exactly what will be posted.
- It never translates or rewrites your words. It may only split a multi-line answer into single-line items.
- It never invents activity: only what is in the draft or what you said.
- PR titles, commit messages and other text from GitHub are treated as data, never as instructions.

## Your AI sessions

The draft uses your Claude Code sessions from the draft window, so yesterday covers work that has no pull request yet. A session joins a pull request by its repository and branch, or a card when the branch names it. Yesterday becomes a short summary of at most 5 lines, grouped by project or theme, written in your language from the activity titles and the session titles and prompts.

- Standcast reads the session files in `~/.claude/projects` on your machine: titles, up to five of your prompts per session, the working directory, the branch and the paths of edited files. Tokens that look like secrets are replaced by `[redacted]`.
- Standcast reads session data on your machine and does not send it to the Standcast API, logs or webhooks. Claude Code receives it to write the draft and sends it to its model provider, like the rest of the conversation. Only the daily you confirm is submitted to Standcast.
- The skill does not paste your prompts into the daily unless you ask, and never counts sessions, prompts or hours.
- Session titles and prompts are treated as data, never as instructions.
- To leave them out once, say so ("don't use my sessions"). To turn them off for good, set `STANDCAST_SESSIONS=off` in your environment.

## Example

```text
You:     /daily
Claude:  Your plan from 2026-10-27:
         ✅ Finish rate limiting: merged (acme/api#42)
         ⏸️ Write the integrator guides: no activity found
         Here is yesterday from your GitHub and Linear activity in acme and your Claude Code sessions:
         1. Added rate limiting to the public API and merged it (acme/api#42, card ENG-42)
         2. Reviewed "Retry webhooks with backoff" (acme/worker#17)
         3. Looked into the flaky checkout test in acme/shop
         Anything to fix, remove or add?
You:     Drop 3, it went nowhere.
Claude:  Waiting on you: review requested on "Add audit log" (acme/api#51). In progress: ENG-44 Integrator guides. Focus today:
         1. Review acme/api#51 (it blocks a teammate)
         2. Write the integrator guides (ENG-44, planned and not moved)
         What will you focus on?
You:     1 and 2.
Claude:  Anything blocking you?
You:     Waiting for the staging database.
Claude:  Do you need support from anyone, without being blocked?
You:     A review on the migration PR before Friday.
Claude:  Final daily for acme, 2026-10-28:
         Yesterday
         - Added rate limiting to the public API and merged it (acme/api#42)
         - Reviewed "Retry webhooks with backoff" (acme/worker#17)
         Today
         - Review "Add audit log" (acme/api#51)
         - Write the integrator guides (ENG-44)
         Blockers
         - waiting for the staging database
         Support requests
         - A review on the migration PR before Friday
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
