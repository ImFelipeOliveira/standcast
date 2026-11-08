# Install

Set up Standcast for your organization in four steps. You need to be an owner of the GitHub organization (or of the personal account) to install the app.

## 1. Install the GitHub App

On the [Standcast GitHub App page](https://github.com/apps/standcast/installations/new), click **Install** and pick your organization or personal account.

Choose **All repositories**, or **Only select repositories** and include the `.github-private` repository (recommended) and the `.github` repository. Standcast reads its configuration from `.github-private` when it has `standcast.yml`, and from `.github` otherwise. If neither exists yet, you can create `.github-private` in step 4 and add it to the app afterwards.

Keep the file in a **private** repository: `.github-private`, or a `.github` you made private. In most organizations `.github` is public, and `standcast.yml` names the people of your teams. See [Where the file lives](/admin/configuration#where-the-file-lives).

The app asks for these permissions:

| Permission | Access | Why |
| --- | --- | --- |
| Metadata | read | Required by GitHub for every app |
| Contents | read | Read `standcast.yml` |
| Pull requests | read | Build the draft from pull requests and reviews |
| Checks | write | Create the `Standcast config` check run on `standcast.yml` |
| Commit statuses | read | Read the check results of pull requests, for suggested blockers |
| Members | read | Resolve GitHub teams (`@org/team`) and check membership and roles |
| Email addresses (account) | read | Match people to their Slack or Google Chat user by email |

## 2. Open the setup page

After the install, GitHub sends you to `https://app.standcast.app/setup?installation_id=<id>`. Sign in with GitHub when asked. An install that still opens `https://api.standcast.app/setup` is redirected there, and the `installation_id` is kept.

Any member of the organization who signs in can open the setup page. Only admins can connect or reconnect Slack and Linear and link Google Chat spaces, and only admins see the **API keys** and **Webhooks** sections. An admin is a GitHub organization admin, or the account owner for a personal account.

The page is a checklist. A badge at the top counts the steps, for example **2 of 3 steps done**, and turns green when every step is done. Each step has a status icon (a check when done, its number while to do, an x when it needs attention) and a badge:

- **GitHub App**: installed on your organization, with a warning when Standcast lost access to the configuration repository;
- **Slack**: **Connect Slack**, or **Reconnect Slack** once connected, for admins;
- **Linear**: **Connect Linear**, or **Reconnect Linear** once connected, for admins. It counts as a step only when a team uses Linear, and then comes before the standcast.yml file. Otherwise it shows **Optional** and comes after the standcast.yml file;
- **Google Chat**: the linked spaces and, for admins, a **Link code** field with **Link space**. It shows **Optional** until a space is linked, and **Unavailable** when the server has no Google Chat app. It comes last. The badge at the top counts Slack and Google Chat as one chat step, done when Slack is connected or a space is linked;
- **standcast.yml file**: the state of the file and the repository it comes from. When it does not exist, a button to create it from a template, and the template itself. When it exists, **Edit on GitHub**, even while the file is invalid. A valid file adds one card per team, with its channel and times, and an invalid one adds a table of its errors. When the file is in a public repository and has identity overrides under `members`, a warning asks you to move it to `.github-private` or remove the overrides.

The side column shows the latest failed deliveries and, for admins, API keys and webhooks, then the support address.

## 3. Connect Slack or Google Chat

Each team posts to Slack or Google Chat, set per team in `standcast.yml`. Connect the ones your teams use.

**Slack.** An admin clicks **Connect Slack** and approves the app in the Slack workspace. The Slack step then shows a check, the **Connected** badge and "Connected to" the workspace name, and a **Reconnect Slack** button to connect again. Other members see the connection read-only. While Slack is not connected yet, they see "Only an admin can connect or reconnect Slack." See [Slack](/admin/slack) for the permissions and for private channels.

**Google Chat.** Add the Standcast app to the Google Chat space; it posts a link code. An admin pastes the code in the **Google Chat** step, or in the Google Chat card of the [web app](/admin/web-app), and clicks **Link space**. Then each person sends the app a direct message once, to link their Google Chat user. See [Google Chat](/admin/google-chat).

## 4. Create `standcast.yml`

In the **standcast.yml file** step, click **Create standcast.yml from the template**. GitHub opens its editor on the default branch of your `.github-private` repository, or of `.github` when only that one exists, with the file already filled in. The template has one team on Slack and one on Google Chat, and uses your login as manager and member:

```text
teams:
  - name: Team Slack
    language: en
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [your-login]
    members: [your-login]
    chat:
      provider: slack
      channel: "#daily"
  - name: Team Google Chat
    language: en
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [your-login]
    members: [your-login]
    chat:
      provider: google-chat
      channel: spaces/AAAAAAAAAAA
```

Delete the team for the chat you do not use. Change the team name, time zone, times, people and channel, then commit. For Google Chat, the channel is the space name from the Google Chat card. The file must be at the **root** of the repository, on the default branch. If neither `.github-private` nor `.github` exists, the page shows **Create the .github-private repository** instead, which opens GitHub's new repository form with the name filled in and the visibility set to private.

The template lists your login. For a larger team, prefer a GitHub team (`members: ["@org/team-slug"]`), so the file lists no logins, and leave out the top-level `members` map: people are linked by the verified email of their GitHub account when they run `standcast login`, and in Google Chat by a direct message to the app. `members.<login>` overrides are only for exceptions, and they are rejected in a public repository. See [Identity mapping](/admin/configuration#identity-mapping).

Full reference: [standcast.yml](/admin/configuration).

Standcast reloads the file on every push to the default branch of `.github-private` or `.github`, and when the repositories of the installation change. Reload the setup page to see the new state. Once the file exists, the step shows **Edit on GitHub**, which opens `standcast.yml` on GitHub, even while the file is invalid.

## 5. Connect Linear (optional)

Skip this step if your teams do not use Linear. An admin clicks **Connect Linear** in the Linear step of the setup page and approves the app in the Linear workspace. The step then shows `Connected to the <workspace> workspace.` and a **Reconnect Linear** button.

- The connection is read-only (scope `read`) and the app acts as itself, not as the admin. There is one Linear workspace per installation. Tokens are encrypted and refreshed automatically.
- Only an admin can connect or reconnect Linear. While Linear is not connected, or stopped working, other members see "Only an admin can connect or reconnect Linear."
- If Linear access is revoked, the step shows the **Needs attention** badge, "Linear stopped working", `The connection to the <workspace> workspace stopped working. Reconnect Linear.` and **Reconnect Linear**. Until then, Linear features pause silently: drafts have no cards, card blockers go to the managers, and card suggestions are kept as they are.
- Reconnecting a different workspace clears the Linear links of the installation. People are linked again when they sign in and whenever `standcast.yml` changes.
- The page warns "This team uses Linear, but Linear is not connected to this installation yet." when a team has `tracker.provider: linear` and Linear is not connected. For `tracker.provider: jira` it shows "The Jira integration is not available yet."

Then set the tracker per team in `standcast.yml`. See [`tracker`](/admin/configuration#tracker) and [Identity mapping](/admin/configuration#identity-mapping). What Standcast reads is in [Privacy](/privacy#linear).

## Configuration states

The **standcast.yml file** step shows one of three states.

### Configured

The **Configured** badge. Standcast is running: people can send dailies and the digests go out.

### Not configured

The **To do** badge and "Not configured yet." Standcast found the file in neither `.github-private` nor `.github`. Deleting the file, or deleting the repository that has it, switches Standcast off for the organization: the previous configuration is dropped, so a later invalid file does not bring it back. If the other repository also has a `standcast.yml`, Standcast reads that one instead. The page shows the reason:

| Reason | Meaning | Fix |
| --- | --- | --- |
| `no_repo` | Neither the `.github-private` nor the `.github` repository exists. | Create `.github-private`, add `standcast.yml`, and make sure the app can access it. |
| `no_file` | `standcast.yml` is not at the root of `.github-private` nor of `.github`, on the default branch. | Create the file there. A file in a subfolder or on another branch is not read. |
| `no_access` | Standcast cannot access the configuration repository, and there was no configuration yet. | In the app installation settings on GitHub, add `.github-private` and `.github` to the selected repositories, or choose all repositories. |

`no_access` is a warning when a configuration is already in use. GitHub can deny access for a moment, for example under a rate limit, or because the repository was removed from the selected repositories. When `.github-private` denies access, Standcast does not fall back to `.github`, so it never switches to another file by accident. Standcast then keeps the current configuration and state, and the setup page shows "Standcast has no access to the configuration repository. Standcast keeps using the current configuration." next to any state. The warning goes away on the next successful read of `standcast.yml`, valid or invalid. Give the app access to the repository again to clear it.

### Invalid

The **Needs attention** badge and "standcast.yml is invalid. Fix the errors below and commit." The page lists the errors in a table with a **Path** and an **Error** column, for example the path `teams.0.digest_at` with the error `must be HH:MM (24h)`. Use **Edit on GitHub** to open the file and fix it. See the [common errors](/admin/configuration#common-validation-errors).

If the file was valid right before the invalid push, the page also says "Standcast keeps using the last valid version until you fix it." Digests still go out and drafts and submissions still work, with the last valid version. Fix the file and commit to apply your changes. If there is no valid version in use (the file was never valid, or it was deleted before the invalid push), Standcast does not run for the organization: no digests are posted, and drafts and submissions fail with `org_not_configured`.

When a push to any branch of the `.github-private` or `.github` repository touches `standcast.yml`, and on pull requests in those repositories that change it, Standcast creates the check run `Standcast config` in that repository, with success or failure. On failure there is one annotation per error, on its line, and the summary lists every error. A valid file in a public repository also fails when the top-level `members` map has identity overrides: the check is titled "standcast.yml exposes personal data", with one annotation on the `members` key. The same file in a private repository passes, and the configuration in use is never changed by this check. If the file does not exist, there is no check. Any push to the default branch reloads the configuration, force pushes included.

## Next steps

- Ask each member to follow [Getting started](/members/getting-started). People are matched to their Slack user when they sign in, so they should sign in after Slack is connected.
- On Google Chat, ask each member to sign in, then send the Standcast app a direct message once.
- If you use Linear, ask each member to sign in after Linear is connected, so their Linear user is linked.
- Create [API keys](/admin/api-keys) or [webhooks](/admin/webhooks) if other systems need the data.
