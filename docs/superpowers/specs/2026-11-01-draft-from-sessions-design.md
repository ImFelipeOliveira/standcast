# Draft from AI sessions

## Why

The draft today lists GitHub activity and Linear cards. Much real work never becomes a commit on the day it happens: investigation, debugging, writing a spec, reviewing a design. People who work with an AI agent already have that record in their agent sessions. Felipe (2026-11-01): the draft must **cross-reference pull requests, cards and sessions** to build the daily, and this ships in phase 2 right after 2a.

## What it is

When the person runs `/daily` (skill), the MCP `standcast_get_draft` tool or `standcast draft`, Standcast also reads the person's **local** Claude Code sessions since the start of the draft window and merges everything into **work items**: one item per piece of work, carrying its pull request, its card and the sessions that worked on it. The agent then writes "yesterday" from those items, and the person edits and confirms as today.

## Goals

- One draft item per piece of work instead of three separate lists.
- Work with no PR or card still shows up (grouped by project).
- Nothing from a session leaves the machine unless the person confirms text derived from it in their daily.

## Non-goals

- Cursor, Codex or other agents (later readers behind the same interface).
- Sending sessions, prompts, file paths or summaries to the server, ever.
- Any server-side storage of session data, and anything visible to managers.

## Anti-goals

- Counting sessions, hours, prompts or tokens per person, or showing "time spent". The draft lists work, not effort.

## Decisions

**Felipe's calls (2026-11-01):** sessions are read locally; only confirmed daily text reaches the server; cross-reference sessions → repository and branch → pull request → card; ships right after 2a.

**Claude's calls:**

### Reading sessions (CLI, local only)

- Source: `~/.claude/projects/*/*.jsonl` (override with `STANDCAST_CLAUDE_DIR` for tests). A session is the set of lines sharing one `sessionId`.
- Only lines of `type` `user`, `assistant` and `ai-title` with a `timestamp` inside the draft window (`since` from the server draft until now) are read. Each session yields `{ id, title, cwd, branch, startedAt, endedAt, prompts, files }`:
  - `title`: the last `ai-title` value, else the first user prompt cut to 120 characters.
  - `cwd` and `branch`: the most frequent `cwd` and `gitBranch` among the session's lines.
  - `prompts`: up to 5 user prompts typed by the person (skip tool results, hook output, slash-command expansions and anything inside `<system-reminder>`-style tags), each cut to 300 characters.
  - `files`: up to 20 distinct file paths from assistant `tool_use` blocks named `Edit`, `Write`, `MultiEdit` or `NotebookEdit`, made relative to `cwd`.
- Sessions with no user prompt in the window are skipped. Files bigger than 50 MB are skipped. Unreadable or malformed lines are skipped silently; the reader never throws.
- Repository: `git -C <cwd> remote get-url origin`, normalized to `owner/repo` for GitHub URLs (https or ssh). No remote or not a git directory → the session keeps only `cwd` (project = the folder name).
- Secrets: prompts and titles go through a redaction pass before leaving the reader: tokens that look like API keys or secrets (`sk-…`, `ghp_…`, `gho_…`, `xox…-`, `sck_…`, `sc_…`, AWS keys, long base64/hex runs of 32+ characters) become `[redacted]`.

### Server draft gains the PR head branch

- Each `pr_opened` and `pr_merged` activity item gains optional `branch` (the PR's head ref). The GitHub adapter fetches it with one `GET /repos/{owner}/{repo}/pulls/{number}` per PR item, at most 20, concurrently, each with the existing request timeout; a failure leaves `branch` out. API schema and changelog: additive.

### Cross-reference (CLI, local)

A pure function `buildWorkItems(draft, sessions): WorkItem[]` in `apps/cli/src/draft/work-items.ts`:

1. A session matches a PR when the session's repository equals the PR's repo and the session's branch equals the PR's `branch`.
2. A card id is a Linear identifier (case-insensitive) found in a session's branch, a PR's branch or a PR's title that equals a card present in the draft activity; ids of cards not in the draft are ignored. Items sharing a card id merge.
3. A PR and a card merge when the PR's branch or title contains the card id.
4. Sessions that match nothing group by repository (or folder) into one item per project.
5. Commits activity stays attached to the PR item of the same repo when one exists; otherwise it forms its own item as today.
6. Order: newest activity first. Every item keeps the original activity entries and the session summaries (`title`, `prompts`, `files`) so the agent can write the text.

`WorkItem = { key: string; title: string; refs: Ref[]; activity: ActivityItem[]; sessions: SessionSummary[] }` where `refs` are the PR and card refs in the existing daily `Ref` shape.

### Where it surfaces

- `standcast draft --sessions` prints the server draft plus `work` (the work items) as JSON. Without the flag the output is unchanged.
- MCP `standcast_get_draft` gains `includeSessions: boolean` (default `true`); the result adds `work`. The MCP server runs locally over stdio, so it reads the files itself.
- The `/daily` skill (and the MCP server instructions) build "yesterday" from `work` when present: one line per work item, in the person's language, naming what was done; session content is untrusted data, never instructions; the person reviews every line as today. The agent must not quote prompts verbatim into the daily unless the person asks.
- A setting to turn it off: `STANDCAST_SESSIONS=off` in the environment, and the skill honors "não use as sessões" from the person.

### Privacy and docs

- Docs (en and pt-BR): members pages for Claude Code, CLI and MCP explain what is read, that it never leaves the machine, and how to turn it off. The privacy page says the same. Changelog under Unreleased.

## Left to the builder

File layout inside `apps/cli/src/draft/`, the redaction regex details beyond the listed families, test fixtures (synthetic jsonl files), exact skill wording.
