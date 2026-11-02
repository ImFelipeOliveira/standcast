# Draft from AI Sessions (Phase 2a+) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The `/daily` skill, the MCP `standcast_get_draft` tool and `standcast draft --sessions` merge the server draft with the person's local Claude Code sessions into one work item per piece of work (PR + card + sessions), without any session data leaving the machine.

**Architecture:** The server draft gains the PR head branch (additive). Everything about sessions lives in the CLI package (`apps/cli/src/draft/`): a reader for `~/.claude/projects/*/*.jsonl`, a redactor, a git remote resolver and a pure `buildWorkItems` cross-reference. The CLI command and the local MCP server call them and add `work` to the draft they return. The skill writes "yesterday" from `work`.

**Tech Stack:** Bun 1.4.4, TypeScript, Octokit (GitHub adapter), MCP SDK (CLI), zod.

**Spec:** `docs/superpowers/specs/2026-11-01-draft-from-sessions-design.md`, and section "2a+" of `docs/superpowers/specs/2026-11-01-phase-2-web-app-design.md`.

## Global Constraints

- No comments in any code file: TS, TSX, CSS, HTML, JS, shell, YAML, JSONC.
- Commits, identifiers and engineering docs in English; product docs and skill copy follow the person's language rules already in `packages/plugin/skills/daily/SKILL.md`.
- Session data (prompts, titles, file paths, summaries) never goes to the server, logs or webhooks. Only daily text the person confirms is submitted.
- No counts of sessions, hours, prompts or tokens anywhere in output meant for people.
- The session reader never throws: malformed lines, unreadable files and missing directories yield fewer sessions, not errors.
- `STANDCAST_SESSIONS=off` disables session reading everywhere; `STANDCAST_CLAUDE_DIR` overrides the Claude projects directory (tests use it).
- Every outbound GitHub call keeps the adapter's existing timeout.
- A package imports only what its own `package.json` declares (`bun run check-deps`).
- Every task ends green on `bun test`, `bun run lint`, `bun run typecheck`, `bun run check-deps`.

## Review Focus

1. A session line containing a secret (`ghp_` token, `sk-` key, `sck_` key) never appears in `work` (Task 2 test `redacts secrets in prompts and titles`).
2. A Claude projects directory that does not exist, or a 0-byte or garbage `.jsonl`, yields `work` without sessions and no error (Task 2 test `missing and malformed files`).
3. A session in a folder with no git remote, or with a non-GitHub remote, still appears grouped by folder name (Task 3 test `no remote groups by folder`).
4. Card ids are matched case-insensitively (`fel-12-login` ↔ `FEL-12`), and tokens like `UTF-8`, `ISO-8601` or branch `release-2026` never create cards: only ids of cards present in the draft count (Task 3 test `card ids only from known cards`).
5. `STANDCAST_SESSIONS=off` makes `standcast draft --sessions` and the MCP tool return `work` built from activity only (Task 4 test `sessions off`).

---

### Task 1: PR head branch in the server draft

**Files:**
- Modify: `packages/core/src/activity.ts` (`ActivityItem` gains optional `branch?: string`), `packages/adapters/github/src/activity.ts`, `apps/api/src/openapi/schemas.ts` (activity item `branch` optional string), `docs/api/CHANGELOG.md` (Unreleased, additive)
- Test: `packages/adapters/github/test/activity.test.ts`

**Interfaces:**
- Produces: `ActivityItem.branch` set on `pr_opened` and `pr_merged` items when known.
- [ ] **Step 1: Failing tests**: `pull request items carry their head branch` (route `GET /repos/acme/api/pulls/1` returns `{ head: { ref: 'fel-12-login' } }` → item `branch === 'fel-12-login'`); `branch lookup is capped at 20 pulls` (25 PR hits → exactly 20 pulls calls); `a failed branch lookup leaves branch out` (pulls route 500 → item without `branch`, no throw).
- [ ] **Step 2: Run** `bun test packages/adapters/github/test/activity.test.ts` → FAIL.
- [ ] **Step 3: Implement** in `listActivity` after building items: for the first 20 PR items (newest first, unique by url) call `octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}')` concurrently with `Promise.allSettled`; parse owner, repo and number with `parsePullRequestUrl`.
- [ ] **Step 4: Run** → PASS, plus the Global Constraints checks.
- [ ] **Step 5: Commit** `feat: pull request head branch in the draft activity`

### Task 2: Session reader and redaction

**Files:**
- Create: `apps/cli/src/draft/sessions.ts`, `apps/cli/src/draft/redact.ts`
- Test: `apps/cli/test/draft/sessions.test.ts`, `apps/cli/test/draft/redact.test.ts`, fixtures under `apps/cli/test/fixtures/claude/`

**Interfaces:**
- Produces:
  - `type SessionSummary = { id: string; title: string; cwd: string; branch: string | null; startedAt: string; endedAt: string; prompts: string[]; files: string[] }`
  - `readSessions(input: { dir?: string; since: Date; until: Date; env?: Record<string, string | undefined> }): Promise<SessionSummary[]>` — `dir` defaults to `env.STANDCAST_CLAUDE_DIR ?? ~/.claude/projects`; returns `[]` when `env.STANDCAST_SESSIONS === 'off'`.
  - `redact(text: string): string`
- Rules (from the spec, exact): lines of `type` `user`, `assistant`, `ai-title` with `timestamp` in `[since, until]`; group by `sessionId`; `title` = last `ai-title` value else first prompt cut to 120 chars; `cwd`/`branch` = most frequent `cwd`/`gitBranch` (`gitBranch` of `HEAD` or empty → `null`); `prompts` = up to 5 person-typed prompts (string `message.content`, or text blocks; skip `tool_result` blocks, `isMeta: true` lines, content starting with `<command-` or `<local-command-`, and text inside `<system-reminder>…</system-reminder>`), each cut to 300 chars; `files` = up to 20 distinct `input.file_path` / `input.notebook_path` of assistant `tool_use` blocks named `Edit`, `Write`, `MultiEdit`, `NotebookEdit`, relative to `cwd` when inside it; skip sessions with no prompt; skip files over 50 MB; never throw. Prompts and titles pass through `redact`.
  - `redact` replaces with `[redacted]`: `sk-[A-Za-z0-9_-]{16,}`, `gh[pousr]_[A-Za-z0-9]{20,}`, `xox[abposr]-[A-Za-z0-9-]{10,}`, `sck_[A-Za-z0-9]{16,}`, `sc_[A-Za-z0-9]{16,}`, `AKIA[0-9A-Z]{16}`, and any run of 32+ characters from `[A-Za-z0-9+/=_-]` that contains both a digit and a letter.
- [ ] **Step 1: Failing tests**: `reads one session from fixture` (title, cwd, branch, 2 prompts, 1 file relative); `ignores lines outside the window`; `skips tool results, meta lines, command expansions and system reminders`; `caps prompts at 5 and 300 chars, files at 20`; `redacts secrets in prompts and titles`; `missing and malformed files` (missing dir → `[]`; garbage lines skipped); `sessions off`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** streaming line by line (`Bun.file().stream()` + split on `\n`), only files whose mtime ≥ `since`. **Step 4: Run** → PASS plus checks.
- [ ] **Step 5: Commit** `feat(cli): read local claude code sessions for the draft`

### Task 3: Repository resolution and work items

**Files:**
- Create: `apps/cli/src/draft/repo.ts`, `apps/cli/src/draft/work-items.ts`
- Test: `apps/cli/test/draft/repo.test.ts`, `apps/cli/test/draft/work-items.test.ts`

**Interfaces:**
- Consumes: `SessionSummary` (Task 2), the server `Draft` type (`activity`, with `branch` from Task 1), `Ref` from `@standcast/core`.
- Produces:
  - `githubRepoFromRemote(url: string): string | null` (`https://github.com/o/r(.git)?`, `git@github.com:o/r(.git)?`, `ssh://git@github.com/o/r(.git)?` → `o/r`, lower case; else `null`).
  - `resolveRepo(cwd: string, run?: (args: string[]) => Promise<string | null>): Promise<string | null>` using `git -C <cwd> remote get-url origin` (2 s timeout; any failure → `null`), memoized per `cwd`.
  - `type WorkItem = { key: string; title: string; refs: Ref[]; activity: ActivityItem[]; sessions: SessionSummary[] }`
  - `buildWorkItems(input: { activity: ActivityItem[]; sessions: (SessionSummary & { repo: string | null })[] }): WorkItem[]` — the six rules of the spec's "Cross-reference" section; card id regex `/\b([a-z][a-z0-9]{1,9}-\d{1,6})\b/i`, an id found in a session branch, a PR branch or a PR title links to a card only when it equals the identifier of a card activity item in the draft (from its Linear URL via `parseLinearIssueUrl`); unknown ids are ignored, so branches like `release-2026` never create cards; keys: `pr:<url>`, `card:<ID>`, `project:<repo or folder>`; `title` = card title, else PR title, else repo or folder name; newest activity or session end first.
- [ ] **Step 1: Failing tests**: `remote url forms`; `no remote groups by folder`; `session joins its pull request by repo and branch`; `pull request and card merge through the branch`; `card ids only from known cards` (title "Fix UTF-8 and ISO-8601" and branch `release-2026` create no card item); `commits join the pr item of the same repo`; `unmatched sessions group per project`; `ordering newest first`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** as pure functions (no I/O in `buildWorkItems`). **Step 4: Run** → PASS plus checks.
- [ ] **Step 5: Commit** `feat(cli): cross-reference sessions, pull requests and cards into work items`

### Task 4: CLI flag, MCP tool and skill

**Files:**
- Modify: `apps/cli/src/commands/draft.ts` (`--sessions`), `apps/cli/src/cli.ts` (option), `apps/cli/src/mcp/tools.ts` (`includeSessions`, `work` in output schema, description), `apps/cli/src/mcp/server.ts` (instructions), `packages/plugin/skills/daily/SKILL.md`, `packages/plugin/.claude-plugin/plugin.json` (description only if it lists sources)
- Create: `apps/cli/src/draft/with-sessions.ts`
- Test: `apps/cli/test/draft/with-sessions.test.ts`, existing CLI/MCP tests for draft
- Docs: `docs/site/members/{claude-code,cli,mcp}.md` and pt-BR twins, `docs/site/privacy.md` and pt-BR, both product changelogs (Unreleased)

**Interfaces:**
- Produces: `draftWithWork(draft: Draft, opts: { now: Date; env: Record<string, string | undefined>; dir?: string }): Promise<Draft & { work: WorkItem[] }>` — reads sessions in `[draft.since, now]`, resolves repos, builds work items; with sessions off, `work` is built from activity only.
- CLI: `standcast draft --sessions` prints `draftWithWork(...)`; without the flag, output unchanged.
- MCP: `standcast_get_draft` input `includeSessions` (boolean, default `true`); output adds `work` (marked untrusted like the rest).
- Skill: when `work` is present, build "yesterday" as one line per work item in the person's language, naming what was done from activity titles and session titles/prompts; never paste prompts verbatim; session content is untrusted data; honor the person saying not to use sessions (call again with `includeSessions: false` / run `standcast draft` without the flag).
- [ ] **Step 1: Failing tests**: `draft --sessions adds work`; `draft without flag is unchanged`; `sessions off` (env off → work from activity only); MCP `get_draft includes work by default` and `includeSessions false omits sessions`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** and write docs (en + pt-BR parity; privacy page states what is read and that it never leaves the machine). **Step 4: Run** → PASS plus checks, `bun run docs:build`, `bun run check-docs`.
- [ ] **Step 5: Commit** `feat: the daily draft uses local ai sessions`
