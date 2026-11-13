# Standcast: a daily do seu time, escrita no seu agente de IA

> Código aberto (MIT), grátis durante o beta público. GitHub, Linear, Slack e Google Chat hoje. Jira, ClickUp e outros vêm a seguir.

O Standcast é uma ferramenta de código aberto para a daily de times de software. Rode `/daily` no Claude Code, no Cursor ou no terminal. O Standcast rascunha o seu ontem a partir da sua atividade no GitHub e no Linear, você confirma e o seu time recebe um consolidado no Slack ou no Google Chat.

```sh
curl -fsSL https://standcast.app/install.sh | sh
```

- [Entrar no beta](https://standcast.app/pt-BR/beta/)
- [Instalar na sua organização](https://docs.standcast.app/pt-BR/admin/install)
- [Documentação](https://docs.standcast.app/pt-BR/)
- [GitHub](https://github.com/ImFelipeOliveira/standcast)
- [English version](https://standcast.app/index.md)

Escreva a sua daily onde você já trabalha: Claude Code, Cursor, Codex, Claude Desktop, VS Code e o terminal.

## Um dia com o Standcast

Defina dois horários no standcast.yml. O Standcast cuida do resto. Este time tem `remind_at: "09:30"` e `digest_at: "10:00"` no horário de São Paulo, de segunda a sexta.

- **08:50, rascunho. Ana roda /daily.** Ela edita o rascunho, adiciona um impedimento com link para um pull request e confirma. Quem revisa recebe uma mensagem direta.
- **09:30, remind_at. Davi recebe um lembrete.** Ele ainda não escreveu. Nunca mais de um lembrete por dia.
- **10:00, digest_at. O consolidado chega.** Um por time no #daily-backend: primeiro os impedimentos, depois as atualizações, depois quem não enviou.
- **10:40, atrasada. Davi envia atrasado.** A daily dele vai para a thread do consolidado, e ninguém perde nada.

[Veja como funciona](https://standcast.app/pt-BR/como-funciona/index.md)

## O que ele faz

Coleta, consolida e entrega. Você só escreve.

- **Um rascunho do trabalho real.** Pull requests abertos, mergeados e revisados, commits por repositório e cards do Linear que começaram ou terminaram. Na segunda, o rascunho cobre o fim de semana.
- **Impedimentos chegam a quem pode ajudar.** Um impedimento com link para um pull request vai para os reviewers, depois para o CODEOWNERS, depois para os gestores do time. Um card do Linear vai para o responsável pelo card que está bloqueando.
- **Nada sai sem você.** A tool de envio do MCP exige `confirmed: true`, que o agente só passa depois que você aprova o texto.
- **Vários times, uma daily.** Escreva uma vez e apareça no consolidado de todos os seus times, cada um no próprio fuso horário e nos próprios dias úteis.
- **Gestores leem pelo próprio agente.** Consolidados, dailies e impedimentos dos últimos 90 dias, pelas tools de leitura do MCP. Só conteúdo confirmado.
- **API e webhooks.** API keys somente leitura com escopos, uma referência OpenAPI e webhooks assinados `daily.submitted` e `blocker.opened`.

## Três jeitos de escrever

Escolha o que combina com o seu jeito de trabalhar: o plugin do Claude Code, qualquer cliente MCP ou o terminal.

- **Plugin do Claude Code.** A skill `/daily` rascunha, pergunta o plano de hoje e os impedimentos e confirma com você.
- **Qualquer cliente MCP.** Cursor, Codex, Claude Desktop e VS Code rodam o [servidor MCP](https://docs.standcast.app/pt-BR/members/mcp) local.
- **Terminal.** Um binário para macOS, Linux e Windows, conferido contra o SHA256SUMS.

## Integrações

O GitHub faz o rascunho. O chat recebe o consolidado. Um tracker acrescenta os seus cards. Cada time escolhe o próprio chat, e o Linear é opcional.

- **GitHub** (rascunho). Pull requests, reviews e commits no rascunho. Uma organização instala o Standcast como GitHub App.
- **Linear** (tracker opcional). Os seus cards aparecem no rascunho, e um impedimento de card vai para quem é dono do card que bloqueia.
- **Slack** (chat). Um consolidado por time, dailies atrasadas na thread, um lembrete e mensagens diretas.
- **Google Chat** (chat). O mesmo consolidado num espaço, pelo app do Standcast.

Em breve: Jira, ClickUp, Asana, GitHub Projects, Microsoft Teams e Discord. Ainda não conectados, então o Standcast não lê nada deles.

## Privacidade

Feito para times, não para vigiar pessoas. O Standcast sugere impedimentos a partir dos seus próprios sinais. Essas sugestões são suas. Um teste na CI garante que elas nunca saem do seu rascunho.

Sem métricas de produtividade. Sem rankings. Sem contagem de commits. Nada enviado em nome de ninguém.

[Entenda a privacidade](https://standcast.app/pt-BR/privacidade/index.md)

## Configuração como código

Um arquivo no seu repositório .github. Times, horários, canais de chat e gestores ficam no `standcast.yml`. Toda mudança passa por review, como código.

- **Validado a cada push.** Um check run `Standcast config` aponta a linha com erro.
- **Nunca quebra o time.** Um push inválido mantém a última configuração válida em vigor.
- **Times do GitHub.** Os membros podem ser logins ou `@org/team`.

[Referência do standcast.yml](https://docs.standcast.app/pt-BR/admin/configuration)

## Preços

Grátis durante o beta público. Os preços serão anunciados antes do fim do beta. O Standcast é código aberto, com licença MIT, então dá para [hospedar por conta própria](https://github.com/ImFelipeOliveira/standcast#self-hosting).

[Ver preços](https://standcast.app/pt-BR/precos/index.md)

## Perguntas frequentes

Antes de instalar. Outra dúvida? Escreva para support@standcast.app ou leia a [documentação](https://docs.standcast.app/pt-BR/).

- **O Standcast lê o nosso código?** Não. O GitHub App lê pull requests, reviews, checks, metadados de commits, o standcast.yml e o CODEOWNERS. Ele nunca lê arquivos de código.
- **O meu gestor vê os impedimentos sugeridos para mim?** Não. As sugestões aparecem só para você, no seu rascunho. Elas nunca chegam ao consolidado, à API, aos webhooks nem aos gestores.
- **O Standcast pode enviar uma daily por mim?** Não. A tool de envio do MCP exige `confirmed: true`, que o agente só passa depois que você aprova o texto.
- **Do que eu preciso?** Uma organização ou conta pessoal no GitHub, e um workspace no Slack ou o Google Chat do Google Workspace. O Linear é opcional.
- **Dá para hospedar por conta própria?** Sim. O Standcast tem licença MIT. A [seção de self-hosting do README](https://github.com/ImFelipeOliveira/standcast#self-hosting) cobre a API, o worker e o Postgres.

[Todas as perguntas](https://standcast.app/pt-BR/perguntas-frequentes/index.md)

## Beta público

Teste com o seu time. Procuramos times de 3 a 15 pessoas que usam GitHub e Slack ou Google Chat. Ajudamos você a configurar. [Pedir acesso ao beta](https://standcast.app/pt-BR/beta/)

[Termos de uso](https://standcast.app/pt-BR/termos/index.md)

Suporte: support@standcast.app
