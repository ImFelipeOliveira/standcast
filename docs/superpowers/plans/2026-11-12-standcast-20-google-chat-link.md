# Google Chat one-click link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People link their Google Chat account with one click on a button under the team digest, or by mentioning the app in a space, instead of having to send the app a direct message.

**Architecture:** A `Message` can carry `actions`. The digest gets a `link-chat-account` action when the team posts to Google Chat and at least one person in it has no Google Chat user. The Google Chat renderer turns the action into a `cardsV2` button whose `onClick.action.function` is the Chat endpoint URL (required by the add-on mode, accepted as a plain name by the classic mode) with the parameter `action=link-chat-account`; the Slack renderer ignores actions. The webhook route maps classic `CARD_CLICKED` events and add-on `buttonClickedPayload` events to a `CARD_CLICKED` event with the `action` parameter. `handleGoogleChatEvent` runs the same `linkIdentities` used by direct messages for a link click or a mention in a space and returns the reply with `privateTo`, which the route turns into `privateMessageViewer`.

**Tech Stack:** Bun, Hono, Drizzle, bun:test with the repo fakes and the Postgres test container.

## Why the digest and not the reminder

A reminder is a direct message, and Standcast sends it only to people who already have a Google Chat user (`no_chat_identity` otherwise). A button there never reaches the people who need it. The digest is posted in the team space and lists everyone, so the button goes there, and only while someone in the digest is still shown as `@login`.

## Global Constraints

- No code comments. Conventional Commits.
- Every user-facing string in `packages/core/src/i18n.ts`, in en and pt-BR.
- Linking stores only the clicking person's own `users/<id>`, through the existing `writeIdentityIfConnected` path. Answers to clicks and mentions in spaces are private to the person.
- The worker reads an optional `PUBLIC_URL`; without it the digest has no button.
- Docs in `docs/site` (en and pt-BR), changelog under Unreleased / Não lançado, `docs/deploy.md` for the worker variable.

## Tasks

### Task 1: Message actions and the digest button (core)

**Files:** `packages/core/src/message.ts`, `packages/core/src/digest.ts`, `packages/core/src/i18n.ts`, `packages/core/test/digest.test.ts`

- [ ] Failing test: a Google Chat digest with a person without `chatUserId` has one `link-chat-account` action labelled in the team language; a digest where everyone has a user has none; a Slack digest has none.
- [ ] Add `MessageAction`, `LINK_CHAT_ACCOUNT_ACTION`, `actions?: MessageAction[]` on `Message`, i18n keys `googleChat.linkPrompt` and `googleChat.linkButton`.
- [ ] Run `bun test packages/core`, commit `feat(core): add a link account action to Google Chat digests`.

### Task 2: Render the action as a card button (adapter)

**Files:** `packages/adapters/google-chat/src/render.ts`, `channel.ts`, `test/render.test.ts`, `test/channel.test.ts`, `packages/adapters/slack/test`

- [ ] Failing tests: `renderGoogleChat(msg, { interactionUrl })` adds `cardsV2` with a button whose function is the URL and parameter `action=link-chat-account`; no URL or no action means no `cardsV2`; the channel posts `cardsV2` when built with `interactionUrl`; the Slack render of a message with actions equals the render without them.
- [ ] Implement, commit `feat(google-chat): render the link account action as a card button`.

### Task 3: Handle the click and mentions (orchestrator + route)

**Files:** `packages/orchestrator/src/modules/chat/google-chat-events.ts`, `apps/api/src/routes/google-chat.ts`, `packages/orchestrator/test/use-cases/google-chat.test.ts`, `apps/api/test/google-chat.test.ts`

- [ ] Failing tests: a classic `CARD_CLICKED` and an add-on `buttonClickedPayload` with `action=link-chat-account` link the member and answer privately; an unknown email answers the guidance with the id and stores nothing; clicking twice keeps one identity; an email shared by two accounts answers the ambiguous message; a click without the parameter or without a valid user answers nothing; a mention in a space links and answers privately.
- [ ] Implement, commit `feat(google-chat): link people from the digest button and from mentions`.

### Task 4: Wire the interaction URL

**Files:** `apps/worker/src/env.ts`, `apps/worker/src/chat-factories.ts`, `apps/worker/src/main.ts`, `apps/api/src/chat-factories.ts`, `apps/api/src/main.ts`, tests for the worker env

- [ ] Failing test: the worker env accepts an optional `PUBLIC_URL` and strips trailing slashes.
- [ ] Pass `${PUBLIC_URL}/webhooks/google-chat` as `interactionUrl`, commit `feat(worker): pass the Google Chat endpoint to the digest button`.

### Task 5: Docs and changelog

- [ ] `docs/site/admin/google-chat.md` and pt-BR: how people are linked (button, mention, direct message), limits, privacy.
- [ ] `docs/site/privacy.md` and pt-BR if they list Google Chat events.
- [ ] `docs/deploy.md`: `PUBLIC_URL` on the worker.
- [ ] Changelog en and pt-BR. Commit `docs: describe the Google Chat link button`.

### Task 6: Verify and open the PR

- [ ] `bun test`, `bun run lint`, `bun run typecheck`, `bun run check-docs`.
- [ ] Open one PR to `dev`.

## Platform notes

- A private answer to a button click is sent with `privateMessageViewer` in the synchronous response (classic: top level of the message; add-on: inside `createMessageAction.message`). Google documents `privateMessageViewer` for messages created by the app; it has to be checked on a real space after deploy.
- Linking from a space does not open a direct message space. Reminders still need the person to have messaged the app once (`no_dm_space`); the link only makes digest mentions work.
