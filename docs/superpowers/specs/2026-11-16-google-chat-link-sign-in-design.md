# Link a Google Chat account by signing in from the chat

## Why

A person who never signed in to Standcast (web app or `standcast login`) clicks **Link my account** under the digest, or mentions or messages the app, and gets "No Standcast account uses this email". They have to leave the chat, sign in somewhere else, come back and try again. Many give up and stay as `@login` in the digest, with no reminders or routed blockers by direct message.

Linking should finish in one go from the chat: click, sign in with GitHub, done.

## Goals

- When the email lookup finds no account, the app answers privately with a sign-in link. Following it, signing in with GitHub and confirming on one web page links that Google Chat user, with no second click or message in the chat.
- It works whether or not the Google email is a verified email of the GitHub account.
- The person sees the result on the web page and gets a confirmation in Google Chat.

## Non-goals

- Changing the email match for people who already signed in: their click still links at once, as today.
- Removing or changing the admin mapping (`members: { bob: { google_chat: users/… } }`).
- Slack: Slack already finds people by email.

## Anti-goals

- A link that someone other than the clicker can use: it must only ever travel in a private answer and expire quickly.
- A link that can be used twice, or that links a Chat user the person did not prove to be.
- A forwarded link that links someone else's Chat user to the person who opens it without them seeing which Chat account it is (see Security notes).
- Silently replacing a mapping an admin set in `standcast.yml`.

## Approaches

1. **Private sign-in link with a single-use token (picked).** The no-match answer carries a link with a random token stored hashed, tied to the clicker's Google Chat user id. The link goes through the existing GitHub web login; when the person is back with a session, the token is consumed and the user id is linked to that member. Opening the private link proves the Chat identity; the GitHub login proves the GitHub identity, so no email match is needed on this path.
2. **Better wording only.** The answer links to the web app and asks the person to click again after signing in. Cheap, but keeps the round trip the user asked to remove.
3. **Sign-in link plus the email rule.** Same as 1, but link only when the Google email is a verified GitHub email. People without the institutional email on GitHub would still be stuck, and would need a separate "add your email on GitHub" flow. The user chose not to build that flow.

Picked 1, agreed with the user on 2026-11-16: the token flow proves both sides, so it also covers people whose institutional email is not on GitHub, with no extra flow. After the builder check found that a forwarded link could link the sender's Chat user to whoever opens it, the user chose a confirmation page before linking (2026-11-16) over linking as soon as the page opens.

## Design

### When the link is offered

In `handleGoogleChatEvent` (`packages/orchestrator/src/modules/chat/google-chat-events.ts`), `linkIdentities` answers `googleChat.notFound` when no member has the email. On that answer only, when the event has a valid Google Chat user id (`users/` + digits), the app issues a sign-in token and adds the link to the answer:

- click on **Link my account** or a mention in a space: the answer is already private to the clicker (`privateTo`); the link goes in it.
- direct message to the app: the DM space has only that person; the link goes in the answer.

The `ambiguous` and `notConnected` answers stay as they are: signing in does not fix them. The map hint (`googleChat.mapHint`) stays under the link for people who cannot sign in.

### The token

- 32 random bytes, base64url, generated with the same helpers as the space link code (`generateLinkCode`/`hashLinkCode` style). Only the SHA-256 hash is stored.
- New table `google_chat_sign_in_tokens`: `token_hash` (primary key), `chat_user_id`, `chat_email` (the Google email from the event, nullable), `created_at`, `expires_at`, `used_at` (nullable). No installation id: the Chat user id is global, and linking writes to every installation of the member that has Google Chat connected, as the email path does.
- Lifetime 15 minutes. Issuing a new token for the same `chat_user_id` deletes that user's unused tokens.
- Consumed by compare-and-swap: `UPDATE … SET used_at = now WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now RETURNING chat_user_id`. A second use, or an expired token, gets no row.
- Rows are deleted by the existing prune job 1 day after `expires_at`.

### The web flow

Two routes in `apps/api/src/routes/web.tsx`, both thin: they read input, call a use case in `packages/orchestrator/src/modules/chat/` and render.

- `GET /link/google-chat?token=…` shows the confirmation page. It never consumes the token.
  - Without a session it uses the existing `loginRedirect`, so the person goes through `/auth/github/login?next=/link/google-chat?token=…` and comes back to the same URL after GitHub. The token rides in `next` inside the signed login state; it is not logged.
  - With a session it calls `previewGoogleChatSignInLink(deps, { memberId, token })`, which reads the token without consuming it. A missing, used or expired token shows the "expired" result. Otherwise the page shows the Google email of the Chat account (`chat_email`; the Chat user id when the email is missing), the person's GitHub login, and, when the member is already linked to a different Chat user in any of their installations, that it replaces the current link (with that account's email when known). Buttons: **Link** and **Cancel**.
- `POST /link/google-chat` with the token in the form body and the CSRF field, checked with the existing `readForm`/`verifyCsrf`. It calls `completeGoogleChatSignInLink(deps, { memberId, token })`:
  - consumes the token by CAS (see above);
  - links `chat_user_id` to the member in every installation of the member with Google Chat connected, with the same per-installation write the email path uses (`linkMember`, `writeIdentityIfConnected`). Extract that write so both paths share it; the email path keeps its behaviour (non-goal), so the checks below run only on this path, before the shared write;
  - in each installation, skips it when that installation's `standcast.yml` maps this member to a different Google Chat user, or maps another member to this Google Chat user. The mapping wins, as it does at read time today;
  - in each installation it writes to, removes the Google Chat identity of any other member linked to this same Chat user (one Chat user is one member). A member already linked to a different Chat user gets the new one: the upsert replaces it, and the page already said so. *(Builder-check call by Claude: replace and clear, matching the one-to-one rule the email path enforces with `quarantineLinks`.)*
- **Cancel** is a link back to `/`; the token is left to expire.### Results

The page shows one of these, in the language of the person's teams, English when unknown (same rule as the chat answers):

| Result | Page text (en) |
| --- | --- |
| confirmation | Link the Google Chat account fulano@pigz.com.br to your GitHub account @login? (+ "This replaces the link to ciclano@pigz.com.br." when it does) |
| linked in at least one organization | You're linked, @login. You can close this page. |
| token missing, used or expired | This link expired. Click **Link my account** in Google Chat again. |
| signed in, but no organization of the member has Google Chat connected | Same text as the chat answer `googleChat.notConnected`. |
| every candidate installation skipped by an admin mapping | Your admin set your Google Chat account in standcast.yml, so nothing changed. |

On success the app also sends a direct message to the Chat user with the existing `googleChat.linked` text, through `sendDirect`. When the link replaced a different Chat user of the member, that previous Chat user also gets a direct message saying the account was linked to another Google Chat account, so a hijack does not go unnoticed. *(Claude's call.)* A failed DM is logged with `logError` and does not undo the link.

### Copy

New `t()` keys in pt-BR and en: the link label in the no-match answer (for example "Entrar com GitHub para vincular" / "Sign in with GitHub to link"), the confirmation page, the four results, and the direct message to a replaced Chat user. `googleChat.notFound` is reworded so it no longer says only "run `standcast login` first": it points to the link, and mentions the web app and the CLI as other ways to sign in.

### Docs

`docs/site/admin/google-chat.md` and its pt-BR page, "How people are linked": step 1 becomes optional, the answers table gets the sign-in link, and the note that signing in from the link does not need the emails to match. Privacy page: the new token table and its retention. Changelog EN and pt-BR.

## Security notes

- The link only appears in an answer private to the clicker, or in their own DM space.
- Single use, 15 minutes, stored hashed, consumed by CAS.
- A forwarded link cannot link silently: the confirmation page shows which Google account will be linked, and the POST is CSRF-protected. Someone tricked into confirming another person's Chat account still sees that account's email first, and their previously linked Chat user is told by direct message.
- The session that consumes it is the person's own GitHub sign-in; the member's installations come from that sign-in, so the link only applies where that GitHub login is a member.
- What is lost compared with the email rule: a person can link their Chat user to any GitHub account they control. The user accepted this.

## Left to the builder

- Exact page layout, reusing the existing web page components (`Layout`, `ErrorPage`).
- Whether the link in the chat answer is a text link (`<url|label>`) or a card button; a text link is enough.
- Test shape: use-case tests against Postgres for issue, preview without consuming, consume, expiry, double use, mapping precedence, replacing a link, clearing another member's link and multi-installation linking; route tests for the redirect through login, the confirmation page, CSRF on the POST and the result pages; event tests for when the link is and is not offered.
- How `sendDirect` is reached from the web route's use case (the same chat factory the delivery jobs use).
