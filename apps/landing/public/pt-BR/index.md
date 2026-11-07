# Standcast: a sua daily, escrita no seu agente de IA

> Código aberto (MIT), grátis durante o beta público. GitHub, Linear, Slack e Google Chat hoje. Jira, ClickUp e outros vêm a seguir.

O Standcast é uma ferramenta de código aberto para a daily de times de software. Rode `/daily` no Claude Code, no Cursor ou no terminal. O Standcast rascunha o seu ontem a partir da sua atividade no GitHub e no Linear, você confirma e o seu time recebe um consolidado no Slack ou no Google Chat.

```sh
curl -fsSL https://api.standcast.app/install.sh | sh
```

- [Entrar no beta](https://standcast.app/pt-BR/beta/)
- [Instalar na sua organização](https://docs.standcast.app/pt-BR/admin/install)
- [Documentação](https://docs.standcast.app/pt-BR/)
- [GitHub](https://github.com/ImFelipeOliveira/standcast)
- [English version](https://standcast.app/index.md)

Escreva a sua daily onde você já trabalha: Claude Code, Cursor, Codex, Claude Desktop, VS Code e o terminal.

## Integrações

O GitHub é de onde sai o rascunho. Um tracker acrescenta os seus cards. Um chat é onde o consolidado do time chega. Cada time escolhe o próprio chat, e o Linear é opcional.

### Disponível agora

- **GitHub.** Pull requests, reviews e commits no rascunho. Uma organização instala o Standcast como GitHub App.
- **Linear.** Tracker opcional. Os seus cards aparecem no rascunho, e um impedimento de card vai para quem é dono do card que bloqueia.
- **Slack.** Um consolidado por time, dailies atrasadas na thread, um lembrete e mensagens diretas.
- **Google Chat.** O mesmo consolidado num espaço, pelo app do Standcast.

### Em breve

Ainda não conectados, então o Standcast não lê nada deles.

- **Jira.** Tracker. O `standcast.yml` já aceita, e a página de setup avisa que ainda não está disponível.
- **ClickUp.** Tracker, o mesmo papel do Linear.
- **Asana.** Tracker, o mesmo papel do Linear.
- **GitHub Projects.** Tracker, o mesmo papel do Linear.
- **Microsoft Teams.** Chat, o mesmo papel do Slack.
- **Discord.** Chat, o mesmo papel do Slack.

## Um dia com o Standcast

Defina dois horários no standcast.yml. O Standcast cuida do resto. Este time tem `remind_at: "09:30"` e `digest_at: "10:00"` no horário de São Paulo, de segunda a sexta.

- **08:50, rascunho.** Ana roda /daily. Ela edita o rascunho, adiciona um impedimento com link para um pull request e confirma. Quem revisa recebe uma mensagem direta.
- **09:30, remind_at.** Davi ainda não escreveu, então recebe um lembrete. Nunca mais de um por dia.
- **10:00, digest_at.** Um consolidado por time no #daily-backend: primeiro os impedimentos, depois as atualizações, depois quem não enviou.
- **10:40, atrasada.** Davi envia atrasado. A daily dele vai para a thread do consolidado, e ninguém perde nada.

[Veja como funciona](https://standcast.app/pt-BR/como-funciona/index.md)

## Privacidade

Feito para times, não para vigiar pessoas. O Standcast sugere impedimentos a partir dos seus próprios sinais. Essas sugestões são suas. Um teste na CI garante que elas nunca saem do seu rascunho.

Sem métricas de produtividade. Sem rankings. Sem contagem de commits. Nada enviado em nome de ninguém.

[Entenda a privacidade](https://standcast.app/pt-BR/privacidade/index.md)

## Três jeitos de escrever

O plugin do Claude Code, qualquer cliente MCP ou o terminal. Escolha o que combina com o seu jeito de trabalhar.

[Jeitos de escrever](https://standcast.app/pt-BR/como-funciona/index.md)

## Preços

Grátis durante o beta público. Os preços serão anunciados antes do fim do beta.

[Ver preços](https://standcast.app/pt-BR/precos/index.md)

## Perguntas frequentes

O que o GitHub App lê, do que você precisa, quem vê os impedimentos sugeridos e se dá para hospedar por conta própria.

[Ler as perguntas](https://standcast.app/pt-BR/perguntas-frequentes/index.md)

## Beta público

Teste com o seu time. Procuramos times de 3 a 15 pessoas que usam GitHub e Slack ou Google Chat. Ajudamos você a configurar. [Pedir acesso ao beta](https://standcast.app/pt-BR/beta/)

[Termos de uso](https://standcast.app/pt-BR/termos/index.md)

Suporte: support@standcast.app
