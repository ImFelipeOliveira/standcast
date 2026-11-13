# Google Chat

Standcast can post a team's digest to a Google Chat space instead of a Slack channel. The Standcast app for Google Chat does what the Slack bot does:

- posts the team digest in the space at `digest_at`, and late dailies in its thread;
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

The app posts a message in the space, in English and Portuguese, with a link code:

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

Once linked, the app posts in the space, in English and Portuguese, which organization now gets digests there. If that is not your organization, remove the app from the space to undo the link.

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

Google Chat does not let the app find a person by email, so each person links themselves once:

1. Run `standcast login`, so Standcast knows your GitHub account.
2. In Google Chat, do one of these:
   - click **Link my account** under the team digest;
   - mention the Standcast app in a space where it is, for example `@Standcast hi`;
   - send the Standcast app a direct message. Any text works.

The digest shows the **Link my account** button only while someone in it is not linked and shows as `@login`. The button works for whoever clicks it: it links the person who clicked, never the people named in the digest.

All three ways do the same thing. Standcast matches the email of your Google account with any verified email of your GitHub account, primary or not, and links you in every organization of yours that has a linked space. It stores only your Google Chat user id. Clicking again, or messaging the app again, keeps a single link. The app answers; after a click or a mention in a space, the answer is visible only to you:

| Answer | What it means |
| --- | --- |
| You're linked, @your-login. | Done. |
| No Standcast account uses this email; run `standcast login` first, then message me again. | Standcast has no account with this email. Sign in first. If none of your verified GitHub emails is this one, see below. |
| I found your account, but none of your organizations has connected Google Chat to Standcast yet. Ask an admin to link a space, then message me again. | Link a space first, then message the app again. |
| This email belongs to more than one GitHub account on Standcast, so I linked none of them. Ask an admin to set `google_chat` for you under `members` in standcast.yml, or keep the email only on your own GitHub account and run `standcast login` again. | Two or more GitHub accounts signed in to Standcast share this email, so Standcast links none of them. In each of their organizations that use Google Chat, it also removes the Google Chat links of those accounts and any link to this Google Chat user. Map the person by hand, as below, or remove the email from the other accounts. |

The answer is in the team's language when Standcast knows it, otherwise in English and Portuguese. When no account or more than one account has the email, the app also tells the person their Google Chat id (`users/` followed by digits), ready for the mapping below.

GitHub sends Standcast your verified emails when you run `standcast login` or sign in to the web app. After you add and verify your Google email on GitHub, sign in again in one of these ways before you message the app.

When the Google email is not a verified email of the GitHub account, an admin maps the person by hand in `standcast.yml`, with their Google Chat user id:

```text
members:
  bob: { google_chat: users/123456789 }
```

The value must be `users/` followed by digits. The digits are the person's Google user id, the same id the Google Workspace Admin SDK and the People API use.

The digest mentions use the mapping as is, with no check. Direct messages check it only when the mapping is a different user from the one the person linked by direct message: before each such direct message, Standcast asks Google Chat whether that user is in one of your linked spaces. It checks every linked space, up to 5 at a time and up to 4 seconds per check, and stops at the first one where the person is a member. If they are in none of them, nothing is sent and the delivery fails with `no_chat_identity`. If Google Chat does not answer in time, the delivery fails with `timeout`: reminders and routed blockers are retried, a suggested blocker message is not. When the mapping is the same user the person linked by direct message, Standcast sends without the check. A linked space can include external guests, so map only people you trust.

The digest mentions each linked person with their Google Chat user, and shows `@` followed by their GitHub login as plain text otherwise.

## What happens without a link

- **The person is not linked.** Reminders, routed blockers and suggested blockers for them fail with `no_chat_identity`. The digest still goes out, with `@login`. The **Link my account** button appears only when the worker has `PUBLIC_URL` set.
- **No one a blocker would go to can be reached.** When none of the people Standcast picked for a blocker, such as the reviewers, the code owners or the people on the card, has a Google Chat link or a confirmed mapping, the blocker goes to the team's managers instead. No failure is recorded for the people it first picked. The exception is a membership check that timed out: then the blocker does not go to the managers, and the delivery to that person fails with `timeout` and is retried.
- **The person never opened a direct message with the app.** Google Chat sends a direct message only after the person has talked to the app once in a direct message. Linking with the button or a mention is not enough for that. Deliveries to them fail with `no_dm_space` and are not retried. Ask them to send the app a direct message.
- **The space is not linked to your organization.** The digest and late dailies for the team fail with `space_not_linked`. Nothing is posted, and it is not retried. Link the space with a code.

## Delivery errors

When a post fails, the web app lists it under "Latest failed deliveries". Standcast tries each message up to 3 times in total, with the same time limits as Slack: a digest is retried only within 120 minutes after `digest_at`, and a reminder is never sent at or after `digest_at`.

| Error code | Meaning | Fix |
| --- | --- | --- |
| `space_not_linked` | The team's space is not linked to this organization. Not retried. | Add the app to the space and link it with the code. |
| `no_dm_space` | The person has not messaged the Standcast app yet. Not retried. | Ask the person to send the app a direct message. |
| `channel_not_found` | The space does not exist, or `chat.channel` is not a valid `spaces/...` name. | Check `chat.channel`. Copy the name from the Google Chat card. |
| `not_in_channel` | The app is not in the space, or cannot post there. | Add the Standcast app to the space. |
| `user_not_found` | Google Chat does not know the person's user. Standcast removes the stored link. | Ask the person to message the app again, or fix `members.<login>.google_chat`. |
| `invalid_auth` | Google Chat rejected the credentials of the Standcast app. | Contact support. |
| `ratelimited` | Google Chat asked Standcast to slow down. | Nothing to do; it is retried. |
| `timeout`, `request_failed`, `http_error`, `invalid_response` | Google Chat did not answer in time, could not be reached, or answered with an error. | Nothing to do; it is retried. Contact support if it repeats. |
| `no_chat_connection` | No space is linked to this organization, or the server has no Google Chat app. | Link a space. If Settings says Google Chat is not available on this server, contact the server operator to configure Google Chat. |
| `no_chat_identity` | The person, or the manager a blocker fell back to, has no Google Chat link, or their `members.<login>.google_chat` user is in none of your linked spaces. | Ask the person to message the app, or add them to a linked space. |
| `no_route_target` | A blocker had no recipient at all, for example because the author is the team's only manager. | Add another manager to the team. |
| `worker_died` | The worker stopped three times while sending. | Contact support if it repeats. |
| `internal_error` | Unexpected error. | Contact support if it repeats. |

## Limits worth knowing

- Messages are plain text, plus the **Link my account** card under a digest. A digest longer than 4,096 characters is cut and ends with "… see Standcast".
- The app reacts only to being added to or removed from a space, to direct messages, to mentions in a space and to the **Link my account** button. A mention in a space or a click only links the person; the app does not read the text.
- The button needs the Standcast server to know its public address: on a server you run, set `PUBLIC_URL` on the worker. Without it, the digest has no button.
- Link codes: 8 characters, valid for 24 hours, single use. Link attempts are limited to 10 per minute.
- Standcast handles at most 120 Google Chat events per space per minute.

What the app receives and stores is in [Privacy](/privacy#google-chat).
