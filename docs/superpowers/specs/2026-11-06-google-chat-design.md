# Google Chat

## Why

The original design promised Slack **and** Google Chat, and no standup tool we found covers Google Chat together with an AI-agent skill. Teams on Google Workspace can configure `provider: google-chat` in `standcast.yml` today, but every delivery fails with `unsupported_provider`. This is the first thing those teams hit.

## What it is

A Google Chat app, owned by Standcast, that does everything the Slack bot does: the team digest in a space, late dailies in the digest's thread, reminders and routed blockers by direct message, suggestion DMs when a person opted in, and the setup checks for the channel.

## Goals

- A team with `chat: { provider: google-chat, channel: spaces/AAAA... }` gets the same deliveries as a Slack team.
- An admin connects Google Chat from the web app and the server-rendered setup page, with no secret to paste.
- A person is linked to their Google Chat user without typing an id.
- Slack keeps working unchanged; an installation may use Slack for one team and Google Chat for another.

## Non-goals

- Interactive cards, slash commands or writing the daily inside Google Chat. The daily is still written in the AI agent, the CLI or (later) the web app.
- Google Chat as a source of activity for the draft.
- Per-installation Google Cloud projects or service accounts. There is one Standcast Chat app.

## Anti-goals

- Reading messages in a space. The app only reads the events Google sends when it is added, removed or messaged directly, and keeps nothing from message text.
- Any surveillance surface the Slack integration does not have.

## Decisions

**Felipe's call (2026-11-06):** a full Chat app (not incoming webhooks), with DMs, published to the Google Workspace Marketplace when ready; until then it works in Felipe's own Workspace and test domains.

**Claude's calls:**

- **Authentication.** The app calls the Chat API as itself with a service account key and the `https://www.googleapis.com/auth/chat.bot` scope. The key is the API and worker env var `GOOGLE_CHAT_SERVICE_ACCOUNT` (the JSON key, base64). Both services start without it; then the Google Chat card shows "not available on this server" and Google Chat deliveries fail with `no_chat_connection`. Self-hosters create their own Chat app with the same steps as the deploy docs.
- **Inbound events.** `POST /webhooks/google-chat` receives Chat app events. Each request carries a Google-signed bearer token: the API verifies it (RS256) against the keys of `chat@system.gserviceaccount.com`, with issuer `chat@system.gserviceaccount.com` and audience equal to the Google Cloud project number of the Chat app (`GOOGLE_CHAT_PROJECT_NUMBER`, required when `GOOGLE_CHAT_SERVICE_ACCOUNT` is set). Anything else is 401. Handled events: `ADDED_TO_SPACE`, `REMOVED_FROM_SPACE`, `MESSAGE` in a direct message. Every other event answers 200 with an empty body.
- **Binding a space to an installation.** There is no OAuth workspace grant like Slack's, so a space id in someone's `standcast.yml` must not be enough to post into it (otherwise any org could post into another company's space that has the app). When the app is added to a space, it replies in that space with a one-time link code (8 characters, valid 24 hours, signed like the state tokens) and the instruction "An admin of your GitHub organization pastes this code in Standcast, Configuration → Google Chat". Pasting it in the web app or the setup page (admin only) stores the binding `google_chat_spaces (installation_id, space_name, display_name, linked_at)`. A delivery to a space not bound to the team's installation fails with `space_not_linked`. Removing the app from the space deletes the binding. The `connections` row for `google-chat` (external id = the first bound space's workspace customer id when the event carries it, else the space name) marks Google Chat as connected for the setup status.
- **Identities.** The Chat API cannot look a user up by email with app authentication, so people link by messaging the app once: on a `MESSAGE` or `ADDED_TO_SPACE` event in a direct message, the API takes `user.name` (`users/123…`) and `user.email`, finds members whose verified GitHub email matches (case-insensitive), and writes the `google-chat` identity for every installation of that member that has Google Chat connected. The app answers "You're linked, @login." or "No Standcast account uses this email; run `standcast login` first, then message me again." The `members.<login>.google_chat` override in `standcast.yml` (format `users/<digits>`, validated) still wins. `findUserByEmail` returns null for Google Chat; `linkChatIdentities` at login only applies overrides for it.
- **Direct messages.** `sendDirect(userId)` finds the DM space with `spaces.findDirectMessage(name = userId)`; no DM space fails with `no_dm_space`, and the reminder or blocker route records that failure like `no_chat_identity`. `forgetStaleChatIdentity` treats a 404 user as stale, like Slack's `user_not_found`.
- **Threads.** `postToChannel` returns `{ channel: spaceName, id: threadName }`; `replyInThread` posts with `thread.name = ref.id` and `messageReplyOption = REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD`.
- **Rendering.** Text messages, not cards: `renderGoogleChat(msg)` maps `heading` to `*bold*` lines, paragraphs to text, list items to `• ` lines, `divider` to a blank line, links to `<url|text>` (http and https only), mentions to `<users/123>` only for ids matching `users/\d+`, otherwise `@login`. Text is cut at 4,096 characters, with a "… see Standcast" tail. Cards are a later polish.
- **Channel check.** `checkChannel(space)` calls `spaces.get`: 404 → `not_found`, 403 → `not_member`. Setup notices reuse `channel_not_found` and `channel_not_member`, with provider-specific copy ("add the Standcast app to the space").
- **Errors.** `ChatDeliveryError` moves from `@standcast/slack` to `@standcast/core` so both adapters share it. Google codes map to the existing ones where they mean the same (`timeout`, `ratelimited` for 429, `invalid_auth` for 401, `request_failed`) plus `space_not_linked`, `no_dm_space`. Retries follow the existing delivery rules.
- **Wiring.** `chatFor(installationId, provider)` takes `'slack' | 'google-chat'`; every use case passes `team.chat.provider` instead of the literal `'slack'`; `unsupported_provider` stays only as a defensive branch. `chatUserIdsFor` reads the identity and override of the team's provider.
- **Package.** `packages/adapters/google-chat` (`@standcast/google-chat`), using `fetch` against `https://chat.googleapis.com/v1` and a small signed-JWT service account token exchange, not `googleapis` (too large for the worker and the CLI bundle). Pinned dependency for JWT verification only if the existing code has none.
- **UI.** Web app Configuração gains a Google Chat card next to Slack: status, bound spaces with copyable names, the code input, and a link to the app in Google Chat. The server-rendered setup page gets the same step. The config template offers both providers.
- **Docs.** New `docs/site/admin/google-chat.md` (en and pt-BR): add the app, link a space, link people, delivery errors. Updates to configuration (remove "coming soon"), install, privacy (what the app reads and stores), troubleshooting, FAQ, landing copy ("Google Chat is next" → available), deploy docs (`GOOGLE_CHAT_SERVICE_ACCOUNT`, `GOOGLE_CHAT_PROJECT_NUMBER`, creating the Chat app), changelogs.

## What Felipe does outside the code

1. Google Cloud project with the Google Chat API enabled.
2. A service account and its JSON key, set in Railway for the API and the worker.
3. Chat API configuration: name Standcast, avatar, description, "Join spaces and group conversations" on, connection "HTTP endpoint URL" = `https://api-standcast.usefachada.dev/webhooks/google-chat`, authentication audience "Project number", visibility to his domain while testing.
4. Later, the Google Workspace Marketplace listing for other domains.

## Open for the builder

- Exact copy of the in-chat replies, within the meaning above.
- Whether the workspace customer id is available in events; fall back to the space name as stated.
