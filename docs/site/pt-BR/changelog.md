---
outline: [2, 3]
---

# Changelog

O que mudou no Standcast. As versões são as mesmas dos [releases no GitHub](https://github.com/ImFelipeOliveira/standcast/releases). A seção da API segue a [política de versionamento](/pt-BR/api/overview#versionamento).

## Produto

### Não lançado

- A landing e o README não nomeiam mais times do beta.

### 0.8.1 — 07/11/2026

- A landing e o README nomearam a Pigz e a Usebill como os primeiros times do beta.

### 0.8.0 — 07/11/2026

- A landing e a documentação listam o que está conectado hoje (GitHub, Linear, Slack, Google Chat) e o que ainda vem (Jira, ClickUp, Asana, GitHub Projects, Microsoft Teams, Discord). Veja [Integrações](/pt-BR/integrations).
- O serviço hospedado está em [standcast.app](https://standcast.app), com o app em [app.standcast.app](https://app.standcast.app), a documentação em [docs.standcast.app](https://docs.standcast.app) e a API em [api.standcast.app](https://api.standcast.app). O suporte é support@standcast.app. O hostname antigo da API, `https://api-standcast.usefachada.dev`, continua servindo a API, sem redirecionamento, então uma integração existente mantém a URL base.
- A configuração fica no app web. O `/setup` da API redireciona para lá.
- O Standcast lê o `standcast.yml` do repositório privado `.github-private` quando ele existe e tem o arquivo, e do `.github` nos outros casos, para organizações com `.github` público manterem o arquivo privado. Nada muda quando só o `.github` tem o arquivo. A página de configuração aponta para o arquivo no repositório em uso e oferece criar o `.github-private`. Veja [Onde fica o arquivo](/pt-BR/admin/configuration#onde-fica-o-arquivo).
- O check `Standcast config` falha quando o `standcast.yml` está em um repositório público e tem overrides de identidade em `members` (`linear`, `slack`, `google_chat`, `jira`), porque eles publicam e-mails de trabalho e o vínculo entre login e e-mail. A página de configuração mostra o mesmo aviso. A configuração em uso não muda. Mova o arquivo para o `.github-private`, torne o repositório privado ou remova os overrides e use a vinculação padrão pelo e-mail verificado do GitHub e pela mensagem direta do Google Chat. Veja [Mapeamento de identidades](/pt-BR/admin/configuration#mapeamento-de-identidades).

### 0.7.0 — 06/11/2026

- A página inicial desenha um campo animado atrás do hero.

### 0.6.0 — 06/11/2026

- O banner da landing mostra o Google Chat, os agentes e o beta público.

### 0.5.0 — 06/11/2026

- Google Chat: um time com `chat.provider: google-chat` recebe o consolidado num espaço do Google Chat, as dailies atrasadas na thread dele, e os lembretes, os impedimentos encaminhados e os impedimentos sugeridos por mensagem direta, pelo app do Standcast para o Google Chat. Adicione o app a um espaço, e um admin cola o código de vínculo que ele publica no app web (Configuração → Google Chat) ou na página de setup. Cada pessoa se vincula mandando uma mensagem direta para o app uma vez, ou com `members.<login>.google_chat: users/<dígitos>` no `standcast.yml`. Uma organização pode usar o Slack num time e o Google Chat em outro. O app funciona nos domínios do Google Workspace em que está disponível; uma listagem no Google Workspace Marketplace vem em breve. Veja [Google Chat](/pt-BR/admin/google-chat).
- O modelo de `standcast.yml` da página de setup tem um time no Slack e um no Google Chat. Apague o que você não usa.
- No app web, as entregas com falha que qualquer chat pode causar não citam mais o Slack.
- Um time com `chat.provider: google-chat` precisa de um nome de espaço (`spaces/...`) em `chat.channel`. Antes, qualquer texto passava na verificação do `standcast.yml` e o consolidado falhava depois com `space_not_linked`. Quando o valor é o link do espaço, o erro diz o nome a usar.
- Quando o app do Google Chat não acha a sua conta pelo e-mail, ou acha mais de uma, ele responde também com o seu id no Google Chat (`users/<dígitos>`), pronto para um admin pôr em `members.<login>.google_chat` no `standcast.yml`.

### 0.4.1 — 02/11/2026

- Só documentação: as entradas do changelog da 0.4.0. Nenhuma mudança no produto.

### 0.4.0 — 02/11/2026

- O rascunho da daily pode usar as suas sessões locais de IA: o `standcast draft --sessions`, a tool `standcast_get_draft` do MCP (`includeSessions`, ligado por padrão) e a skill `/daily` leem as suas sessões do Claude Code na sua máquina e as agrupam com os seus pull requests, cards e commits no `work`, então o ontem vira uma linha por trabalho. O Standcast nunca envia os dados das sessões para a API dele; o seu cliente de IA recebe esses dados e pode enviá-los ao provedor do modelo dele. Para desligar, use `STANDCAST_SESSIONS=off`. Veja [Privacidade](/pt-BR/privacy#suas-sessoes-de-ia-na-sua-maquina).
- A página de setup avisa quando o canal do Slack de um time não existe ou o bot não está nele; os links do consolidado não abrem mais prévias e mostram um rótulo curto (repo#123, FEL-12); um pull request aberto e mergeado na mesma janela aparece uma vez só no rascunho.
- O app web está no ar em [app-standcast.usefachada.dev](https://app-standcast.usefachada.dev), começando pela tela de Configuração. A página de setup renderizada pelo servidor continua funcionando.
- Hoje no app web: um time no dia atual, com os impedimentos abertos e há quanto tempo estão abertos, pedidos de apoio, as dailies de hoje, o que foi entregue ontem e quem já enviou hoje. Gestores, admins e o autor podem resolver e reabrir um impedimento, e gestores e admins podem lembrar quem ainda não enviou. A tela não mostra métrica por pessoa nem histórico de quem não enviou. Veja [App web](/pt-BR/admin/web-app).
- Pedidos de apoio: uma seção opcional da daily para o que você precisa de outra pessoa sem estar travado, como um review, uma decisão ou um pareamento. A skill `/daily`, o servidor MCP e a CLI perguntam por ela depois dos impedimentos, e o consolidado a mostra logo depois dos impedimentos, com quem pediu. Ela não é encaminhada por mensagem direta.
- O consolidado e a daily atrasada marcam as seções com emoji para ficarem mais fáceis de ler no Slack: 📅 no título, 🗓️ Ontem, 🎯 Hoje, 🚧 Impedimentos, 🤝 Pedidos de apoio e ⏳ para quem não enviou. A confirmação mostrada antes de enviar a daily usa os mesmos rótulos.

### 0.3.1 — 01/11/2026

- O site de documentação publica `robots.txt` e um `sitemap.xml`, e a landing page serve as próprias fontes.

### 0.3.0 — 01/11/2026

- O Standwise agora é **Standcast**: novo nome, binário da CLI `standcast`, arquivo de configuração `standcast.yml`, variáveis de ambiente `STANDCAST_*`, headers de webhook `Standcast-*`, prefixos de token `sc_`/`sck_` e novas URLs (`api-standcast.usefachada.dev`, `docs-standcast.usefachada.dev`). As sessões e API keys existentes deixam de funcionar: entre de novo e crie keys novas.
- Landing page em [standcast.usefachada.dev](https://standcast.usefachada.dev/pt-BR/), em inglês e português, com um formulário para entrar no beta público. Depois de enviar, você vai para o guia de instalação.
- Documentação para agentes de IA: `llms.txt`, `llms-full.txt` e uma cópia em Markdown de cada página, em inglês e português. A API serve o próprio `llms.txt`, com links para o documento OpenAPI e os guias da API.
- A página de privacidade explica o que o formulário do beta guarda e por quanto tempo.
- Os arquivos CODEOWNERS são lidos em tempo linear.

### 0.2.1 — 31/10/2026

- Só ferramentas de release: as versões batem com os releases do GitHub em todo lugar. Nenhuma mudança no produto.

### 0.2.0 — 31/10/2026

Primeiro beta público.

- Reforço de robustez:
  - A página de setup mostra um aviso quando um time do GitHub no `standwise.yml` não é encontrado ou é grande demais (só os primeiros 5.000 membros são usados).
  - **Sair** na página de setup encerra a sessão web.
  - Links de pull request são comparados sem diferenciar maiúsculas de minúsculas, então um impedimento não é encaminhado duas vezes para a mesma pull request.
  - Revisões, eventos da timeline e check runs são lidos página por página no GitHub, então pull requests grandes não são mais cortadas.
  - O health check tem limite de tempo e não acumula consultas quando o banco está lento.
  - O instalador funciona em shells BusyBox.
  - Uma identidade antiga do Slack é removida automaticamente quando o Slack responde `user_not_found` ou `user_disabled`. A pessoa entra de novo para vincular outra vez.

- Site de documentação em inglês e português, com a visão geral do produto, guias para admins e membros, a referência do `standwise.yml` e os guias da API.
- Plugin do Claude Code com a skill `/daily` e o servidor MCP incluído.
- `standwise mcp`: servidor MCP local com as tools de rascunho e de envio confirmado, mais tools de leitura para gestores e admins.
- CLI `standwise`: `login`, `logout`, `whoami`, `draft`, `submit` e `suggestion`.
- Consolidado do time no Slack no `digest_at`, com as dailies atrasadas na thread.
- Página de setup: estado da configuração, conexão com o Slack, entregas com falha, API keys e webhooks.
- Lembretes por mensagem direta no `remind_at`, uma vez por pessoa por dia. O `remind_at` precisa ser anterior ao `digest_at`.
- Encaminhamento de impedimentos por mensagem direta: revisores, depois CODEOWNERS, depois gestores.
- Impedimentos sugeridos para pull requests sem revisão e CI falhando, visíveis só para a pessoa, com `signals.direct_message` para receber também por mensagem direta.
- Check run `Standwise config` nas mudanças do `standwise.yml`.
- Retenção: logs de entrega de webhook depois de 30 dias, sugestões resolvidas depois de 90 dias, sessões expiradas removidas.
- O inglês é o idioma padrão quando nenhum é definido.
- Integração com o Linear: um admin conecta um workspace do Linear por instalação na página de setup (app OAuth que age como ele mesmo, escopo só de leitura `read`, tokens criptografados e renovados automaticamente). **Requisito de deploy:** a api e o worker agora precisam de `LINEAR_CLIENT_ID` e `LINEAR_CLIENT_SECRET` e não iniciam sem elas.
- `tracker: { provider: linear, team: <CHAVE> }` por time e `members.<login>.linear` (e-mail); as pessoas também são ligadas pelo e-mail do GitHub. `tracker.provider: jira` é aceito, com um aviso no setup.
- Os seus cards do Linear (`card_started`, `card_done`) no rascunho, e impedimentos de card encaminhados aos responsáveis pelos cards que travam, depois ao responsável pelo card, a quem o criou ou aos gestores.
- Impedimento sugerido `card_stale` para cards em andamento há `signals.card_stale_days` (padrão 5), visível só para a pessoa.

## API

O changelog da API está em inglês. A mudança da URL base também está em português.

<!--@include: ../../api/CHANGELOG.md{3,}-->
