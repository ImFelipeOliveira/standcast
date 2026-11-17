# Link a Google Chat account by signing in from the chat

## Why

A person who never signed in to Standcast (web app or `standcast login`) clicks **Link my account** under the digest, or mentions or messages the app, and gets "No Standcast account uses this email". They have to leave the chat, sign in somewhere else, come back and try again. Many give up and stay as `@login` in the digest, with no reminders or routed blockers by direct message.

Linking should finish in one go from the chat: click, sign in with GitHub, done.

## Goals

- When the email lookup finds no account, the app answers privately with a sign-in link.
- Every link from Google Chat, by the sign-in link or by the email match, applies only to the organization of the space where the person clicked or mentioned the app, never to their other organizations. Decided by the user on 2026-11-16. Following it, signing in with GitHub and confirming on one web page links that Google Chat user, with no second click or message in the chat.
- It works whether or not the Google email is a verified email of the GitHub account.
- The person sees the result on the web page and gets a confirmation in Google Chat.

## Non-goals

- Changing how the email match works for people who already signed in: their click still links at once by email, as today, but only in the space's organization (see Goals).
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

### Scope of every Google Chat link

Today `linkIdentities` links the member in every installation of theirs that has Google Chat connected, and a direct message to the app links too. Both change:

- A click on **Link my account** or a mention in a space resolves the space's installation (`google_chat_spaces.installation_id` with `linked_at` set). The email match, the ambiguity check and `quarantineLinks` run only in that installation, and only for members of it (`member_installations`). A member found by email who is not in that installation gets the `notFound` answer with the sign-in link, so they can sign in with the GitHub account they use there.
- A space with no linked installation gets `googleChat.notConnected`, with no link.
- A direct message to the app no longer links anything: it belongs to no organization. It answers with a new text that tells the person to click **Link my account** under their team's digest, or mention the app in their team's space.

Existing identities in other installations are left as they are.

### When the link is offered

In `handleGoogleChatEvent` (`packages/orchestrator/src/modules/chat/google-chat-events.ts`), `linkIdentities` answers `googleChat.notFound` when no member has the email. On that answer only, when the event has a valid Google Chat user id (`users/` + digits), the app issues a sign-in token and adds the link to the answer:

- click on **Link my account** or a mention in a space linked to an installation (`google_chat_spaces.installation_id`, `linked_at` set): the answer is already private to the clicker (`privateTo`); the link goes in it, scoped to that installation. A space not linked to any installation gets today's answer, with no link.
- direct message to the app: no link (see Scope above).

The `ambiguous` and `notConnected` answers stay as they are: signing in does not fix them. The map hint (`googleChat.mapHint`) stays under the link for people who cannot sign in.

### The token

- 32 random bytes, base64url, generated with the same helpers as the space link code (`generateLinkCode`/`hashLinkCode` style). Only the SHA-256 hash is stored.
- New table `google_chat_sign_in_tokens`: `token_hash` (primary key), `chat_user_id`, `chat_email` (the Google email from the event, nullable), `installation_id` (the installation of the space, foreign key to `installations`, `ON DELETE cascade`), `space_name`, `created_at`, `expires_at`, `used_at` (nullable). Decided by the user on 2026-11-16: the link applies only to the installation of the space where it was issued.
- Lifetime 15 minutes. Issuing a new token for the same `chat_user_id` and installation deletes that user's unused tokens for that installation.
- Consumed by compare-and-swap: `UPDATE … SET used_at = now WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now RETURNING chat_user_id, installation_id`. A second use, or an expired token, gets no row.
- Rows are deleted by the existing prune job 1 day after `expires_at`.

### The web flow

The confirmation page lives in the web app (`apps/web`) at `/link/google-chat?token=…`, and the private Chat answer links there (`APP_URL`). It is backed by two thin JSON routes in `apps/api/src/routes/app.ts`, `GET` and `POST /v1/app/google-chat/link`, behind the `/v1/app/*` session, CORS, rate limit and CSRF header checks; they call a use case in `packages/orchestrator/src/modules/chat/` and return its result without the language. Decided by the user on 2026-11-16, replacing an earlier server-rendered page in `apps/api`.

- `GET /v1/app/google-chat/link?token=…` returns the confirmation view. It never consumes the token.
  - Without a session it answers 401 and the web app sends the person to `/sign-in?next=/link/google-chat?token=…`, through GitHub and back to the same page. The token rides in `next` inside the signed login state; it is not logged.
  - With a session it calls `previewGoogleChatSignInLink(deps, { memberId, token })`, which reads the token without consuming it. A missing, used or expired token shows the "expired" result. When the signed-in member does not belong to the token's installation (`member_installations`), the page shows the "not in this organization" result without consuming the token. Otherwise the page shows the Google email of the Chat account (`chat_email`; the Chat user id when the email is missing), the person's GitHub login, the organization name (the installation's account login), and, when the member is already linked to a different Chat user in that installation, that it replaces the current link (with that account's email when known). Buttons: **Link** and **Cancel**.
- `POST /v1/app/google-chat/link` with the JSON body `{ token }` and the CSRF header of every `/v1/app/*` write. It calls `completeGoogleChatSignInLink(deps, { memberId, token })`:
  - consumes the token by CAS (see above);
  - checks again that the member belongs to the token's installation; if not, the result is "not in this organization" (the token is already used, so they need a new one);
  - links `chat_user_id` to the member in that installation only, with the same per-installation write the email path uses (`writeIdentityIfConnected`). Extract that write so both paths share it. The mapping check below runs only on this path, before the shared write; the email path keeps its own rules, now scoped to the space's installation;
  - skips the write when that installation's `standcast.yml` maps this member to a different Google Chat user, or maps another member to this Google Chat user. The mapping wins, as it does at read time today;
  - removes, in that installation, the Google Chat identity of any other member linked to this same Chat user (one Chat user is one member). A member already linked to a different Chat user gets the new one: the upsert replaces it, and the page already said so. *(Builder-check call by Claude: replace and clear, matching the one-to-one rule the email path enforces with `quarantineLinks`.)*
- **Cancel** is a link back to `/`; the token is left to expire.

### Results

The page shows one of these, in the web app's language (the person's choice there, else the browser's):

| Result | Page text (en) |
| --- | --- |
| confirmation | Link the Google Chat account fulano@pigz.com.br to your GitHub account @login? (+ "This replaces the link to ciclano@pigz.com.br." when it does) |
| linked | You're linked in org, @login. You can close this page. |
| the member is not in the space's organization | Your GitHub account @login is not a member of org on Standcast. Sign in with the GitHub account you use there. |
| token missing, used or expired | This link expired. Click **Link my account** in Google Chat again. |
| the installation no longer has Google Chat connected | Same text as the chat answer `googleChat.notConnected`. |
| skipped by an admin mapping | Your admin set your Google Chat account in standcast.yml, so nothing changed. |

On success the app also sends a direct message to the Chat user with the existing `googleChat.linked` text, through `sendDirect`. When the link replaced a different Chat user of the member, that previous Chat user also gets a direct message saying the account was linked to another Google Chat account, so a hijack does not go unnoticed. *(Claude's call.)* A failed DM is logged with `logError` and does not undo the link.

### Copy

New `t()` keys in pt-BR and en: the direct-message answer that points to the team's space, the link label in the no-match answer (for example "Entrar com GitHub para vincular" / "Sign in with GitHub to link"), the confirmation page, the five results, and the direct message to a replaced Chat user. `googleChat.notFound` is reworded so it no longer says only "run `standcast login` first": it points to the link, and mentions the web app and the CLI as other ways to sign in.

### Docs

`docs/site/admin/google-chat.md` and its pt-BR page, "How people are linked": step 1 becomes optional; linking happens from the team's space and applies only to that space's organization; a direct message to the app no longer links; the answers table gets the sign-in link and the new direct-message answer; and signing in from the link does not need the emails to match. Privacy page: the new token table and its retention. Changelog EN and pt-BR.

## Security notes

- The link only appears in an answer private to the clicker, or in their own DM space.
- Single use, 15 minutes, stored hashed, consumed by CAS.
- A forwarded link cannot link silently: the confirmation page shows which Google account will be linked, and the POST is CSRF-protected. Someone tricked into confirming another person's Chat account still sees that account's email first, and their previously linked Chat user is told by direct message.
- The session that consumes it is the person's own GitHub sign-in, and the link only applies to the installation of the space it came from, and only when that GitHub login is a member of it.
- What is lost compared with the email rule: a person can link their Chat user to any GitHub account they control. The user accepted this.

## Left to the builder

- Exact page layout, reusing the existing web page components (`Layout`, `ErrorPage`).
- Whether the link in the chat answer is a text link (`<url|label>`) or a card button; a text link is enough.
- Test shape: use-case tests against Postgres for issue, preview without consuming, consume, expiry, double use, mapping precedence, replacing a link, clearing another member's link, a member of several installations linked only in the space's one, and a member outside the space's installation; route tests for the redirect through login, the confirmation page, CSRF on the POST and the result pages; event tests for when the link is and is not offered (linked space, unlinked space, DM), and for the email path linking only in the space's installation (a member of two installations, a member found by email outside the space's installation, ambiguity quarantined only there).
- How `sendDirect` is reached from the web route's use case (the same chat factory the delivery jobs use).
