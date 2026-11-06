# Google Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teams with `chat.provider: google-chat` get the digest, late dailies, reminders, routed blockers and suggestion DMs through a Standcast Google Chat app, with spaces bound to installations by a one-time code and people linked by messaging the app.

**Architecture:** A new adapter package `@standcast/google-chat` implements the existing `ChatChannel` port over `fetch` and WebCrypto (service account JWT for outbound calls, Google-signed token verification for inbound events). The orchestrator stops hardcoding Slack: `chatFor` and the use cases dispatch on `team.chat.provider`. A `google_chat_spaces` table binds spaces to installations; a `handleGoogleChatEvent` use case handles app events; a thin `POST /webhooks/google-chat` route verifies and forwards them.

**Tech Stack:** Bun, TypeScript, Hono, Drizzle/Postgres, pg-boss, React 19 (web app). No new runtime dependency.

**Spec:** `docs/superpowers/specs/2026-11-06-google-chat-design.md` (binding; every "Claude's call" there is a requirement here).

## Global Constraints

- No comments in any code file.
- Commits, identifiers and engineering docs in English. Product copy in en and pt-BR (`packages/core/src/i18n.ts`, `apps/web/src/i18n/`, `apps/api` web dictionaries), product tone.
- Business rules in use cases (`packages/orchestrator/src/use-cases`) throwing `DomainError(code, message)`; routes and jobs stay thin.
- A package imports only what its own `package.json` declares (`bun run check-deps`). Dependency versions pinned exactly. No `googleapis`, no JWT library: WebCrypto (`crypto.subtle`, RS256) only.
- Slack behavior and its tests stay unchanged. An installation may mix providers across teams.
- Nothing logs message text, emails or tokens; log member ids, installation ids and space names only.
- Every task ends green on `bun test` (with `TEST_DATABASE_URL`), `bun run lint`, `bun run typecheck`, `bun run check-deps`, `bun run web:build`, `bun run check-docs`.

## Review Focus

1. A token signed by a key not in Google's JWKS, with the wrong audience, an expired `exp`, or `email` other than `chat@system.gserviceaccount.com` is rejected with 401 (Task 4 test `rejects forged or misdirected events`).
2. A team whose `channel` names a space bound to another installation fails with `space_not_linked` and posts nothing (Task 3 test `space bound elsewhere is not linked`).
3. A link code is single use, expires after 24 hours and only an admin of the installation can redeem it (Task 3 tests `code is single use`, `expired code`, `member cannot redeem`).
4. A DM from an email that matches no member writes no identity and answers the "run standcast login first" reply (Task 3 test `unknown email links nobody`).
5. Rendering escapes nothing it should keep and drops non-http links and non-`users/<digits>` mentions (Task 2 test `render keeps links and safe mentions only`).

---

### Task 1: Provider-neutral chat wiring

**Files:** `packages/core/src/chat-error.ts` (new, `ChatDeliveryError`), `packages/core/src/index.ts`, `packages/adapters/slack/src/errors.ts` and `index.ts` (re-export from core), `packages/core/src/config.ts` (`google_chat` override validated as `/^users\/\d+$/`, message `must be a Google Chat user like users/123456789`), `packages/orchestrator/src/deps.ts`, `chat.ts`, `chat-identity.ts`, `identity.ts`, `use-cases/delivery-error.ts`, `send-digest.ts`, `send-late-daily.ts`, `send-reminder.ts`, `route-blocker.ts`, `notify-suggestions.ts`, `get-setup-status.ts`, `complete-slack-connect.ts`, and their tests.
**Interfaces:**

- `type ChatProvider = 'slack' | 'google-chat'` exported from core.
- `chatFor(installationId: number, provider: ChatProvider): Promise<ChatChannel | null>`; `createChatFor(db, key, factories: { slack: (secret: string) => ChatChannel; 'google-chat': (() => ChatChannel) | null })`. For `google-chat` it returns `null` when the factory is null or no `connections` row exists.
- `chatUserIdsFor(deps, installationId, provider, logins)` reads `overrides.slack` or `overrides.googleChat` and the identities of that provider.
- Use cases pass `team.chat.provider`; `unsupported_provider` remains only for an unknown value.
- [ ] Tests: `google-chat team uses the google-chat channel` (send-digest with a fake factory); `late daily for a google-chat team replies in thread`; `reminder resolves the google-chat identity`; `google_chat override must be users/<digits>`; all Slack tests unchanged and green.
- [ ] Implement, run all checks, commit `refactor: provider-neutral chat wiring`.

### Task 2: Google Chat adapter

**Files:** `packages/adapters/google-chat/` (`package.json` named `@standcast/google-chat`, depends on `@standcast/core` only; `src/index.ts`, `src/auth.ts`, `src/render.ts`, `src/channel.ts`, `src/verify.ts`), tests in `packages/adapters/google-chat/test/`, root workspace and `check-deps` config if they list packages.
**Interfaces:**

- `parseServiceAccount(base64Json: string): { clientEmail: string; privateKey: string }`.
- `createTokenSource(account, { fetch?, now? }): () => Promise<string>`: RS256 JWT (`iss` = client email, `scope` = `https://www.googleapis.com/auth/chat.bot`, `aud` = `https://oauth2.googleapis.com/token`, 1 hour) exchanged at that URL; cached until 60 s before expiry.
- `renderGoogleChat(msg: Message): { text: string }` per the spec's Rendering call (4,096 characters cap with the tail `… see Standcast`).
- `createGoogleChatChannel(token: () => Promise<string>, { apiUrl?, fetch? }): ChatChannel`:
  - `postToChannel(space)` → `POST {api}/v1/{space}/messages` → `{ channel: space, id: message.thread.name }`;
  - `replyInThread(ref)` → same with `thread: { name: ref.id }` and `messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD`;
  - `sendDirect(userId)` → `GET {api}/v1/spaces:findDirectMessage?name={userId}`; 404 → `ChatDeliveryError('no_dm_space')`; then post;
  - `findUserByEmail` → `null`;
  - `checkChannel(space)` → `GET {api}/v1/{space}`: 200 `ok`, 404 `not_found`, 403 `not_member`.
  - Errors: 401 `invalid_auth`, 403 on post `not_in_channel`, 404 user on DM lookup `user_not_found`, 429 `ratelimited`, network/timeout (15 s) `timeout`, other `http_error`.
- `verifyChatEvent(authorization: string | undefined, audience: string, { jwks: () => Promise<JsonWebKey[]>, now? }): Promise<boolean>`: RS256 over Google's JWKS (`https://www.googleapis.com/oauth2/v3/certs`, cached by `kid` for 1 hour), checks `iss` in `https://accounts.google.com` / `accounts.google.com`, `aud`, `exp`, `email = chat@system.gserviceaccount.com`, `email_verified`.
- [ ] Tests (fake fetch, keys generated with `crypto.subtle` in the test): `token is signed and cached`; `render keeps links and safe mentions only`; `long digest is cut with the tail`; `post returns the thread as ref`; `reply uses the thread and fallback option`; `dm without a space is no_dm_space`; `check channel maps 404 and 403`; `429 is ratelimited`; `verify accepts a valid google token`; `verify rejects wrong audience, issuer, email, expiry and unknown kid`.
- [ ] Implement, run all checks, commit `feat: google chat adapter`.

### Task 3: Spaces, link codes, identities and the event use case

**Files:** `packages/db/src/schema.ts` (table `google_chat_spaces`: `space_name text pk`, `installation_id` fk cascade null until linked, `display_name text`, `link_code_hash text null`, `link_code_expires_at timestamptz null`, `added_at`, `linked_at null`), generated migration, `packages/db/src/repo/google-chat-spaces.ts`, `packages/db/src/index.ts`; `packages/orchestrator/src/use-cases/google-chat-events.ts`, `link-google-chat-space.ts`, `send-digest.ts` and `send-late-daily.ts` (binding check), `get-setup-status.ts` (`googleChat` section and notices); tests alongside.
**Interfaces:**

- `handleGoogleChatEvent(deps, event: GoogleChatEvent): Promise<{ text: string } | null>` where `GoogleChatEvent = { type: string; space: { name: string; type?: string; spaceType?: string; displayName?: string; singleUserBotDm?: boolean }; user?: { name: string; email?: string } }`:
  - `ADDED_TO_SPACE` in a room: upsert the space, issue a fresh code (8 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, stored as sha-256 hash, 24 h), reply with the code and the instruction in en and pt-BR (one message, both languages);
  - `REMOVED_FROM_SPACE`: delete the row;
  - `MESSAGE` or `ADDED_TO_SPACE` in a DM: link identities per the spec; reply with the linked or not-found text, in the member's configured language when one is known, else en and pt-BR.
- `linkGoogleChatSpace(deps, isMember, member, { installationId, code }): Promise<{ space: string; displayName: string }>`: admin only (`forbidden`), unknown or expired code `invalid_code`, sets `installation_id`, clears the code, upserts the `connections` row (`provider = 'google-chat'`, external id per spec, secret = empty string encrypted), returns the space.
- `unlinkGoogleChatSpace(deps, isMember, member, { installationId, space })`: admin only; deletes the binding (and the connection row when none remain).
- Deliveries for a google-chat team whose `channel` is not bound to the installation fail with `space_not_linked`.
- `SetupStatus.googleChat: { available: boolean; spaces: { name: string; displayName: string }[] }`; channel notices run for google-chat teams too.
- [ ] Tests: `added to a room issues a code`; `code is single use`; `expired code`; `member cannot redeem`; `removed from space deletes the binding`; `dm links the member in every connected installation`; `unknown email links nobody`; `override wins over the dm link`; `space bound elsewhere is not linked`; `setup status lists bound spaces`.
- [ ] Implement, run all checks, commit `feat: google chat spaces, link codes and identities`.

### Task 4: API and worker wiring

**Files:** `apps/api/src/env.ts` and `apps/worker/src/env.ts` (`GOOGLE_CHAT_SERVICE_ACCOUNT` optional, `GOOGLE_CHAT_AUDIENCE` optional defaulting to `${PUBLIC_URL}/webhooks/google-chat`), `apps/api/src/main.ts`, `apps/worker/src/main.ts`, `apps/api/src/routes/google-chat.ts` (new), `apps/api/src/routes/app.ts` (`POST /v1/app/orgs/:installationId/google-chat/spaces` body `{ code }` → 201 `{ space, displayName }`; `DELETE /v1/app/orgs/:installationId/google-chat/spaces/:space` → 204), server-rendered setup form `POST /setup/google-chat` (CSRF like the other setup forms) in `apps/api/src/routes/web.tsx`, error code maps (`invalid_code`, `space_not_linked`, `no_dm_space`), OpenAPI unchanged (these are app routes), tests.

- `POST /webhooks/google-chat`: verify, parse JSON (400 on bad body), call the use case, answer `200` with `{ text }` or `{}`; rate limit like the other webhooks; no logging of bodies.
- [ ] Tests: `rejects forged or misdirected events`; `added to space answers with a code`; `link route is admin only`; `setup form links a space`; `worker builds the google chat channel only with the env set`.
- [ ] Implement, run all checks, commit `feat: google chat webhook and link routes`.

### Task 5: Web app and setup page

**Files:** `apps/web/src/pages/configuracao/Connections.tsx` (`GoogleChatCard`: unavailable state, bound spaces with copy buttons and unlink, code input), `apps/web/src/api/queries.ts` (`useLinkGoogleChatSpace`, `useUnlinkGoogleChatSpace`), `labels.ts` (new failure codes), i18n en and pt-BR (provider-specific channel notices: Slack keeps `/invite @Standcast`, Google Chat says "add the Standcast app to the space"), `apps/api/src/web/setup-steps.tsx` (`GoogleChatStep`), `apps/api/src/web/config-template.ts` (comment-free example showing both providers), tests.

- [ ] Tests: `google chat card shows bound spaces`; `unavailable server shows the notice`; `invalid code message`; `channel notice copy per provider`; setup page renders the step.
- [ ] Implement, run all checks including `web:build`, commit `feat(web): google chat connection`.

### Task 6: Docs

- [ ] New `docs/site/admin/google-chat.md` (en and pt-BR) and sidebar entries; update configuration (no "coming soon"; `google_chat` override format), install, slack page (remove "coming soon" for `unsupported_provider`), privacy (what the app receives and stores: space name and display name, user id and email from DMs used only to link), troubleshooting, FAQ, web-app page, landing (en, pt-BR, `index.md`, `llms.txt`: Google Chat available), deploy docs (`GOOGLE_CHAT_SERVICE_ACCOUNT`, `GOOGLE_CHAT_AUDIENCE`, creating the Chat app step by step), product changelogs (en, pt-BR) and API changelog (no public API change) under Unreleased.
- [ ] Run all checks, commit `docs: google chat`.
