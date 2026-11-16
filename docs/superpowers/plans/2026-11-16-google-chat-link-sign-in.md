# Google Chat Sign-in Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person who clicks **Link my account** (or mentions the app) in a team's Google Chat space and has no matching Standcast account gets a private sign-in link; after GitHub sign-in and one confirmation page, their Chat user is linked in that space's organization only. Every Google Chat link, by email or by the sign-in link, is scoped to the space's organization, and a direct message to the app no longer links.

**Architecture:** A new table holds hashed single-use tokens tied to a Chat user and the space's installation. The Chat event handler resolves the space's installation, runs the email match only there, and issues a token when nobody matches. Two thin web routes (`GET`/`POST /link/google-chat`) call two use cases that preview and complete the link, with a CSRF-protected confirmation in between.

**Tech Stack:** Bun, TypeScript, Hono (JSX pages in `apps/api`), Drizzle + Postgres 17, `bun:test`.

**Spec:** `docs/superpowers/specs/2026-11-16-google-chat-link-sign-in-design.md`

## Global Constraints

- No comments in code, at all.
- Repo text (code, commits, docs, PR) in English; product copy in both pt-BR and en through `t(lang, key)` in `packages/core/src/i18n.ts`.
- Routes, the Chat route and pages stay thin: business rules and queries live in `packages/orchestrator` use cases and `packages/db` repo functions.
- Every query on `member_identities`, `google_chat_sign_in_tokens` and `google_chat_spaces` filters by `installation_id` where the table has it.
- Logging only through `logError`; never log the token, `next`, emails or request bodies.
- Token: 32 random bytes, base64url; only its SHA-256 hex hash is stored; lifetime 15 minutes; pruned 1 day after `expires_at`.
- New table goes into the `TRUNCATE` list in `packages/db/test/setup.ts`; the migration is generated with `bun run --cwd packages/db generate` (next number after `0020_away_periods`).
- Tests need Postgres. If the local Docker disk is full, run against an existing database with `TEST_DATABASE_URL=… bun test <files>`; otherwise plain `bun test <files>`.

## Review Focus

- A token opened by someone else (forwarded link): `GET` must never consume it, and `POST` without a valid CSRF field must be refused. Pinned in Task 5.
- Clicking **Link my account** twice: the newer token works, the older unused one stops working. Pinned in Task 1.
- Signing in with a GitHub account that is not a member of the space's organization: `not_member`, and nothing is written. Pinned in Task 4.
- Google Chat disconnected from the organization between the click and the confirmation: `not_connected`, nothing written, token not consumed. Pinned in Task 4.
- A member whose email matches but who belongs only to another organization: clicking in this space gets the sign-in link and no identity is written in the other organization. Pinned in Task 3.

---

### Task 1: Token table and repo functions

**Files:**
- Modify: `packages/db/src/schema.ts` (new table next to `googleChatSpaces`)
- Create: `packages/db/migrations/0021_*.sql` and its `meta/` snapshot and journal entry (generated)
- Create: `packages/db/src/repo/google-chat-sign-in-tokens.ts`
- Modify: `packages/db/src/repo/google-chat-spaces.ts` (one new function)
- Modify: `packages/db/src/index.ts` (exports)
- Modify: `packages/db/test/setup.ts` (truncate list)
- Test: `packages/db/test/google-chat-sign-in-tokens.test.ts`

**Interfaces:**
- Produces:
  - table `google_chat_sign_in_tokens`: `token_hash text primary key`, `chat_user_id text not null`, `chat_email text`, `installation_id bigint not null references installations(id) on delete cascade`, `space_name text not null`, `created_at timestamptz not null default now()`, `expires_at timestamptz not null`, `used_at timestamptz`; index on `(installation_id, chat_user_id)`.
  - `type GoogleChatSignInToken = { chatUserId: string; chatEmail: string | null; installationId: number; spaceName: string }`
  - `issueGoogleChatSignInToken(db: Db, input: { tokenHash: string; chatUserId: string; chatEmail: string | null; installationId: number; spaceName: string; expiresAt: Date }): Promise<void>`: in one transaction, deletes rows with the same `installation_id` and `chat_user_id` and `used_at IS NULL`, then inserts.
  - `findGoogleChatSignInToken(db: Db, tokenHash: string, now: Date): Promise<GoogleChatSignInToken | null>`: unused and `expires_at > now`.
  - `consumeGoogleChatSignInToken(db: Db, tokenHash: string, now: Date): Promise<GoogleChatSignInToken | null>`: `UPDATE … SET used_at = now WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now RETURNING …`.
  - `pruneGoogleChatSignInTokens(db: Db, expiredBefore: Date): Promise<number>`: deletes rows with `expires_at < expiredBefore`, returns the count.
  - `getLinkedGoogleChatSpaceInstallation(db: Db, spaceName: string): Promise<number | null>` in `google-chat-spaces.ts`: the `installation_id` of the row with `linked_at IS NOT NULL`, else `null`.

- [ ] **Step 1: Write the failing tests** in `packages/db/test/google-chat-sign-in-tokens.test.ts` with `useCleanDb()` and an installation fixture as the other repo tests do:
  - `issued token is found and consumed once`: issue, `find` returns `{ chatUserId: 'users/1', chatEmail: 'a@x.com', installationId, spaceName: 'spaces/AAA' }`; first `consume` returns the same; second `consume` returns `null`; `find` after consume returns `null`.
  - `an expired token is neither found nor consumed`: `expiresAt` = now − 1s → both `null`.
  - `a new token for the same user and installation replaces the unused one`: issue `h1` then `h2` for `users/1` in the same installation → `find(h1)` is `null`, `find(h2)` is not.
  - `tokens of other users or installations are kept`: `h1` for `users/1` in inst A, `h2` for `users/1` in inst B, `h3` for `users/2` in inst A → all three found.
  - `concurrent consumes return the token once`: `Promise.all` of two `consume(h1)` → exactly one non-null.
  - `prune deletes tokens expired before the cutoff`: one expired 2 days ago, one expiring tomorrow; `prune(db, now − 1 day)` returns `1`.
  - `deleting the installation deletes its tokens`.
  - `getLinkedGoogleChatSpaceInstallation returns the installation of a linked space and null otherwise` (unlinked row with only a link code → `null`; unknown space → `null`).

- [ ] **Step 2: Run to verify they fail**

Run: `bun test packages/db/test/google-chat-sign-in-tokens.test.ts`
Expected: FAIL, missing exports.

- [ ] **Step 3: Add the table to `schema.ts`, run `bun run --cwd packages/db generate`, add the table to the truncate list in `packages/db/test/setup.ts`, implement the repo functions and export them from `packages/db/src/index.ts`.**

- [ ] **Step 4: Run to verify they pass**

Run: `bun test packages/db/test/google-chat-sign-in-tokens.test.ts packages/db/test/repo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db
git commit -m "feat(db): store single-use Google Chat sign-in tokens"
```

---

### Task 2: Copy

**Files:**
- Modify: `packages/core/src/i18n.ts` (pt-BR and en maps)
- Test: `packages/core/test/i18n.test.ts` (or the existing key-parity test, if one already checks both maps)

**Interfaces:**
- Produces these keys, exact copy:

| key | en | pt-BR |
| --- | --- | --- |
| `googleChat.notFound` (reworded) | `No Standcast account in this organization uses this email.` | `Nenhuma conta do Standcast nesta organização usa este e-mail.` |
| `googleChat.signInLink` | `Sign in with GitHub to link your account` | `Entrar com GitHub para vincular a sua conta` |
| `googleChat.useSpace` | `I link accounts from your team's space. Click Link my account under your team's digest, or mention me in that space.` | `Eu vinculo contas pelo espaço do seu time. Clique em Vincular minha conta abaixo do consolidado do time, ou me mencione nesse espaço.` |
| `googleChat.replaced` | `Another Google Chat account was linked to @{login} in {org}, so this one no longer is. If that wasn't you, tell an admin.` | `Outra conta do Google Chat foi vinculada a @{login} em {org}, então esta não está mais. Se não foi você, avise um admin.` |
| `web.chatLink.title` | `Link Google Chat` | `Vincular o Google Chat` |
| `web.chatLink.confirm` | `Link the Google Chat account {account} to your GitHub account @{login} in {org}?` | `Vincular a conta do Google Chat {account} ao seu GitHub @{login} em {org}?` |
| `web.chatLink.replaces` | `This replaces your current Google Chat link in {org}.` | `Isso substitui o seu vínculo atual com o Google Chat em {org}.` |
| `web.chatLink.submit` | `Link` | `Vincular` |
| `web.chatLink.cancel` | `Cancel` | `Cancelar` |
| `web.chatLink.linked` | `You're linked in {org}, @{login}. You can close this page.` | `Vínculo feito em {org}, @{login}. Pode fechar esta página.` |
| `web.chatLink.expired` | `This link expired. Click Link my account in Google Chat again.` | `Este link expirou. Clique em Vincular minha conta no Google Chat de novo.` |
| `web.chatLink.notMember` | `Your GitHub account @{login} is not a member of {org} on Standcast. Sign in with the GitHub account you use there.` | `A sua conta do GitHub @{login} não é membro de {org} no Standcast. Entre com a conta do GitHub que você usa lá.` |
| `web.chatLink.notConnected` | `{org} no longer has Google Chat connected to Standcast. Ask an admin to link a space.` | `{org} não tem mais o Google Chat conectado ao Standcast. Peça a um admin para vincular um espaço.` |
| `web.chatLink.mapped` | `Your admin set your Google Chat account in standcast.yml, so nothing changed.` | `Um admin definiu a sua conta do Google Chat no standcast.yml, então nada mudou.` |

The page does not show the previous account's email: identities store only the Chat user id, so `web.chatLink.replaces` names the organization instead (narrows the spec's "with that account's email when known", which is never known).

- [ ] **Step 1: Write the failing test** `chat link copy exists in both languages`: for every key above, `t('en', key)` and `t('pt-BR', key)` are non-empty and differ from the key; `t('pt-BR', 'web.chatLink.confirm', { account: 'a@x.com', login: 'ana', org: 'acme' })` equals `Vincular a conta do Google Chat a@x.com ao seu GitHub @ana em acme?`.
- [ ] **Step 2: Run** `bun test packages/core/test/i18n.test.ts` → FAIL (keys missing; `MessageKey` type errors count as failing).
- [ ] **Step 3: Add the keys to both maps.**
- [ ] **Step 4: Run** `bun test packages/core` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(core): copy for the Google Chat sign-in link"`.

---

### Task 3: Scope Chat linking to the space and offer the link

**Files:**
- Modify: `packages/orchestrator/src/modules/chat/google-chat-events.ts`
- Modify: `apps/api/src/routes/google-chat.ts` only if the deps it passes lack `env` (it passes the full `deps` today)
- Test: `packages/orchestrator/test/use-cases/google-chat.test.ts`

**Interfaces:**
- Consumes: Task 1 `issueGoogleChatSignInToken`, `getLinkedGoogleChatSpaceInstallation`; Task 2 keys.
- Produces:
  - `export const SIGN_IN_TOKEN_TTL_MS = 15 * 60 * 1000`
  - `export function generateSignInToken(): string` (32 random bytes, base64url) and reuse of `hashLinkCode` for the hash.
  - `export function signInLinkUrl(publicUrl: string, token: string): string` → `${publicUrl}/link/google-chat?token=${token}`
  - `handleGoogleChatEvent(deps: Pick<Deps, 'db' | 'now' | 'env'>, event)` (signature widened from `'db' | 'now'`).
  - `export async function writeGoogleChatIdentity(deps: Pick<Deps, 'db'>, input: { installationId: number; memberId: string; chatUserId: string }): Promise<boolean>`: reads the installation's `google-chat` connection external id and calls `writeIdentityIfConnected`; `false` when not connected or not written. Used here and by Task 4.

Behaviour (spec, "Scope of every Google Chat link" and "When the link is offered"):
- Direct message (`MESSAGE` or `ADDED_TO_SPACE`): answer `googleChat.useSpace` in English; write nothing.
- Click or mention in a space: `installationId = getLinkedGoogleChatSpaceInstallation(space.name)`. `null` → `googleChat.notConnected`, private, no token. Otherwise candidates = `findMembersByEmail(email)` filtered to members of `installationId` (`listMemberInstallations`).
  - 0 candidates → text is `googleChat.notFound`, then a line `<${signInLinkUrl(...)}|${t(lang, 'googleChat.signInLink')}>`, then `googleChat.mapHint`; a token is issued with `chatEmail = user.email`. Invalid user id (`!GOOGLE_CHAT_USER_ID.test`) or no email → today's `null`/`notFound` answer without a token.
  - more than 1 distinct member → `quarantineLinks` restricted to `installationId` only; `googleChat.ambiguous` + map hint.
  - 1 → `writeGoogleChatIdentity` in `installationId`; `true` → `googleChat.linked` with `@login`; `false` → `googleChat.notConnected`.
  - Language: the space's language (`spaceLanguage`), as today. Replies stay `privateTo: user.name`.

- [ ] **Step 1: Rewrite the tests.** Move the email-path cases of `describe('handleGoogleChatEvent in a direct message')` to a new `describe('handleGoogleChatEvent link from a space')` that sends `CARD_CLICKED` with `action: LINK_CHAT_ACCOUNT_ACTION` on a linked space; keep their assertions, now about that installation only. Add:
  - `a direct message links nobody and points to the team space`: reply text equals `t('en', 'googleChat.useSpace')`; no identity rows.
  - `links only in the space's organization`: member of inst A and inst B, both with Google Chat connected, click in A's space → identity in A, none in B.
  - `a member found by email only in another organization gets the sign-in link`: member only in inst B, click in A's space → reply contains `/link/google-chat?token=` and `t(lang, 'googleChat.signInLink')`; no identity anywhere; one token row for inst A with `chatUserId` and `chatEmail` set.
  - `an unknown email gets a private sign-in link scoped to the space`: reply `privateTo` is the user; contains the link and the map hint; `findGoogleChatSignInToken(hash of the token in the URL)` returns `installationId` = A and `spaceName` = the space.
  - `a click in a space not linked to an organization gets notConnected and no token`.
  - `ambiguity quarantines links only in the space's organization`: two members share the email in A and B; their links in B survive.
  - `a mention in a space behaves like a click` (one case, unknown email → link).
- [ ] **Step 2: Run** `bun test packages/orchestrator/test/use-cases/google-chat.test.ts` → FAIL.
- [ ] **Step 3: Implement** in `google-chat-events.ts`; replace `linkMember`'s loop with `writeGoogleChatIdentity` for the one installation.
- [ ] **Step 4: Run** `bun test packages/orchestrator/test/use-cases/google-chat.test.ts apps/api/test` → PASS (the API Chat route tests must still pass).
- [ ] **Step 5: Commit** `git commit -m "feat(chat): link Google Chat accounts only in the space's organization and offer a sign-in link"`.

---

### Task 4: Preview and complete use cases

**Files:**
- Create: `packages/orchestrator/src/modules/chat/google-chat-sign-in-link.ts`
- Modify: `packages/orchestrator/src/modules/chat/index.ts` (or the module's export file) and `packages/orchestrator/src/index.ts`
- Test: `packages/orchestrator/test/use-cases/google-chat-sign-in-link.test.ts`

**Interfaces:**
- Consumes: Task 1 `findGoogleChatSignInToken`, `consumeGoogleChatSignInToken`; Task 3 `writeGoogleChatIdentity`, `hashLinkCode`; `getIdentityByLogin`, `deleteInstallationIdentities`, `listMemberInstallations`, `getConnectionExternalId`, `getInstallation`, `operationalConfig`, `memberOverrides`, `listGoogleChatSpaceConfigs`, `googleChatSpaceLanguage`; `deps.chatFor(installationId, 'google-chat')`.
- Produces:

```ts
export type ChatLinkFailure = 'expired' | 'not_member' | 'not_connected' | 'mapped';
export type ChatLinkContext = { language: Language; login: string; org: string };
export type ChatLinkPreview =
  | (ChatLinkContext & { status: 'confirm'; account: string; replaces: boolean })
  | (ChatLinkContext & { status: ChatLinkFailure });
export type ChatLinkResult = ChatLinkContext & { status: 'linked' | ChatLinkFailure };

export function previewGoogleChatSignInLink(deps: Deps, input: { member: MemberRow; token: string }): Promise<ChatLinkPreview>;
export function completeGoogleChatSignInLink(deps: Deps, input: { member: MemberRow; token: string }): Promise<ChatLinkResult>;
```

- `login` is `member.login`; `org` is the installation's `accountLogin` (empty string for `expired`, where the installation is unknown); `language` is the space's language via `googleChatSpaceLanguage(listGoogleChatSpaceConfigs(spaceName), spaceName)`, `'en'` for `expired`; `account` is `chatEmail ?? chatUserId`.
- Checks, in this order, shared by both functions: token found (`expired`) → member in the installation (`not_member`) → installation has a `google-chat` connection (`not_connected`) → `memberOverrides(config, login).google_chat` is set and differs from `chatUserId`, or another member's override equals `chatUserId` (`mapped`).
- Preview: `replaces` is `true` when `getIdentityByLogin(installation, 'google-chat', login)` is set and differs from `chatUserId`. Never consumes.
- Complete: runs the checks, then `consumeGoogleChatSignInToken` (`null` → `expired`), reads the previous identity, calls `deleteInstallationIdentities(installation, 'google-chat', { memberIds: [], externalId: chatUserId })`, then `writeGoogleChatIdentity`; `false` → `not_connected`. On `linked`, sends `sendDirect(chatUserId, …)` with `googleChat.linked` (`logins: '@' + login`) and, when the previous identity differed, `sendDirect(previous, …)` with `googleChat.replaced`; a failed or missing chat channel is caught and passed to `logError`, never changing the result.

- [ ] **Step 1: Write the failing tests** (Postgres fixtures plus a fake `chatFor` that records `sendDirect` calls, as `send-away-notice.test.ts` does):
  - `preview shows the account, org and login without consuming the token`: then `complete` returns `linked`.
  - `preview of a used or unknown token is expired`.
  - `complete links only in the token's installation and confirms by direct message`: identity in A; none written in B where the member also is; one `sendDirect('users/1', …)` whose text is `t(lang, 'googleChat.linked', { logins: '@ana' })`.
  - `complete twice returns expired the second time`.
  - `a member outside the installation is not_member and nothing is written`; token still found afterwards.
  - `google chat disconnected after the click is not_connected and the token is not consumed`.
  - `an admin mapping to another chat user is mapped`; `an admin mapping of another member to this chat user is mapped`.
  - `replacing a link: preview says replaces and complete notifies the previous chat user` (`sendDirect('users/OLD', …)` with `googleChat.replaced`).
  - `another member linked to the same chat user loses that link in this installation only`.
  - `a failed confirmation message still links`: `sendDirect` throws → result `linked`, identity written.
- [ ] **Step 2: Run** `bun test packages/orchestrator/test/use-cases/google-chat-sign-in-link.test.ts` → FAIL.
- [ ] **Step 3: Implement** the two functions and export them and the types from `@standcast/orchestrator`.
- [ ] **Step 4: Run** the same file → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(chat): preview and complete the Google Chat sign-in link"`.

---

### Task 5: Web routes and page

**Files:**
- Create: `apps/api/src/web/chat-link.tsx`
- Modify: `apps/api/src/routes/web.tsx`
- Test: `apps/api/test/web-chat-link.test.ts` (follow the setup of the existing web route tests in `apps/api/test`)

**Interfaces:**
- Consumes: Task 4 functions and types; existing `readSession`, `requireSession`, `readForm`, `loginRedirect`, `csrfToken` (export it from `@standcast/orchestrator` if it is not already), `Layout`/`ui` components.
- Produces: `ChatLinkPage(props: { view: ChatLinkPreview | ChatLinkResult; token?: string; csrf?: string })` rendering, in `view.language`, the `web.chatLink.*` copy: for `confirm`, a `<form method="post" action="/link/google-chat">` with hidden `token` and `csrf`, the confirm sentence, the replaces line when `replaces`, a **Link** submit and a **Cancel** link to `/`; for the other statuses, the matching sentence.
- Routes: add `'/link/*'` to `PAGE_PATHS`. `GET /link/google-chat`: no session → `loginRedirect(c)`; with session → `previewGoogleChatSignInLink` with `c.req.query('token') ?? ''` → page. `POST /link/google-chat`: `requireSession`, `readForm` (CSRF), token from the form (`''` when absent) → `completeGoogleChatSignInLink` → page. Status 200 for every view.

- [ ] **Step 1: Write the failing tests:**
  - `without a session the link redirects through GitHub sign-in and back`: `GET /link/google-chat?token=abc` → 302 to `/auth/github/login?next=%2Flink%2Fgoogle-chat%3Ftoken%3Dabc`.
  - `with a session the page asks to confirm and keeps the token`: body contains the account email, `@login`, the org, a hidden `token` input and a hidden `csrf` input; the token is still found in the DB afterwards.
  - `posting with the csrf field links and shows the linked text`.
  - `posting without a valid csrf field is forbidden and links nothing`: 403, no identity, token still found.
  - `an expired token shows the expired text`, on both `GET` and `POST`.
  - `the page answers in the space's language`: pt-BR team on the space → `Vincular a conta do Google Chat`.
  - `the page sends the security headers`: `x-frame-options: DENY` and a `content-security-policy` header.
- [ ] **Step 2: Run** `bun test apps/api/test/web-chat-link.test.ts` → FAIL.
- [ ] **Step 3: Implement** the page and the two routes.
- [ ] **Step 4: Run** `bun test apps/api` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(web): confirm and complete the Google Chat sign-in link"`.

---

### Task 6: Prune, docs and changelog

**Files:**
- Modify: `packages/orchestrator/src/modules/retention/prune-data.ts`
- Test: the existing prune test (`packages/orchestrator/test/use-cases/prune-data.test.ts` or wherever `pruneData` is tested)
- Modify: `docs/site/admin/google-chat.md`, `docs/site/pt-BR/admin/google-chat.md`, `docs/site/privacy.md`, `docs/site/pt-BR/privacy.md`, `docs/site/changelog.md`, `docs/site/pt-BR/changelog.md`, and any other page `grep -rn "message the app\|mande uma mensagem\|direct message" docs/site` shows describing linking by direct message.

**Interfaces:**
- Consumes: Task 1 `pruneGoogleChatSignInTokens`.
- Produces: `PruneResult.googleChatSignInTokens: number`, computed with `pruneGoogleChatSignInTokens(deps.db, daysAgo(1))`.

- [ ] **Step 1: Write the failing test** `prune removes sign-in tokens a day after they expire`: one token expired 2 days ago, one expired 1 hour ago → `googleChatSignInTokens === 1` and the recent one is kept.
- [ ] **Step 2: Run** the prune test → FAIL.
- [ ] **Step 3: Implement** the prune entry.
- [ ] **Step 4: Update the docs** per the spec's Docs section: in "How people are linked", signing in first becomes optional; linking happens from the team's space and only in its organization; a direct message no longer links and what it answers; the answers table gets the sign-in link row and the `useSpace` row and loses "run `standcast login` first"; signing in from the link does not need the emails to match; the confirmation page and the replaced-account message. Privacy: the token table (Chat user id, Google email, organization, space), kept until 1 day after its 15-minute expiry. Changelog: one bullet each under `### Unreleased` / `### Não lançado`.
- [ ] **Step 5: Run** `bun test <prune test file>`, `bun run check-docs`, `bun run lint`, `bunx tsc --noEmit -p tsconfig.json` → all clean.
- [ ] **Step 6: Commit** `git commit -m "docs: link Google Chat accounts from the team space with a sign-in link"` (with the prune change).
