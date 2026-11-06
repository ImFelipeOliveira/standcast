# Google Chat

Standcast can post a team's digest to a Google Chat space instead of a Slack channel. The Standcast app for Google Chat does what the Slack bot does:

- posts the team digest in the space at `digest_at`, and late dailies in its thread;
- sends reminders and routed blockers by direct message;
- sends suggested blockers by direct message when the team has `signals.direct_message: true`.

One organization can use Slack for one team and Google Chat for another. You choose per team in `standcast.yml`.

The app does not read messages in spaces. It has no cards or commands: the daily is still written in your AI agent or the CLI.

## Availability

The app works in Google Workspace domains where it is available. A listing on the Google Workspace Marketplace is coming, so that any Workspace domain can install it. Until then, if you cannot find the Standcast app in Google Chat, email <SupportEmail />.

If the Google Chat card in the web app says "Google Chat is not available on this server.", the Standcast server you use has no Google Chat app set up.

## 1. Add the app to a space

1. In Google Chat, open the space where the digest should go.
2. Open the space menu, choose **Apps & integrations**, then **Add apps**, and pick **Standcast**.

The app posts a message in the space, in English and Portuguese, with a link code:

> Standcast is in this space. To get digests here, an admin of your GitHub organization pastes this code in Standcast, Configuration → Google Chat: `K7QF3MZP`. The code is valid for 24 hours.

The code has 8 characters, is valid for 24 hours and works once. To get a new code, remove the app from the space and add it again. The new code replaces the old one.

## 2. Link the space

Only an organization admin can link a space: a GitHub organization admin, or the account owner for a personal account.

In the [web app](/admin/web-app), open **Settings**. In the **Google Chat** card, paste the code in **Link code** and click **Link space**. You can also use the **Google Chat** step at the end of the server-rendered setup page.

The card then lists the linked spaces, with the space's display name and its name, such as `spaces/AAAAbbbbCCC`. Use **Copy** to copy the name for `standcast.yml`. Other members see the list read-only.

If the code does not work:

| Message | Fix |
| --- | --- |
| This code is not valid. It may have expired or been used already. | Remove the app from the space and add it again to get a new code. |
| This space is already linked to another organization. | An admin of that organization unlinks it first. |
| Too many attempts. Wait a minute and try again. | Wait a minute. Link attempts are limited to 10 per minute. |

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

The setup page and the web app warn on the team's card when the space is not linked to your organization, was not found, or does not have the app.

## Unlink a space

In the Google Chat card, an admin clicks **Unlink**, then **Unlink now**. Standcast stops posting in that space. Removing the app from the space in Google Chat does the same.

When the organization has no linked space left, Google Chat is disconnected. People's Google Chat links are kept, so they work again as soon as a space is linked. To link the space again, remove the app from the space and add it again to get a new code.

## How people are linked

Google Chat does not let the app find a person by email, so each person links themselves once:

1. Run `standcast login`, so Standcast knows your GitHub account.
2. In Google Chat, send the Standcast app a direct message. Any text works.

Standcast matches the email of your Google account with the primary verified email of your GitHub account, and links you in every organization of yours that has a linked space. The app answers:

| Answer | What it means |
| --- | --- |
| You're linked, @your-login. | Done. |
| No Standcast account uses this email; run `standcast login` first, then message me again. | Standcast has no account with this email. Sign in first. If your GitHub email is different, see below. |
| I found your account, but none of your organizations has connected Google Chat to Standcast yet. Ask an admin to link a space, then message me again. | Link a space first, then message the app again. |

The answer is in the team's language when Standcast knows it, otherwise in English and Portuguese.

When the emails differ, an admin maps the person by hand in `standcast.yml`, with their Google Chat user id:

```text
members:
  bob: { google_chat: users/123456789 }
```

The value must be `users/` followed by digits. The digits are the person's Google user id, the same id the Google Workspace Admin SDK and the People API use.

The digest mentions use the mapping. Direct messages use it only when the person is a member of at least one space linked to your organization: before each direct message, Standcast asks Google Chat whether that user is in one of your linked spaces. If they are not, nothing is sent and the delivery fails with `no_chat_identity`. This keeps a mapping from reaching people outside your organization. When the mapping is the same user the person linked by direct message, no check is needed.

The digest mentions each linked person with their Google Chat user, and shows `@` followed by their GitHub login as plain text otherwise.

## What happens without a link

- **The person is not linked.** Reminders, routed blockers and suggested blockers for them fail with `no_chat_identity`. The digest still goes out, with `@login`.
- **The person never opened a direct message with the app.** Google Chat sends a direct message only after the person has talked to the app once. Deliveries to them fail with `no_dm_space` and are not retried. Ask them to send the app a direct message.
- **The space is not linked to your organization.** The digest and late dailies for the team fail with `space_not_linked`. Nothing is posted, and it is not retried. Link the space with a code.

## Delivery errors

When a post fails, the setup page and the web app list it under "Latest failed deliveries". Standcast tries each message up to 3 times in total, with the same time limits as Slack: a digest is retried only within 120 minutes after `digest_at`, and a reminder is never sent at or after `digest_at`.

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
| `no_chat_connection` | No space is linked to this organization, or the server has no Google Chat app. | Link a space. |
| `no_chat_identity` | The person, or the manager a blocker fell back to, has no Google Chat link, or their `members.<login>.google_chat` user is in none of your linked spaces. | Ask the person to message the app, or add them to a linked space. |
| `no_route_target` | A blocker had no recipient at all, for example because the author is the team's only manager. | Add another manager to the team. |
| `worker_died` | The worker stopped three times while sending. | Contact support if it repeats. |
| `internal_error` | Unexpected error. | Contact support if it repeats. |

## Limits worth knowing

- Messages are plain text. A digest longer than 4,096 characters is cut and ends with "… see Standcast".
- The app reacts only to being added to or removed from a space, and to direct messages. Mentioning it in a space does nothing.
- Link codes: 8 characters, valid for 24 hours, single use. Link attempts are limited to 10 per minute.
- Standcast handles at most 120 Google Chat events per space per minute.

What the app receives and stores is in [Privacy](/privacy#google-chat).
