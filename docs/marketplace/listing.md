# Google Workspace Marketplace listing

Everything needed to publish the Standcast Google Chat app on the Google Workspace Marketplace as a public listing. Each field has the exact value to paste. The Chat app itself is set up as described in [Create the Google Chat app](../google-chat-app.md); this page covers what the Marketplace adds on top.

Google renames console labels from time to time. If a label below differs, use the closest one.

Before submitting:

- Felipe reviews the [terms of use](https://standcast.usefachada.dev/terms/) (`apps/landing/public/terms/`). They were drafted without legal advice.
- The landing with `/terms/`, `/privacy/` and `/brand/` is deployed, and every URL on this page answers 200.
- `usefachada.dev` is verified in Google Search Console with the account that owns the Google Cloud project.

## Assets

The PNGs are rendered with `rsvg-convert` from the SVG sources in [brand/](brand/). The landing serves them from the same origin, so the CSP (`img-src 'self'`) is unchanged.

| Asset | Size | File | Public URL |
| --- | --- | --- | --- |
| Icon | 32×32 | `apps/landing/public/brand/logo-32.png` | https://standcast.usefachada.dev/brand/logo-32.png |
| Icon | 48×48 | `apps/landing/public/brand/logo-48.png` | https://standcast.usefachada.dev/brand/logo-48.png |
| Icon | 96×96 | `apps/landing/public/brand/logo-96.png` | https://standcast.usefachada.dev/brand/logo-96.png |
| Icon | 128×128 | `apps/landing/public/brand/logo-128.png` | https://standcast.usefachada.dev/brand/logo-128.png |
| Chat app avatar | 256×256 | `apps/landing/public/brand/logo-256.png` | https://standcast.usefachada.dev/brand/logo-256.png |
| Card banner | 220×140 | `apps/landing/public/brand/banner-220x140.png` | https://standcast.usefachada.dev/brand/banner-220x140.png |
| Screenshot 1: landing hero | 1280×800 | `docs/marketplace/screenshots/1-landing-hero.png` | upload the file |
| Screenshot 2: a day with Standcast | 1280×800 | `docs/marketplace/screenshots/2-how-it-works-digest.png` | upload the file |
| Screenshot 3: the digest in Google Chat | 1280×800 | `docs/marketplace/screenshots/3-google-chat-digest.png` | upload the file |

Screenshot 3 is a mock ([mock/google-chat-digest.html](mock/google-chat-digest.html)) whose message text is the real output of `buildDigest` (`packages/core/src/digest.ts`) rendered by `renderGoogleChat` (`packages/adapters/google-chat/src/render.ts`) for a fake team (ana, bruno, carla, with diego missing). Upload the screenshots in this order.

To change the logo, edit `brand/logo-square.svg` and render again:

```sh
for n in 32 48 96 128 256; do
  rsvg-convert -w $n -h $n docs/marketplace/brand/logo-square.svg -o apps/landing/public/brand/logo-$n.png
done
rsvg-convert -w 220 -h 140 docs/marketplace/brand/banner.svg -o apps/landing/public/brand/banner-220x140.png
```

## Chat API configuration

**APIs & Services > Google Chat API > Configuration.** Only the values that change for the Marketplace are listed; the rest stays as in [Create the Google Chat app](../google-chat-app.md).

| Field | Value |
| --- | --- |
| App name | `Standcast` |
| Avatar URL | `https://standcast.usefachada.dev/brand/logo-256.png` |
| Description | `Daily standup digests from your AI agent` (40 characters, the maximum) |
| Functionality | **Join spaces and group conversations** on |
| Connection settings | **HTTP endpoint URL**: `https://api-standcast.usefachada.dev/webhooks/google-chat` |
| Authentication audience | **HTTP endpoint URL** |
| Visibility | Keep your own domain while testing. Public availability comes from the Marketplace listing, not from this field |

## OAuth consent screen

**Google Auth Platform** (formerly **APIs & Services > OAuth consent screen**).

| Field | Value |
| --- | --- |
| User type / Audience | **External** |
| Publishing status | **In production** |
| App name | `Standcast` |
| User support email | `support.standcast@usefachada.dev` |
| App logo | `apps/landing/public/brand/logo-128.png` (120×120 or larger, square) |
| Application home page | `https://standcast.usefachada.dev/` |
| Application privacy policy link | `https://standcast.usefachada.dev/privacy/` |
| Application terms of service link | `https://standcast.usefachada.dev/terms/` |
| Authorized domains | `usefachada.dev` |
| Developer contact information | `support.standcast@usefachada.dev` |
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
| Developer website URL | `https://standcast.usefachada.dev` |
| Developer email | `support.standcast@usefachada.dev` |
| Terms of service URL | `https://standcast.usefachada.dev/terms/` |
| Privacy policy URL | `https://standcast.usefachada.dev/privacy/` |
| Support URL | `https://docs-standcast.usefachada.dev/troubleshooting` |
| Admin guide URL | `https://docs-standcast.usefachada.dev/admin/google-chat` |

## Store listing

**Google Workspace Marketplace SDK > Store Listing.** Add English as the default language and Portuguese (Brazil) as a second one.

| Field | Value |
| --- | --- |
| App name | `Standcast` |
| Short description (en, 76 characters) | `Your team's daily standup digest in Google Chat, written from your AI agent.` |
| Short description (pt-BR, 79 characters) | `O consolidado da daily do seu time no Google Chat, escrito no seu agente de IA.` |
| Detailed description | See below, one per language |
| Category | **Productivity**. The Marketplace has both **Business Tools** and **Productivity**; Productivity fits a team standup tool better. If the console offers subcategories, pick the closest to task or team management |
| Pricing | **Free** |
| Application icon | `logo-128.png` and `logo-32.png` from the table above |
| Application card banner | `banner-220x140.png` |
| Screenshots | The three screenshots, in order |
| YouTube video URL | Leave empty |
| Terms of service URL | `https://standcast.usefachada.dev/terms/` |
| Privacy policy URL | `https://standcast.usefachada.dev/privacy/` |
| Support URL | `https://docs-standcast.usefachada.dev/troubleshooting` |
| Help URL | `https://docs-standcast.usefachada.dev/admin/google-chat` |
| Report issue URL | `mailto:support.standcast@usefachada.dev` |
| Distribution: regions | All regions |

### Detailed description (en)

```text
Standcast posts your team's daily standup to a Google Chat space, once a day, at the time the team chooses.

Each person writes their daily in their AI agent (Claude Code, Cursor, Codex or any MCP client) or in the terminal, starting from a draft of their GitHub and Linear activity. They confirm it, and Standcast posts one digest per team: blockers first, then support requests, then what each person did and will do, and who has not sent theirs yet. Late dailies go in the digest thread.

The Standcast app for Google Chat:
• posts the team digest in a space you link to your organization;
• sends reminders and routed blockers by direct message;
• never reads messages in spaces, and keeps nothing from the text people send it.

How to start:
1. Install the Standcast GitHub App on your GitHub organization and add a standcast.yml.
2. Add the Standcast app to a Google Chat space. It posts a link code.
3. An admin pastes the code in Standcast and sets the space in standcast.yml.
4. Each person sends the app a direct message once to link their account.

Standcast is open source (MIT) and free during the public beta. No productivity metrics, no rankings: suggested blockers stay private to each person until they confirm them.

Admin guide: https://docs-standcast.usefachada.dev/admin/google-chat
Privacy: https://standcast.usefachada.dev/privacy/
Support: support.standcast@usefachada.dev
```

### Detailed description (pt-BR)

```text
O Standcast publica a daily do seu time em um espaço do Google Chat, uma vez por dia, no horário que o time escolher.

Cada pessoa escreve a sua daily no seu agente de IA (Claude Code, Cursor, Codex ou qualquer cliente MCP) ou no terminal, a partir de um rascunho da sua atividade no GitHub e no Linear. Ela confirma, e o Standcast publica um consolidado por time: primeiro os impedimentos, depois os pedidos de apoio, depois o que cada pessoa fez e vai fazer, e quem ainda não mandou a sua. Dailies atrasadas entram na conversa do consolidado.

O app do Standcast para o Google Chat:
• publica o consolidado do time no espaço que você vincula à sua organização;
• envia lembretes e impedimentos encaminhados por mensagem direta;
• nunca lê mensagens dos espaços e não guarda nada do texto que as pessoas enviam a ele.

Como começar:
1. Instale o GitHub App do Standcast na sua organização do GitHub e adicione um standcast.yml.
2. Adicione o app do Standcast a um espaço do Google Chat. Ele publica um código de vínculo.
3. Uma pessoa admin cola o código no Standcast e define o espaço no standcast.yml.
4. Cada pessoa manda uma mensagem direta ao app uma vez para vincular a sua conta.

O Standcast é open source (MIT) e gratuito durante o beta público. Sem métricas de produtividade, sem rankings: os impedimentos sugeridos ficam visíveis só para cada pessoa até ela confirmar.

Guia para admins: https://docs-standcast.usefachada.dev/pt-BR/admin/google-chat
Privacidade: https://standcast.usefachada.dev/pt-BR/privacidade/
Suporte: support.standcast@usefachada.dev
```

## Notes for the reviewer

Paste this in the reviewer notes field of the submission:

```text
Standcast is a Google Chat app that posts a software team's daily standup digest to a Chat space and sends reminders by direct message. People write their daily in their AI agent or a command-line tool, outside Google Chat; the app only delivers. It uses app authentication only (a service account with the chat.bot scope) and requests no user data scopes. It does not read messages in spaces and keeps nothing from message text.

How to test:
1. Add Standcast to any space (space menu > Apps & integrations > Add apps). The app replies in the space, in English and Portuguese, with an 8-character link code valid for 24 hours. This confirms the app is reachable and answers events.
2. Send the app a direct message. It answers that no Standcast account uses your email, because linking requires a Standcast account created with GitHub. This confirms direct messages work.
3. Remove the app from the space. Standcast deletes the space record.

Posting a digest needs a GitHub organization with the Standcast GitHub App and a standcast.yml. We can set up a test organization and link your test space on request: support.standcast@usefachada.dev.

Admin guide: https://docs-standcast.usefachada.dev/admin/google-chat
Privacy: https://standcast.usefachada.dev/privacy/ and https://docs-standcast.usefachada.dev/privacy
Terms: https://standcast.usefachada.dev/terms/
```

## After approval

- Update the [admin guide](../site/admin/google-chat.md) and its pt-BR page: the Availability section still says the Marketplace listing is coming.
- Add the Marketplace link to the landing and the README.
