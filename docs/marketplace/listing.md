# Google Workspace Marketplace listing

Everything needed to publish the Standcast Google Chat app on the Google Workspace Marketplace as a public listing, plus the copy and images for the GitHub App on the [GitHub Marketplace](#github-marketplace). Each field has the exact value to paste. The Chat app itself is set up as described in [Create the Google Chat app](../google-chat-app.md); this page covers what the Marketplace adds on top.

Google renames console labels from time to time. If a label below differs, use the closest one.

Before submitting:

- Felipe reviews the [terms of use](https://standcast.app/terms/) (`apps/landing/public/terms/`). They were drafted without legal advice.
- The landing with `/terms/`, `/privacy/` and `/brand/` is deployed, and every URL on this page answers 200.
- `standcast.app` is verified in Google Search Console with the account that owns the Google Cloud project.

## Assets

Every image has an SVG source in [brand/](brand/) with its text outlined as paths, so it renders the same in a browser, on GitHub and in `rsvg-convert`, without fonts or network. The PNGs are rendered from those SVGs with `rsvg-convert`. The landing serves them from the same origin, so the CSP (`img-src 'self'`) is unchanged.

| Asset | Size | Source | File | Public URL |
| --- | --- | --- | --- | --- |
| Icon | 32×32 | `logo-square.svg` | `apps/landing/public/brand/logo-32.png` | https://standcast.app/brand/logo-32.png |
| Icon | 48×48 | `logo-square.svg` | `apps/landing/public/brand/logo-48.png` | https://standcast.app/brand/logo-48.png |
| Icon | 96×96 | `logo-square.svg` | `apps/landing/public/brand/logo-96.png` | https://standcast.app/brand/logo-96.png |
| Icon | 128×128 | `logo-square.svg` | `apps/landing/public/brand/logo-128.png` | https://standcast.app/brand/logo-128.png |
| Chat app avatar, safe in a circle | 256×256 | `logo-avatar.svg` | `apps/landing/public/brand/logo-256.png` | https://standcast.app/brand/logo-256.png |
| Apple touch icon | 180×180 | `apple-touch-icon.svg` | `apps/landing/public/brand/apple-touch-icon-180.png` | https://standcast.app/brand/apple-touch-icon-180.png |
| Favicon, light and dark | any | `favicon.svg` | `apps/landing/public/favicon.svg` | https://standcast.app/favicon.svg |
| Favicon | 32×32 | `favicon.svg` | `apps/landing/public/brand/favicon-32.png` | https://standcast.app/brand/favicon-32.png |
| Favicon, pixel drawn | 16×16 | `favicon-16.svg` | `apps/landing/public/brand/favicon-16.png` | https://standcast.app/brand/favicon-16.png |
| Card banner | 220×140 | `banner.svg` | `apps/landing/public/brand/banner-220x140.png` | https://standcast.app/brand/banner-220x140.png |
| GitHub Marketplace logo, white bars on transparent | 512×512 | `github-marketplace-logo.svg` | `apps/landing/public/brand/github-marketplace-logo-512.png` | upload the file |
| GitHub Marketplace feature card | 965×482 | `feature-card.svg` | `apps/landing/public/brand/feature-card-965x482.png` | upload the file |
| GitHub social preview | 1280×640 | `social-preview.svg` | `apps/landing/public/brand/social-preview-1280x640.png` | upload the file in **Settings > Social preview** |
| Landing OG image, pt-BR | 1200×630 | `og-landing.svg` | `apps/landing/public/brand/og-landing-1200x630.png` | https://standcast.app/brand/og-landing-1200x630.png |
| Landing OG image, en | 1200×630 | `og-landing-en.svg` | `apps/landing/public/brand/og-landing-en-1200x630.png` | https://standcast.app/brand/og-landing-en-1200x630.png |
| Docs OG image template | 1200×630 | `og-docs.svg` | none yet | none yet |
| README banner, light and dark | 1600×400 | `readme-light.svg`, `readme-dark.svg` | used as SVG by the README | none |
| Screenshot 1: your daily, drafted from yesterday's GitHub work | 1280×800 | `mock/1-draft-in-agent.html` | `docs/marketplace/screenshots/1-draft-in-agent.png` | upload the file |
| Screenshot 2: one digest per team, delivered to Slack | 1280×800 | `mock/2-digest-in-slack.html` | `docs/marketplace/screenshots/2-digest-in-slack.png` | upload the file |
| Screenshot 3: the same digest in Google Chat | 1280×800 | `mock/3-digest-in-google-chat.html` | `docs/marketplace/screenshots/3-digest-in-google-chat.png` | upload the file |
| Screenshot 4: blockers reach the people who can help | 1280×800 | `mock/4-blocker-routing.html` | `docs/marketplace/screenshots/4-blocker-routing.png` | upload the file |
| Screenshot 5: your team's day, blockers and history in one panel | 1280×800 | `mock/5-team-panel.html` | `docs/marketplace/screenshots/5-team-panel.png` | upload the file |

The screenshots are mocks with example teams and names, without a browser frame. Upload them in this order, to both marketplaces. The landing still uses `og.png` (source `brand/og.svg`) until the new landing ships.

### Changing an image

- **Icons and favicons** have no text. Edit the SVG in [brand/](brand/) by hand.
- **Images with text** are built from the HTML artboards in [brand/html/](brand/html/), which load Inter, JetBrains Mono and Saira from `apps/web/public/fonts`. Edit the artboard, never the generated SVG.
- **Screenshots** are the HTML mocks in [mock/](mock/).

Then render everything again. The script needs Playwright's Chromium (`bunx playwright install chromium`), `pdftocairo` and `rsvg-convert` (`brew install poppler librsvg`):

```sh
bun scripts/brand/build.ts
```

It writes each artboard as an outlined SVG in `docs/marketplace/brand/`, renders the PNGs with `rsvg-convert`, takes the screenshots with Playwright, and copies `favicon.svg` and `logo-96.png` (as `favicon.png`) to the landing. `bun test scripts/brand-assets.test.ts` checks every size. To render one icon by hand:

```sh
rsvg-convert -w 128 -h 128 docs/marketplace/brand/logo-square.svg -o apps/landing/public/brand/logo-128.png
```

## Chat API configuration

**APIs & Services > Google Chat API > Configuration.** Only the values that change for the Marketplace are listed; the rest stays as in [Create the Google Chat app](../google-chat-app.md).

| Field | Value |
| --- | --- |
| App name | `Standcast` |
| Avatar URL | `https://standcast.app/brand/logo-256.png` |
| Description | `Daily standup digests from your AI agent` (40 characters, the maximum) |
| Functionality | **Join spaces and group conversations** on |
| Build mode | **Build this Chat app as a Google Workspace add-on** on |
| Connection settings | **HTTP endpoint URL**, common for all triggers: `https://api.standcast.app/webhooks/google-chat` |
| Authentication audience | Set by Google in add-on mode. Only an app built without the add-on mode has this field: **Project number** |
| Visibility | Keep your own domain while testing. Public availability comes from the Marketplace listing, not from this field |

## OAuth consent screen

**Google Auth Platform** (formerly **APIs & Services > OAuth consent screen**).

| Field | Value |
| --- | --- |
| User type / Audience | **External** |
| Publishing status | **In production** |
| App name | `Standcast` |
| User support email | `support@standcast.app` |
| App logo | `apps/landing/public/brand/logo-128.png` (120×120 or larger, square) |
| Application home page | `https://standcast.app/` |
| Application privacy policy link | `https://standcast.app/privacy/` |
| Application terms of service link | `https://standcast.app/terms/` |
| Authorized domains | `standcast.app` |
| Developer contact information | `support@standcast.app` |
| Scopes | None |

**Why no scopes.** Standcast calls the Chat API only as the app itself, with a service account and the `https://www.googleapis.com/auth/chat.bot` scope. That scope is granted to the service account, not requested from users, so it is not added on the consent screen. The app requests no user data scopes: no Gmail, Drive, Calendar, Directory or user Chat scopes, and no sign in with Google. People sign in to Standcast with GitHub. Without sensitive or restricted scopes, the consent screen needs only brand verification (the logo, the home page and the authorized domain), not a security assessment.

## Google Workspace Marketplace SDK: App Configuration

**APIs & Services > Library > Google Workspace Marketplace SDK > Enable**, then **Manage > App Configuration**.

| Field | Value |
| --- | --- |
| App visibility | **Public**. This choice cannot be changed after the first save |
| Installation settings | **Individual + Admin install** |
| App integration | **Google Chat app**. Check **Use the Chat API configuration** (or the equivalent): the integration links to the Chat API configuration above, with no other settings here |
| OAuth scopes | Leave empty. If the form requires an entry for a Chat app, add `https://www.googleapis.com/auth/chat.bot` only, the scope the app uses through its service account. Never add user data scopes |
| Developer information: name | `Felipe Oliveira` |
| Developer website URL | `https://standcast.app` |
| Developer email | `support@standcast.app` |
| Terms of service URL | `https://standcast.app/terms/` |
| Privacy policy URL | `https://standcast.app/privacy/` |
| Support URL | `https://docs.standcast.app/troubleshooting` |
| Admin guide URL | `https://docs.standcast.app/admin/google-chat` |

## Store listing

**Google Workspace Marketplace SDK > Store Listing.** Add English as the default language and Portuguese (Brazil) as a second one. Every Google trademark in the listing text carries ™, as in Google Chat™, and the detailed descriptions end with the trademark attribution; the review rejects the listing without them.

| Field | Value |
| --- | --- |
| App name | `Standcast` |
| Short description (en, 77 characters) | `Your team's daily standup digest in Google Chat™, written from your AI agent.` |
| Short description (pt-BR, 80 characters, the maximum) | `O consolidado da daily do seu time no Google Chat™, escrito no seu agente de IA.` |
| Detailed description | See below, one per language |
| Category | **Productivity**. The Marketplace has both **Business Tools** and **Productivity**; Productivity fits a team standup tool better. If the console offers subcategories, pick the closest to task or team management |
| Pricing | **Free** |
| Application icon | `logo-128.png` and `logo-32.png` from the table above |
| Application card banner | `banner-220x140.png` |
| Screenshots | The five screenshots, in order |
| YouTube video URL | Leave empty |
| Terms of service URL | `https://standcast.app/terms/` |
| Privacy policy URL | `https://standcast.app/privacy/` |
| Support URL | `https://docs.standcast.app/troubleshooting` |
| Help URL | `https://docs.standcast.app/admin/google-chat` |
| Report issue URL | `mailto:support@standcast.app` |
| Distribution: regions | All regions |

### Detailed description (en)

```text
Standcast posts your team's daily standup to a Google Chat™ space, once a day, at the time the team chooses.

Each person writes their daily in their AI agent (Claude Code, Cursor, Codex or any MCP client) or in the terminal, starting from a draft of their GitHub and Linear activity. They confirm it, and Standcast posts one digest per team: blockers first, then support requests, then what each person did and will do, and who has not sent theirs yet. Late dailies go in the digest thread.

The Standcast app for Google Chat™:
• posts the team digest in a space you link to your organization;
• sends reminders and routed blockers by direct message;
• never reads messages in spaces, and keeps nothing from the text people send it.

How to start:
1. Install the Standcast GitHub App on your GitHub organization and add a standcast.yml.
2. Add the Standcast app to a Google Chat™ space. It posts a link code.
3. An admin pastes the code in Standcast and sets the space in standcast.yml.
4. Each person sends the app a direct message once to link their account.

Standcast is open source (MIT) and free during the public beta. No productivity metrics, no rankings: suggested blockers stay private to each person until they confirm them.

Admin guide: https://docs.standcast.app/admin/google-chat
Privacy: https://standcast.app/privacy/
Support: support@standcast.app

Google Chat™ is a trademark of Google LLC.
```

### Detailed description (pt-BR)

```text
O Standcast publica a daily do seu time em um espaço do Google Chat™, uma vez por dia, no horário que o time escolher.

Cada pessoa escreve a sua daily no seu agente de IA (Claude Code, Cursor, Codex ou qualquer cliente MCP) ou no terminal, a partir de um rascunho da sua atividade no GitHub e no Linear. Ela confirma, e o Standcast publica um consolidado por time: primeiro os impedimentos, depois os pedidos de apoio, depois o que cada pessoa fez e vai fazer, e quem ainda não mandou a sua. Dailies atrasadas entram na conversa do consolidado.

O app do Standcast para o Google Chat™:
• publica o consolidado do time no espaço que você vincula à sua organização;
• envia lembretes e impedimentos encaminhados por mensagem direta;
• nunca lê mensagens dos espaços e não guarda nada do texto que as pessoas enviam a ele.

Como começar:
1. Instale o GitHub App do Standcast na sua organização do GitHub e adicione um standcast.yml.
2. Adicione o app do Standcast a um espaço do Google Chat™. Ele publica um código de vínculo.
3. Uma pessoa admin cola o código no Standcast e define o espaço no standcast.yml.
4. Cada pessoa manda uma mensagem direta ao app uma vez para vincular a sua conta.

O Standcast é open source (MIT) e gratuito durante o beta público. Sem métricas de produtividade, sem rankings: os impedimentos sugeridos ficam visíveis só para cada pessoa até ela confirmar.

Guia para admins: https://docs.standcast.app/pt-BR/admin/google-chat
Privacidade: https://standcast.app/pt-BR/privacidade/
Suporte: support@standcast.app

Google Chat™ é uma marca da Google LLC.
```

## Notes for the reviewer

Paste this in the reviewer notes field of the submission:

```text
Standcast is a Google Chat™ app that posts a software team's daily standup digest to a Chat space and sends reminders by direct message. People write their daily in their AI agent or a command-line tool, outside Google Chat™; the app only delivers. It uses app authentication only (a service account with the chat.bot scope) and requests no user data scopes. It does not read messages in spaces and keeps nothing from message text.

How to test:
1. Add Standcast to any space (space menu > Apps & integrations > Add apps). The app replies in the space, in English and Portuguese, with an 8-character link code valid for 24 hours. This confirms the app is reachable and answers events.
2. Send the app a direct message. It answers that no Standcast account uses your email, because linking requires a Standcast account created with GitHub. This confirms direct messages work.
3. Remove the app from the space. Standcast deletes the space record.

Posting a digest needs a GitHub organization with the Standcast GitHub App and a standcast.yml. We can set up a test organization and link your test space on request: support@standcast.app.

Admin guide: https://docs.standcast.app/admin/google-chat
Privacy: https://standcast.app/privacy/ and https://docs.standcast.app/privacy
Terms: https://standcast.app/terms/
```

## GitHub Marketplace

Copy and images for listing the Standcast GitHub App on the GitHub Marketplace (**GitHub App settings > Marketplace listing**), in English. The lengths are counted against GitHub's limits.

| Field | Value |
| --- | --- |
| Logo | `github-marketplace-logo-512.png` from the table above: white bars on a transparent background |
| Badge background color | `#3B4BC8` |
| Feature card | `feature-card-965x482.png` |
| Screenshots | The five screenshots, in order, with the captions in the asset table |
| Category | **Project management**, and **Code review** if a second one is allowed |
| Pricing | **Free** |
| Support | `support@standcast.app` |
| Privacy policy | `https://standcast.app/privacy/` |
| Terms of service | `https://standcast.app/terms/` |
| Documentation | `https://docs.standcast.app/` |

### Very short description

65 characters (40 to 80).

```text
Daily standups drafted from GitHub and posted to your team's chat
```

### Introductory description

181 characters (150 to 250).

```text
Standcast drafts each person's daily standup from their GitHub and Linear activity inside Claude Code, Cursor or the terminal, and posts one digest per team to Slack or Google Chat.
```

### Detailed description (GitHub)

874 characters (up to 1,000). GitHub renders it as Markdown.

```text
### Drafted from real work
Pull requests opened, merged and reviewed, commits per repository and Linear cards that moved. Run /daily, edit, confirm.

### Blockers reach people who can help
A blocker linked to a pull request goes to its reviewers, then CODEOWNERS, then the team's managers.

### Nothing is sent without you
The MCP submit tool requires confirmed: true, which the agent only passes after you approve the text.

### Configuration as code
Teams, schedules, chat channels and managers live in standcast.yml in your .github-private (or .github) repository, validated on every push.

### Built for teams, not surveillance
No productivity metrics, no rankings, no commit counts. It reads pull requests, reviews, checks and commit metadata, and writes only its own standcast.yml check run; it never reads your code. Open source (MIT) and free during the public beta.
```

## After approval

- Update the [admin guide](../site/admin/google-chat.md) and its pt-BR page: the Availability section still says the Marketplace listing is coming.
- Add the Marketplace links to the landing and the README (the README links the GitHub App until then).
