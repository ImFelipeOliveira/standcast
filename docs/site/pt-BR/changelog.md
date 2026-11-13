---
outline: [2, 3]
---

# Changelog

O que mudou no Standcast. As versões são as mesmas dos [releases no GitHub](https://github.com/ImFelipeOliveira/standcast/releases). A seção da API segue a [política de versionamento](/pt-BR/api/overview#versionamento).

## Produto

### Não lançado

- Um impedimento resolvido só pode ser reaberto em **Hoje** ou **Impedimentos** enquanto ainda está na última daily de quem o escreveu. Depois que a pessoa envia uma daily sem ele, ele continua resolvido e **Reabrir** deixa de aparecer para ele; se ainda atrapalha, ela o lista de novo na próxima daily. Antes, dava para reabrir a qualquer momento. Veja [App web](/pt-BR/admin/web-app).
- No celular, fechar a **Busca** aberta com ⌘K ou Ctrl K com o menu lateral fechado devolve o foco para onde você estava, ou para o botão de menu, em vez de perdê-lo dentro do menu escondido.
- Quando o navegador recusa **Copiar como markdown** no **Histórico**, a página avisa que a cópia falhou e indica **Exportar Markdown**, que baixa o mesmo texto, em vez de não fazer nada.
- **Histórico** mantém como foi escrito o texto da daily que começa com `1.`, `2)`, `#`, `-`, `+` ou `~` na cópia em Markdown e na exportação em Markdown, em vez de virar lista, título ou bloco de código.
- **Hoje** mostra **Primeiros passos** até o time receber o primeiro consolidado: instalação, standcast.yml, conexão do chat, primeira daily e primeiro consolidado, cada um com o estado escrito e o que fazer a seguir.
- **Busca** (⌘K ou Ctrl K, ou o botão Buscar na barra lateral) leva a qualquer tela ou time e busca nas dailies dos seus times por texto, pull request ou card.
- Leitores de tela anunciam o botão do menu da conta com o nome e o papel mostrados nele, o link do e-mail de suporte em Configuração é sublinhado e as tabelas largas de Configuração rolam pelo teclado. As páginas de login, Hoje, Impedimentos, Histórico e Configuração do app web agora passam pelo axe nos temas claro e escuro e no celular a cada mudança.
- O app web tem a página **Conta**, aberta pelo menu com o seu nome: foto e login do GitHub com o seu papel em cada organização, idioma (Português, English ou seguir o navegador) e tema (claro, escuro ou seguir o sistema) para este navegador, e **Sair de todas as sessões do painel**, que encerra o app web em todos os navegadores enquanto a CLI e o plugin continuam conectados. A troca de idioma saiu do menu, que agora tem Conta, Documentação e Sair.
- **Configuração** tem a aba **standcast.yml** para admins: um formulário por time (horários, gestores e membros, chat, rastreador e sinais, incluindo os dias do alerta de impedimento parado) monta o arquivo, mostra notas sobre o que cada chat e rastreador precisa e valida na hora com as mesmas regras do Standcast. O editor não grava nada: copie o YAML ou abra o arquivo no GitHub e faça o commit.
- **Configuração** no app web tem abas: Geral, Pessoas e vínculos, e API e webhooks. **Pessoas e vínculos** (admins) mostra, para cada pessoa do standcast.yml, se o Standcast a encontra no chat e no rastreador do time, de onde vem o vínculo e se ela tem uma sessão ativa da CLI (usada pela CLI e pelo plugin), com o que fazer quando falta um vínculo. Uma entrega de webhook que falhou pode ser enviada de novo com **Reenviar**.
- O app web tem a página **Histórico** de cada time: consolidados anteriores por dia com o consolidado completo, busca nas dailies confirmadas (texto, pull request ou card) e os pull requests e cards entregues na semana, com cópia em Markdown e exportação em Markdown ou CSV. Ela nunca mostra quem não enviou nos dias anteriores.
- **Hoje** e **Histórico** abrem o consolidado no chat do time, com um botão com o nome dele (Abrir no Slack ou Abrir no Google Chat) depois que o consolidado é enviado.
- O app web tem a página **Impedimentos**: todos os impedimentos abertos dos times que você acompanha, do mais antigo para o mais novo, com a idade, os times e para quem foram encaminhados, além dos resolvidos nos últimos 14 dias. Dá para filtrar por time e resolver ou reabrir quando você pode.
- A documentação atende ao WCAG 2.2 AA nos temas claro e escuro: os links no texto são sublinhados, o foco mostra um anel de 2px, e textos e códigos chegam a contraste de 4,5:1. A barra lateral agora se divide em Primeiros passos, Membros, Admin, API e Referência, os exemplos de instalação e configuração mostram cada opção numa aba, e cada página tem a sua imagem de prévia de link, um link para editá-la no GitHub e a data da última atualização. A página de membros *Primeiros passos* agora se chama *Escreva sua primeira daily*, no mesmo endereço.
- A landing em standcast.app tem um visual novo em português e em inglês: cores novas que atendem ao WCAG 2.2 AA nos temas claro e escuro, um link para pular para o conteúdo e uma página inicial com um dia com o Standcast, o que ele faz, três jeitos de escrever, integrações, privacidade, configuração, preços e perguntas frequentes. A onda do fundo virou uma grade de pixels tranquila. Ela tem um botão **Pausar animação**, para quando sai da tela ou quando a aba fica escondida, e mostra um quadro parado quando o sistema pede menos movimento.
- O app web tem a própria página de login. Abrir o app sem sessão mostra essa página em vez de ir direto para o GitHub, e **Continuar com GitHub** devolve você à página que tinha pedido.
- Quando o login falha (você cancela no GitHub, o link expira, o GitHub não confirma a conta ou o navegador descarta o cookie da sessão), você volta à página de login com uma mensagem dizendo o que aconteceu e um botão **Tentar de novo**, em vez de uma página de erro da API.
- Os endereços do app web estão em inglês: `/orgs/<id>/today`, `/history` e `/settings`. Links antigos para `/hoje`, `/historico` e `/configuracao` continuam funcionando e mantêm a query string.
- O app web mostra o ícone do Standcast na aba do navegador.
- Alerta de impedimento parado: com `signals.blocker_alert_days` definido em um time, um impedimento que continua aberto esse número de dias depois de ser informado pela primeira vez recebe uma mensagem no canal ou espaço do time depois do consolidado, mencionando os gestores do time, com o impedimento, o link, há quanto tempo está aberto, quem o informou e para quem foi encaminhado. Cada impedimento recebe o alerta uma vez só em cada time. Sem a chave, nada muda. Veja [Alerta de impedimento parado](/pt-BR/how-it-works#alerta-de-impedimento-parado).
- O app web tem um visual novo: cores com mais contraste, que atendem ao WCAG 2.2 AA nos temas claro e escuro, cards sem borda, estados mostrados com um ponto colorido e texto, um cabeçalho que fica no topo e diminui um pouco ao rolar a página e, no celular, o menu lateral abre por um botão de menu.
- Google Chat: enquanto alguém no consolidado de um time não está vinculado ao Google Chat e aparece como `@login`, o consolidado termina com um botão **Vincular minha conta**. Um clique vincula quem clicou, pelo mesmo e-mail usado na mensagem direta para o app, e a resposta só aparece para essa pessoa. Mencionar o app num espaço vincula a pessoa do mesmo jeito. O worker precisa de `PUBLIC_URL` para o botão. Veja [Google Chat](/pt-BR/admin/google-chat#como-as-pessoas-sao-vinculadas).
- Novas imagens do kit de marca do Standcast: ícones do app, avatar e banner do card no Google Chat, banner claro e escuro no README, imagens de prévia para redes e links, e cinco screenshots para os marketplaces.

### 0.9.4 — 12/11/2026

- A skill `/daily` e o servidor MCP resumem o ontem em até 5 linhas, agrupadas por projeto ou tema, em vez de uma linha por pull request.
- Num dia útil, quando a janela do consolidado fecha sem que ele tenha sido enviado, a primeira daily enviada naquele dia depois da janela coloca o consolidado na fila, com todas as dailies enviadas até então. Ele não volta para a fila depois de usar todas as tentativas, e um consolidado na fila ainda pode falhar como qualquer outro. Antes, essa daily era guardada mas nunca publicada.
- **Criar o repositório .github-private** no app web abre o formulário do GitHub com a organização como dona, em vez da sua conta pessoal. Quando o GitHub App só tem acesso a repositórios selecionados, a página também lembra de adicionar o repositório novo ao app.

### 0.9.3 — 11/11/2026

- As mensagens em inglês do app do Google Chat e do app web apontam para Settings → Google Chat, o nome da página em inglês, em vez de Configuration.
- O app do Google Chat responde em espaços e mensagens diretas quando é configurado como complemento do Google Workspace, o modo que o Google agora usa para novos apps do Chat.
- Uma conta pessoal que instalou o GitHub App deixa de aparecer na lista de organizações do app web e da CLI para quem só colabora em um dos repositórios dela. Só a pessoa dona da conta pessoal a vê. Essas pessoas nunca tiveram acesso aos dados dela.

### 0.9.2 — 08/11/2026

### 0.9.1 — 08/11/2026

- O guia de instalação leva você para `https://app.standcast.app/setup` depois de instalar o GitHub App. `https://api.standcast.app/setup` só redireciona para lá.
- O comando de instalação é `curl -fsSL https://standcast.app/install.sh | sh`. O mesmo caminho na API redireciona para lá.
- O script de instalação mostra uma barra de progresso enquanto baixa a CLI.

### 0.9.0 — 08/11/2026

- `managers` no `standcast.yml` aceita times do GitHub escritos `"@org/slug-do-time"`, sozinhos ou junto com logins, então um repositório de configuração público não precisa listar quem gere cada time. O acesso de gestor segue o time no GitHub em até 5 minutos. Um time de gestores que não existe, é de outra organização ou é grande demais não dá acesso de gestor a ninguém e mostra um aviso na página Configuração. Quando o GitHub falha, o time não dá acesso de gestor a ninguém por um minuto e a página Configuração mostra um aviso. Um impedimento encaminhado aos gestores vai para até cinco gestores que podem recebê-lo no chat, e quando um time de gestores não pode ser lido e nenhum gestor listado pode recebê-lo, ele é enviado de novo alguns minutos depois. Quem opera o próprio GitHub App pode assinar os eventos `Membership`, `Team` e `Organization` para o processo da API que os recebe aplicar as mudanças antes. Um valor em `members` que começa com `@` agora também precisa ser um time do GitHub escrito `"@org/slug-do-time"`, como em `managers`; qualquer outro, como `@alice`, é rejeitado em vez de não corresponder a ninguém. Veja [Configuração](/pt-BR/admin/configuration#managers).

### 0.8.2 — 07/11/2026

- A landing e o README não nomeiam mais times do beta.

### 0.8.1 — 07/11/2026

- O Standcast lê o `standcast.yml` do repositório privado `.github-private` quando ele existe e tem o arquivo, e do `.github` nos outros casos, para organizações com `.github` público manterem o arquivo privado. Nada muda quando só o `.github` tem o arquivo. A página de configuração aponta para o arquivo no repositório em uso e oferece criar o `.github-private`. Veja [Onde fica o arquivo](/pt-BR/admin/configuration#onde-fica-o-arquivo).
- O check `Standcast config` falha quando o `standcast.yml` está em um repositório público e tem overrides de identidade em `members` (`linear`, `slack`, `google_chat`, `jira`), porque eles publicam e-mails de trabalho e o vínculo entre login e e-mail. A página de configuração mostra o mesmo aviso. A configuração em uso não muda. Mova o arquivo para o `.github-private`, torne o repositório privado ou remova os overrides e use a vinculação padrão pelo e-mail verificado do GitHub e pela mensagem direta do Google Chat. Veja [Mapeamento de identidades](/pt-BR/admin/configuration#mapeamento-de-identidades).
- A landing e o README nomearam a Pigz e a Usebill como os primeiros times do beta.

### 0.8.0 — 07/11/2026

- A landing e a documentação listam o que está conectado hoje (GitHub, Linear, Slack, Google Chat) e o que ainda vem (Jira, ClickUp, Asana, GitHub Projects, Microsoft Teams, Discord). Veja [Integrações](/pt-BR/integrations).
- O serviço hospedado está em [standcast.app](https://standcast.app), com o app em [app.standcast.app](https://app.standcast.app), a documentação em [docs.standcast.app](https://docs.standcast.app) e a API em [api.standcast.app](https://api.standcast.app). O suporte é support@standcast.app. O hostname antigo da API, `https://api-standcast.usefachada.dev`, continua servindo a API, sem redirecionamento, então uma integração existente mantém a URL base.
- A configuração fica no app web. O `/setup` da API redireciona para lá.

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
