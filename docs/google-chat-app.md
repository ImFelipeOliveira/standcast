# Create the Google Chat app

Standcast is hosted by one operator, who creates one Google Chat app. Organizations then add that app to their Google Chat spaces and link each space with a code. There is no per-organization secret. Replace `<PUBLIC_URL>` below with the public address of your API. It must be the same value as the `PUBLIC_URL` environment variable, for example `https://api-standcast.usefachada.dev`.

Google Chat is optional. Without `GOOGLE_CHAT_SERVICE_ACCOUNT`, the api and the worker start normally, `POST /webhooks/google-chat` answers 404, the Google Chat card in the web app and the setup page shows "Google Chat is not available on this server.", and deliveries for `google-chat` teams fail with `no_chat_connection`.

## Values you need

| Field | Value |
| --- | --- |
| App name | `Standcast`, or any name your users will recognize |
| Avatar URL | An `https` URL of a square PNG or JPEG image |
| Description | A short line, for example `Daily standup digests from your AI agent` |
| Functionality | **Join spaces and group conversations** on |
| Connection | **HTTP endpoint URL**: `<PUBLIC_URL>/webhooks/google-chat` |
| Authentication audience | **Project number** |
| Scope used by Standcast | `https://www.googleapis.com/auth/chat.bot`, as the app itself through a service account |

## Step by step

Google renames its console labels from time to time. If a name below differs, look for the closest one.

1. **Google Cloud project.** In the [Google Cloud console](https://console.cloud.google.com), create a project for Standcast, or pick an existing one. Note its **Project number**, a string of digits shown on the project dashboard and in **IAM & Admin > Settings**. It is not the project ID.
2. **Enable the Google Chat API.** Go to **APIs & Services > Library**, search for **Google Chat API** and click **Enable**.
3. **Service account.** Go to **IAM & Admin > Service Accounts** and click **Create service account**. Give it a name such as `standcast-chat`. It needs no project role: skip the role and user steps.
4. **JSON key.** Open the service account, go to **Keys**, click **Add key > Create new key**, choose **JSON** and click **Create**. The browser downloads the key file. Keep it secret: it lets anyone post as your app. If your organization blocks key creation with the policy `iam.disableServiceAccountKeyCreation`, ask a Google Cloud admin for an exception on this project.
5. **Chat API configuration.** Go to **APIs & Services > Enabled APIs & services**, open **Google Chat API** and the **Configuration** tab. Fill in:
   - **App name**, **Avatar URL** and **Description** from the table above;
   - **Interactive features**: on;
   - **Functionality**: turn on **Join spaces and group conversations**. Direct messages with the app work without another setting;
   - **Connection settings**: **HTTP endpoint URL**, and set it to `<PUBLIC_URL>/webhooks/google-chat`;
   - **Authentication audience**: **Project number**. Google Chat then signs every request as `chat@system.gserviceaccount.com` with your project number as the audience. Standcast checks both against `GOOGLE_CHAT_PROJECT_NUMBER` and rejects anything else with 401, so only events for your own Chat app are accepted;
   - **Visibility**: make the app available to the people and groups of your Google Workspace domain who will use it. Only users in your domain can find it until the app is published on the Google Workspace Marketplace;
   - **Logs**: optionally, turn on **Log errors to Logging** to see delivery errors in Google Cloud.

   Click **Save**.
6. **Encode the key.** Standcast reads the JSON key as one base64 line:

   ```sh
   base64 < standcast-chat-key.json | tr -d '\n'
   ```

7. **Set the environment variables** (see below) on the api and the worker, and deploy. Then delete the key file from your machine.

## Environment variables

| Variable | Services | Value |
| --- | --- | --- |
| `GOOGLE_CHAT_SERVICE_ACCOUNT` | api and worker | The base64 of the service account JSON key. Empty or unset turns Google Chat off. A value that is not a base64 JSON key with `client_email` and `private_key` stops the service at startup with `must be a base64 encoded service account JSON key`. The value is never logged |
| `GOOGLE_CHAT_PROJECT_NUMBER` | api only | The **Project number** of the Google Cloud project that owns the Chat app, digits only, such as `123456789012`. Required when `GOOGLE_CHAT_SERVICE_ACCOUNT` is set: without it the api stops at startup with `is required when GOOGLE_CHAT_SERVICE_ACCOUNT is set`, and a value that is not digits stops it with `must be the numeric Google Cloud project number` |

Set the same `GOOGLE_CHAT_SERVICE_ACCOUNT` on both services. The api uses it to check spaces and answer events; the worker uses it to post digests, late dailies, reminders and direct messages.

For local development, put `GOOGLE_CHAT_SERVICE_ACCOUNT` and `GOOGLE_CHAT_PROJECT_NUMBER` in `.env` (see `.env.example`). Google cannot reach `localhost`, so events only arrive on a public `https` address.

## Check it works

1. Open the web app Settings, or the setup page. The Google Chat card no longer says "Google Chat is not available on this server.".
2. Add the app to a test space. It posts a message with a link code. If it says the app is not responding, check that the HTTP endpoint URL is `<PUBLIC_URL>/webhooks/google-chat`, that the authentication audience is **Project number**, and that `GOOGLE_CHAT_PROJECT_NUMBER` is the project number of the same Google Cloud project.
3. Paste the code in the Google Chat card, set a test team with `provider: google-chat` and the space name, and send the app a direct message to link yourself.
4. Let a digest post, and check that links, mentions and text with `<` show as expected in Google Chat.

## Publish on the Google Workspace Marketplace

Until the app is published, only your own domain can use it. The listing fields, assets, consent screen and reviewer notes are in [marketplace/listing.md](marketplace/listing.md).

## Rotate the key

Create a new JSON key for the same service account, set the new base64 value on the api and the worker, deploy both, then delete the old key in **Keys**. Linked spaces and people stay linked: they belong to the app, not to the key.

## What Standcast receives

Google sends an event only when the app is added to a space, removed from it, or sent a direct message. Standcast keeps the space name and display name, and from a direct message uses the sender's user id and email only to link the person. It keeps nothing from message text. See the [Privacy](site/privacy.md) page and the admin guide in [site/admin/google-chat.md](site/admin/google-chat.md).
