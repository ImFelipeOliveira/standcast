# Google Chat

Standcast can post a team's digest to a Google Chat space instead of a Slack channel. The Standcast app for Google Chat does what the Slack bot does:

- posts each daily in the space when it is sent, and the team digest at `digest_at`;
- sends reminders and routed blockers by direct message;
- sends suggested blockers by direct message when the team has `signals.direct_message: true`.

One organization can use Slack for one team and Google Chat for another. You choose per team in `standcast.yml`.

The app does not read messages in spaces. It has no commands, and its only button is **Link my account** under the digest: the daily is still written in your AI agent or the CLI.

## Availability

The app works in Google Workspace domains where it is available. A listing on the Google Workspace Marketplace is coming, so that any Workspace domain can install it. Until then, if you cannot find the Standcast app in Google Chat, email <SupportEmail />.

If the Google Chat card in the web app says "Google Chat is not available on this server.", the Standcast server you use has no Google Chat app set up.

## 1. Add the app to a space

1. In Google Chat, open the space where the digest should go.
2. Open the space menu, choose **Apps & integrations**, then **Add apps**, and pick **Standcast**.

The app posts a message in the space with a link code. It is in the `language` of the teams whose `chat.channel` is this space in `standcast.yml`, and in English when no team uses the space yet or its teams have different languages:

> Standcast is in this space. To get digests here, an admin of your GitHub organization pastes this code in Standcast, Settings → Google Chat: `K7QF3MZP`. The code is valid for 24 hours.

The code has 8 characters, is valid for 24 hours and works once. To get a new code, remove the app from the space and add it again. The new code replaces the old one.

## 2. Link the space

Only an organization admin can link a space: a GitHub organization admin, or the account owner for a personal account.

In the [web app](/admin/web-app), open **Settings**. In the **Google Chat** card, paste the code in **Link code** and click **Link space**.

The card then lists the linked spaces, with the space's display name and its name, such as `spaces/AAAAbbbbCCC`. Use **Copy** to copy the name for `standcast.yml`. Other members see the list read-only.

If the code does not work:

| Message | Fix |
| --- | --- |
| This code is not valid. It may have expired or been used already. | Remove the app from the space and add it again to get a new code. |
| This space is already linked to another organization. | An admin of that organization unlinks it first. |
| Too many attempts. Wait a minute and try again. | Wait a minute. Link attempts are limited to 10 per minute. |
| This organization already has 20 linked spaces, the maximum. Unlink one first. | An organization can link up to 20 spaces. Unlink one you no longer use. |

Once linked, the app posts in the space which organization now gets digests there, in the language of the teams on the space, or in English as above. If that is not your organization, remove the app from the space to undo the link.

A space can be linked to one organization only. Pasting the code is what proves your organization may post there: the space name in `standcast.yml` alone is not enough.

## 3. Set the space in `standcast.yml`

Set `provider: google-chat` and the space name as the channel:

```text
chat:
  provider: google-chat
  channel: spaces/AAAAbbbbCCC
```

The space name starts with `spaces/`. Copy it from the Google Chat card, or take the last part of the space's address in Google Chat and add `spaces/` before it. See the [standcast.yml reference](/admin/configuration#chat).

The web app warns on the team's card when the space is not linked to your organization, was not found, or does not have the app.

## Unlink a space

In the Google Chat card, an admin clicks **Unlink**, then **Unlink now**. Standcast stops posting in that space. Removing the app from the space in Google Chat does the same.

When the organization has no linked space left, Google Chat is disconnected. People's Google Chat links are kept, so they work again as soon as a space is linked. To link the space again, remove the app from the space and add it again to get a new code.

## How people are linked

Google Chat does not let the app find a person by email, so each person links themselves once, from their team's space. Signing in to Standcast first is optional. In the team's space, do one of these:

- click **Link my account** under the team digest;
- mention the Standcast app, for example `@Standcast hi`.

A link applies only to the organization of the space where you click or mention the app, never to your other organizations. To link in another organization, do it from a space of that organization.

A direct message to the app does not link: it belongs to no organization. The app answers that it links accounts from your team's space.

The digest shows the **Link my account** button only while someone in it is not linked and shows as `@login`. The button works for whoever clicks it: it links the person who clicked, never the people named in the digest.

Both ways do the same thing. If you signed in before, Standcast matches the email of your Google account with any verified email of your GitHub account, primary or not, among the members of the space's organization, and links you there. It stores only your Google Chat user id. Clicking again, or mentioning the app again, keeps a single link. The app answers, and the answer is visible only to you:

| Answer | What it means |
| --- | --- |
| You're linked, @your-login. | Done. |
| No Standcast account in this organization uses this email. The answer also carries a private sign-in link, "Sign in with GitHub to link your account". | No member of this organization has this email. Open the link, sign in with GitHub and confirm. It is valid for 15 minutes and works once. You can also sign in on the web app or with `standcast login` and click again. If you cannot sign in, see below. |
| I link accounts from your team's space. Click Link my account under your team's digest, or mention me in that space. | You sent the app a direct message. Do it from the team's space instead. |
| This space is not linked to an organization on Standcast yet. Ask an admin to link it, then click Link my account again. | The space is not linked to an organization, or the organization no longer has Google Chat connected. An admin links the space with a code; then click **Link my account** or mention the app again. |
| This email belongs to more than one GitHub account on Standcast, so I linked none of them. Ask an admin to set `google_chat` for you under `members` in standcast.yml, or keep the email only on your own GitHub account and run `standcast login` again. | Two or more GitHub accounts signed in to Standcast share this email, so Standcast links none of them. In the space's organization, it also removes the Google Chat links of those accounts and any link to this Google Chat user. Map the person by hand, as below, or remove the email from the other accounts. |

The answer is in one language only: the language of the teams on the space where you click the button or mention the app. When Standcast cannot tell, or those teams have different languages, it is in English. When no account or more than one account has the email, the app also tells the person their Google Chat id (`users/` followed by digits), ready for the mapping below.

### The sign-in link

The link works even when the email of your Google account is not a verified email of your GitHub account. It proves the two sides itself: only you got the link, and you sign in with GitHub. The emails do not need to match.

1. Open the link and sign in with GitHub if you are not signed in.
2. Standcast shows a page: "Link the Google Chat account you@company.com to your GitHub account @login in your-org?" Check that the Google account is yours.
3. Click **Link**. The page says "You're linked in your-org, @login. You can close this page." and the app sends you a direct message with "You're linked, @login." **Cancel** changes nothing.

The link is single use and expires after 15 minutes. It links your Google Chat user only in the organization of the space where you clicked, and only when your GitHub account is a member of that organization. Otherwise the page says "Your GitHub account @login is not a member of your-org on Standcast. Sign in with the GitHub account you use there."

Other pages you may see:

| Page | What it means |
| --- | --- |
| This link expired. Click Link my account in Google Chat again. | The link expired or was used already. Ask for a new one. |
| your-org no longer has Google Chat connected to Standcast. Ask an admin to link a space. | The organization has no linked space now. |
| Your admin set your Google Chat account in standcast.yml, so nothing changed. | An admin mapping in `standcast.yml` wins over the link. |
| This replaces your current Google Chat link in your-org. | Shown before you confirm when you were already linked to another Google Chat account in that organization. |

A Google Chat user is one person: when you link, any other member of that organization linked to the same Google Chat user is unlinked. When your link replaces another Google Chat account of yours, that account gets a direct message: "Another Google Chat account was linked to @login in your-org, so this one no longer is. If that wasn't you, tell an admin."

GitHub sends Standcast your verified emails when you run `standcast login` or sign in to the web app. Your primary email always matches. Your other verified emails match only for 30 days after that sign-in, so an email you remove from GitHub stops matching by then. After you add and verify your Google email on GitHub, sign in again in one of these ways, then click **Link my account** or mention the app in the team's space within 30 days. If your GitHub account has 1,000 emails or more, Standcast cannot read them all and keeps the list from your previous sign-in until its 30 days run out; ask an admin to map you by hand, as below.

When the Google email is not a verified email of the GitHub account, an admin maps the person by hand in `standcast.yml`, with their Google Chat user id:

```text
members:
  bob: { google_chat: users/123456789 }
```

The value must be `users/` followed by digits. The digits are the person's Google user id, the same id the Google Workspace Admin SDK and the People API use.

The digest mentions use the mapping as is, with no check. Direct messages check it only when the mapping is a different user from the one the person linked from the chat: before each such direct message, Standcast asks Google Chat whether that user is in one of your linked spaces. It checks every linked space, up to 5 at a time and up to 4 seconds per check, and stops at the first one where the person is a member. If they are in none of them, nothing is sent and the delivery fails with `no_chat_identity`. If Google Chat does not answer in time, the delivery fails with `timeout`: reminders and routed blockers are retried, a suggested blocker message is not. When the mapping is the same user the person linked from the chat, Standcast sends without the check. A linked space can include external guests, so map only people you trust.

The digest mentions each linked person with their Google Chat user, and shows `@` followed by their GitHub login as plain text otherwise.

## What happens without a link

- **The person is not linked.** Reminders, routed blockers and suggested blockers for them fail with `no_chat_identity`. The digest still goes out, with `@login`. The **Link my account** button appears only when the worker has `PUBLIC_URL` set.
- **No one a blocker would go to can be reached.** When none of the people Standcast picked for a blocker, such as the reviewers, the code owners or the people on the card, has a Google Chat link or a confirmed mapping, the blocker goes to the team's managers instead. No failure is recorded for the people it first picked. The exception is a membership check that timed out: then the blocker does not go to the managers, and the delivery to that person fails with `timeout` and is retried.
- **The person never opened a direct message with the app.** Google Chat sends a direct message only after the person has talked to the app once in a direct message. Linking with the button or a mention is not enough for that. Deliveries to them fail with `no_dm_space` and are not retried. Ask them to send the app a direct message.
- **The space is not linked to your organization.** The digest and dailies for the team fail with `space_not_linked`, and nothing is posted until the space is linked. The failure is not retried right away; a later run, such as the next digest attempt or the summary, tries the same delivery again while it has had fewer than 3 attempts. Link the space with a code.

## Delivery errors

When a post fails, the web app lists it under "Latest failed deliveries". Standcast tries each message up to 3 times in total, with the same time limits as Slack: a digest is retried only within 120 minutes after `digest_at`, and a reminder is never sent at or after `digest_at`.

| Error code | Meaning | Fix |
| --- | --- | --- |
| `space_not_linked` | The team's space is not linked to this organization. Not retried right away; a later run tries again while the delivery has had fewer than 3 attempts. | Add the app to the space and link it with the code. |
| `no_dm_space` | The person has not messaged the Standcast app yet. Not retried. | Ask the person to send the app a direct message. |
| `channel_not_found` | The space does not exist, or `chat.channel` is not a valid `spaces/...` name. | Check `chat.channel`. Copy the name from the Google Chat card. |
| `not_in_channel` | The app is not in the space, or cannot post there. | Add the Standcast app to the space. |
| `user_not_found` | Google Chat does not know the person's user. Standcast removes the stored link. | Ask the person to click **Link my account** or mention the app in the team's space again, or fix `members.<login>.google_chat`. |
| `invalid_auth` | Google Chat rejected the credentials of the Standcast app. | Contact support. |
| `ratelimited` | Google Chat asked Standcast to slow down. | Nothing to do; it is retried. |
| `timeout`, `request_failed`, `http_error`, `invalid_response` | Google Chat did not answer in time, could not be reached, or answered with an error. | Nothing to do; it is retried. Contact support if it repeats. |
| `no_chat_connection` | No space is linked to this organization, or the server has no Google Chat app. | Link a space. If Settings says Google Chat is not available on this server, contact the server operator to configure Google Chat. |
| `no_chat_identity` | The person, or the manager a blocker fell back to, has no Google Chat link, or their `members.<login>.google_chat` user is in none of your linked spaces. | Ask the person to click **Link my account** or mention the app in the team's space, or add them to a linked space. |
| `no_route_target` | A blocker had no recipient at all, for example because the author is the team's only manager. | Add another manager to the team. |
| `worker_died` | The worker stopped three times while sending. | Contact support if it repeats. |
| `internal_error` | Unexpected error. | Contact support if it repeats. |

## Limits worth knowing

- Messages are plain text, plus the **Link my account** card under a digest. A digest longer than 4,096 characters is cut and ends with "… see Standcast".
- The app reacts only to being added to or removed from a space, to direct messages, to mentions in a space and to the **Link my account** button. A direct message only gets the answer above. A mention in a space or a click only links the person; the app does not read the text.
- Sign-in links: valid for 15 minutes, single use. A new link for the same person and organization replaces the previous unused one.
- The button needs the Standcast server to know its public address: on a server you run, set `PUBLIC_URL` on the worker. Without it, the digest has no button.
- Link codes: 8 characters, valid for 24 hours, single use. Link attempts are limited to 10 per minute.
- Standcast handles at most 120 Google Chat events per space per minute.

What the app receives and stores is in [Privacy](/privacy#google-chat).
