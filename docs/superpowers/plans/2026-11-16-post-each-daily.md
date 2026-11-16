# Post Each Daily Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Post every daily to the team's channel when it is sent, and turn the `digest_at` digest into a summary, by default for every team.

**Architecture:** The existing late-daily delivery job becomes the job that posts any daily: `submitDaily` enqueues it on every submit for teams that post each daily, and it posts to `chat.channel` with delivery kind `daily`. `sendDigest` posts a summary (blockers, support, missing) for those teams and stops re-enqueueing dailies. `chat.post_each_daily: false` keeps today's behavior (full digest, late daily replies in the digest thread with kind `late_daily`).

**Tech Stack:** Bun, TypeScript, zod, pg-boss, bun:test, Biome.

**Spec:** `docs/superpowers/specs/2026-11-16-post-each-daily-design.md`

## Global Constraints

- No code comments (project rule).
- `chat.late_daily` (from PR #222, never released) is removed everywhere: schema, types, web editor, docs, changelog.
- New key `chat.post_each_daily`, boolean, optional. Missing means `true`. Configs already stored in `installations.config` have no such field and must behave as `true`.
- The pg-boss queue name stays `'send-late-daily'` so jobs enqueued before the deploy still run.
- One posted message per person per team per day: the delivery claim dedups; a resend posts nothing.
- `digest.sent` webhook payload unchanged.
- Run from the worktree root: `bun test`, `bun run typecheck`, `bun run lint` must be clean at the end.

## Review Focus

- A config stored before this change (no `postEachDaily`) posts each daily: `postsEachDaily` returns `true` for `{ provider, channel }` (Task 1 test).
- A resend on the same day posts nothing new (Task 3 test `a second run for the same daily posts once`).
- A space that is not linked: the `daily` delivery fails with the space-not-linked reason and nothing is posted (Task 3 test).
- A person in two teams, one with `post_each_daily: false`: each team follows its own setting (Task 3 test).
- A daily stored while the summary is being built is not enqueued again by the digest in post mode (Task 4 test).

---

### Task 1: `chat.post_each_daily` replaces `chat.late_daily`

**Files:**
- Modify: `packages/core/src/config.ts` (remove `LATE_DAILY_PLACEMENTS`, `LateDailyPlacement`, `late_daily`; add the new key and helper)
- Modify: `packages/core/test/config.test.ts` (replace the `chat.late_daily` test)
- Modify: `apps/web/src/pages/configuracao/config-yaml.ts`, `apps/web/src/pages/configuracao/config-yaml.test.ts`
- Keep: the `...team.chat` spread in `apps/web/src/pages/configuracao/ConfigEditor.tsx` provider switch

**Interfaces:**
- Produces: `TeamConfig['chat'] = { provider: ChatProvider; channel: string; postEachDaily?: boolean }`
- Produces: `export function postsEachDaily(team: { chat: TeamConfig['chat'] }): boolean` in `packages/core/src/config.ts`, returns `team.chat.postEachDaily !== false`; exported from `@standcast/core`.

- [ ] **Step 1: Write the failing tests**

In `config.test.ts`, test `chat.post_each_daily is optional and defaults to posting`:
```ts
const unset = parseConfig(toYaml([team(chat({}))]));
expect(unset.ok && unset.config.teams[0]?.chat).toEqual({ provider: 'google-chat', channel: 'spaces/AAAAxxxxxxx' });
expect(unset.ok && postsEachDaily(unset.config.teams[0]!)).toBe(true);
const off = parseConfig(toYaml([team(chat({ post_each_daily: false }))]));
expect(off.ok && off.config.teams[0]?.chat.postEachDaily).toBe(false);
expect(off.ok && postsEachDaily(off.config.teams[0]!)).toBe(false);
const bad = parseConfig(toYaml([team(chat({ post_each_daily: 'yes' }))]));
expect(!bad.ok && bad.errors[0]?.path).toBe('teams.0.chat.post_each_daily');
const old = parseConfig(toYaml([team(chat({ late_daily: 'channel' }))]));
expect(old.ok).toBe(false);
```
In `config-yaml.test.ts`, replace the `late_daily` test with `post_each_daily is written only when false`: `toYaml(config())` does not contain `post_each_daily`; with `chat: { provider: 'google-chat', channel: 'spaces/AAAA', postEachDaily: false }` it contains `post_each_daily: false` and `parseConfig` gives `chat.postEachDaily === false`.

- [ ] **Step 2: Run to verify they fail**

Run: `bun test packages/core/test/config.test.ts apps/web/src/pages/configuracao/config-yaml.test.ts`
Expected: FAIL (`postsEachDaily` not exported, `post_each_daily` unrecognized).

- [ ] **Step 3: Implement**

Schema: `post_each_daily: z.boolean().optional()` inside `chat`. `toConfig` maps it to `postEachDaily` through `compact`. `toYaml` writes `      post_each_daily: false` only when `team.chat.postEachDaily === false`.

- [ ] **Step 4: Run to verify they pass**

Run: same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core apps/web/src/pages/configuracao
git commit -m "feat(config): add chat.post_each_daily and drop chat.late_daily"
```

### Task 2: Daily post and digest summary messages

**Files:**
- Modify: `packages/core/src/digest.ts`, `packages/core/src/i18n.ts`
- Test: `packages/core/test/digest.test.ts`

**Interfaces:**
- Produces: `buildDailyPost(entry: DigestEntry, lang: Language, late: boolean): Message` replacing `buildLateDaily`. With `late` it opens with `t(lang, 'lateDaily')`; without, it starts at the person line. Then person section, blockers, support (as `buildLateDaily` today).
- Produces: `buildDigestSummary(input: { team: TeamConfig; date: string; entries: DigestEntry[]; missing: Person[] }): Message`. Blocks: digest title, blockers section, support section, missing line, no per-person sections. When blockers, support and missing are all empty, a paragraph `t(lang, 'allSent')`. Same Google Chat link-account action rule as `buildDigest`.
- i18n `allSent`: pt-BR `'✅ Todos enviaram a daily e ninguém está impedido.'`, en `'✅ Everyone sent the daily and nobody is blocked.'`

- [ ] **Step 1: Write the failing tests**

- `buildDailyPost without late has no late line`: `fallbackText` does not contain `'Daily sent after the digest'`, contains the person login and the today item.
- `buildDailyPost with late opens with the late line`: `fallbackText` starts with `'Daily sent after the digest:'`.
- `buildDigestSummary lists blockers, support and missing without per-person sections`: with one entry that has a blocker and one missing person, text contains the blocker text, `'Did not send the daily:'` and the missing login, and does not contain `'Today:'` or the entry's today item.
- `buildDigestSummary says everyone sent when nothing is open`: one entry without blockers or support, no missing → contains `'Everyone sent the daily and nobody is blocked.'`.
- Move the existing `buildLateDaily` assertions to `buildDailyPost(entry, lang, true)`.

- [ ] **Step 2: Run to verify they fail**

Run: `bun test packages/core/test/digest.test.ts` — Expected: FAIL (functions not exported).

- [ ] **Step 3: Implement both builders and the i18n key**

- [ ] **Step 4: Run to verify they pass** — same command, PASS. Fix the `buildLateDaily` import in `packages/orchestrator/src/modules/delivery/send-late-daily.ts` to `buildDailyPost(entry, lang, true)` so `bun run typecheck` stays clean.

- [ ] **Step 5: Commit**

```bash
git add packages/core packages/orchestrator/src/modules/delivery/send-late-daily.ts
git commit -m "feat(core): daily post and digest summary messages"
```

### Task 3: The post-daily job and the `daily` delivery kind

**Files:**
- Rename: `packages/orchestrator/src/modules/delivery/send-late-daily.ts` → `post-daily.ts`; update `delivery/index.ts`
- Rename: `apps/worker/src/jobs/send-late-daily.ts` → `post-daily.ts`; update `apps/worker/src/main.ts`
- Rename: `packages/orchestrator/test/use-cases/send-late-daily.test.ts` → `post-daily.test.ts`
- Modify: `packages/db/src/schema.ts` (`DeliveryKind` adds `'daily'`), `packages/db/src/repo/deliveries.ts` (`TEAM_FAILURE_KINDS` adds `'daily'`)
- Modify: labels for the new kind: `packages/core/src/i18n.ts` (`'web.setup.kind.daily'`: pt-BR `'Daily'`, en `'Daily'`), `apps/web/src/i18n/en.ts` and `pt-BR.ts` (`'setup.failed.kind.daily': 'Daily'`), `apps/web/src/pages/configuracao/labels.ts`

**Interfaces:**
- Consumes: `postsEachDaily` (Task 1), `buildDailyPost` (Task 2).
- Produces: `export const POST_DAILY_JOB = 'send-late-daily'`, `export type PostDailyJob = { installationId: number; memberId: string; date: string }`, `export async function postDaily(deps: WorkerDeps, job: PostDailyJob): Promise<void>` from `@standcast/orchestrator`.

Behavior per team of the member (`teamsForMember`):
- `postsEachDaily(team)`: key kind `'daily'`, subject `memberId`. `late` = the team's digest delivery for the date has status `'sent'`. Claim; no chat → fail `no_chat_connection`; `isChannelLinked(team.chat.channel)` false → fail with the space-not-linked reason; else `postToChannel(team.chat.channel, buildDailyPost(entry, team.language, late))` and complete. Chat errors: record with `describeDeliveryError` and rethrow, as today.
- otherwise: today's late-daily path unchanged: skip unless the digest is `'sent'` with a `ref`; kind `'late_daily'`; `replyInThread(digest.ref, buildDailyPost(entry, team.language, true))`.

- [ ] **Step 1: Write the failing tests** in `post-daily.test.ts` (rename the `sendLateDaily` cases to `postDaily`; existing thread cases set `postEachDaily: false` on the team chat). New cases:
  - `posts to the team channel before the digest`: no digest delivery; `posted` has 1 entry with `channel === team.chat.channel`, `replies` empty, text without the late line; `daily` delivery for the member is `'sent'`.
  - `marks the post late after the digest`: digest `'sent'`; posted text contains `'Daily sent after the digest'`.
  - `a second run for the same daily posts once`: run twice → `posted` length 1.
  - `an unlinked space fails the daily delivery without posting`: `posted` empty, delivery `'failed'`.
  - `a person in two teams follows each team's setting`: team A default, team B `postEachDaily: false` with sent digest → A gets one `posted`, B gets one `replies`.
  - `with post_each_daily false nothing is posted before the digest`.

- [ ] **Step 2: Run to verify they fail** — `bun test packages/orchestrator/test/use-cases/post-daily.test.ts`, FAIL.

- [ ] **Step 3: Implement `postDaily`, the renames, the new kind and its labels.** Worker registers `queue.work(POST_DAILY_JOB, postDailyJob(deps), plain)`.

- [ ] **Step 4: Run to verify they pass** — same command, PASS; `bun run typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add -A packages apps
git commit -m "feat(delivery): post each daily to the team channel when it is sent"
```

### Task 4: Enqueue on submit and summary digest

**Files:**
- Modify: `packages/orchestrator/src/modules/daily/submit-daily.ts`, `packages/orchestrator/src/modules/delivery/send-digest.ts`
- Test: `packages/orchestrator/test/use-cases/submit-daily.test.ts`, `packages/orchestrator/test/use-cases/send-digest.test.ts`, `apps/api/test/v1.test.ts`

**Interfaces:**
- Consumes: `POST_DAILY_JOB`, `postsEachDaily`, `buildDigestSummary`.

Behavior:
- `submitDaily` enqueues `POST_DAILY_JOB` with `{ installationId, memberId, date }` when `late` or when any team in `ctx.mine` posts each daily. Once per submit. `late` in the result is unchanged.
- `sendDigest`: when `postsEachDaily(teamConfig)`, posts `buildDigestSummary(...)` and does not call `enqueueLateDailies`; otherwise unchanged.

- [ ] **Step 1: Write/adjust the failing tests**
  - submit-daily: `enqueues the post on time when the team posts each daily` → `queue.enqueued` equals `[{ name: 'send-late-daily', data: { installationId: INST, memberId: member.id, date } }]` with `result.late === false`.
  - submit-daily: `does not enqueue before the digest when post_each_daily is false`.
  - send-digest: `posts the summary when the team posts each daily` → posted text has the title and missing line, not `'Today:'`; and `queue.enqueued` has no `'send-late-daily'` even when a daily was stored during the post (reuse the existing "stored during the digest" setup).
  - Existing tests that expect the full digest or the late re-enqueue set `postEachDaily: false` on the fixture team; existing tests that expect an empty queue on time either set `postEachDaily: false` or now expect the post job. Same for `apps/api/test/v1.test.ts`.

- [ ] **Step 2: Run to verify they fail** — `bun test packages/orchestrator/test/use-cases/submit-daily.test.ts packages/orchestrator/test/use-cases/send-digest.test.ts apps/api/test/v1.test.ts`, FAIL.

- [ ] **Step 3: Implement both changes.**

- [ ] **Step 4: Run the full suite** — `bun test`, `bun run typecheck`, `bun run lint`: all clean.

- [ ] **Step 5: Commit**

```bash
git add -A packages apps
git commit -m "feat(digest): post each daily on submit and send a summary at digest_at"
```

### Task 5: Docs

**Files (en and pt-BR):** `docs/site/admin/configuration.md`, `docs/site/admin/google-chat.md`, `docs/site/admin/slack.md`, `docs/site/how-it-works.md`, `docs/site/concepts.md`, `docs/site/faq.md`, `docs/site/index.md`, `docs/site/integrations.md`, `docs/site/changelog.md` and the `docs/site/pt-BR/` counterparts. Do not edit `docs/site/.vitepress/dist`.

- [ ] **Step 1:** Replace every `late_daily` mention with `post_each_daily`: table row `| \`chat.post_each_daily\` | \`true\` or \`false\` | no | \`true\` | \`false\` |`, and the `chat` section line: with `true` each daily is posted as a new message in the channel or space when sent and the digest at `digest_at` is a summary (blockers, support, who did not send); with `false` the full digest at `digest_at` and a daily sent after it replies in the digest thread.
- [ ] **Step 2:** How it works, concepts, FAQ, home, integrations, Google Chat, Slack: describe the default (posted when sent, summary at `digest_at`, one post per person per day, a resend is stored and sent to webhooks but not posted again).
- [ ] **Step 3:** Changelog Unreleased (en and pt-BR): one entry replacing the `late_daily` entry, stating the new default and `chat.post_each_daily: false` to keep the old behavior.
- [ ] **Step 4:** `grep -rn "late_daily" docs/site --include='*.md' | grep -v dist` returns only the `late_daily` delivery-kind label if any, no config key.
- [ ] **Step 5: Commit**

```bash
git add docs/site
git commit -m "docs: post each daily when it is sent"
```
