# Como funciona

> Do seu trabalho a um consolidado por time. O Standcast rascunha a sua daily a partir do GitHub e do Linear, você confirma no seu agente de IA ou no terminal, e cada time recebe um consolidado no Slack ou no Google Chat no horário que escolheu.

## Um dia com o Standcast

Defina dois horários no standcast.yml. O Standcast cuida do resto. Este time tem `remind_at: "09:30"` e `digest_at: "10:00"` no horário de São Paulo, de segunda a sexta.

- **08:50, rascunho.** Ana roda /daily. Ela edita o rascunho, adiciona um impedimento com link para um pull request e confirma. Quem revisa recebe uma mensagem direta.
- **09:30, remind_at.** Davi ainda não escreveu, então recebe um lembrete. Nunca mais de um por dia.
- **10:00, digest_at.** Um consolidado por time no #daily-backend: primeiro os impedimentos, depois as atualizações, depois quem não enviou.
- **10:40, atrasada.** Davi envia atrasado. A daily dele vai para a thread do consolidado, e ninguém perde nada.

## O que ele faz

Coleta, consolida e entrega. Você só escreve.

- **Um rascunho do trabalho real.** Pull requests abertos, mergeados e revisados, commits por repositório e cards do Linear que começaram ou terminaram. Na segunda, o rascunho cobre o fim de semana.
- **Impedimentos chegam a quem pode ajudar.** Um impedimento com link para um pull request vai para os reviewers, depois para o CODEOWNERS, depois para os gestores do time. Um card do Linear vai para o responsável pelo card que está bloqueando.
- **Nada sai sem você.** A tool de envio do MCP exige `confirmed: true`, que o agente só passa depois que você aprova o texto.
- **Vários times, uma daily.** Escreva uma vez e apareça no consolidado de todos os seus times, cada um no próprio fuso horário e nos próprios dias úteis.
- **Gestores leem pelo próprio agente.** Consolidados, dailies e impedimentos dos últimos 90 dias, pelas tools de leitura do MCP. Só conteúdo confirmado.
- **API e webhooks.** API keys somente leitura com escopos, uma referência OpenAPI e webhooks assinados `daily.submitted` e `blocker.opened`.

## Configuração como código

Um arquivo no seu repositório .github. Times, horários, canais de chat e gestores ficam no `standcast.yml`. Toda mudança passa por review, como código.

- **Validado a cada push.** Um check run `Standcast config` aponta a linha com erro.
- **Nunca quebra o time.** Um push inválido mantém a última configuração válida em vigor.
- **Times do GitHub.** Os membros podem ser logins ou `@org/team`.

```yaml
# .github/standcast.yml
teams:
  - name: Backend
    timezone: America/Sao_Paulo
    workdays: [mon, tue, wed, thu, fri]
    remind_at: "09:30"
    digest_at: "10:00"
    chat:
      provider: slack
      channel: "#daily-backend"
    tracker:
      provider: linear
      team: BE
    managers: [bruno]
    members: ["@acme/backend"]
```

[Referência do standcast.yml](https://docs-standcast.usefachada.dev/pt-BR/admin/configuration)

## Três jeitos de escrever

Escolha o que combina com o seu jeito de trabalhar.

### Plugin do Claude Code

A skill `/daily` rascunha, pergunta o plano de hoje e os impedimentos e confirma com você.

```text
/plugin marketplace add \
  ImFelipeOliveira/standcast
/plugin install standcast@standcast
/daily
```

### Qualquer cliente MCP

Cursor, Codex, Claude Desktop e VS Code rodam o [servidor MCP](https://docs-standcast.usefachada.dev/pt-BR/members/mcp) local.

```json
{
  "mcpServers": {
    "standcast": {
      "command": "standcast",
      "args": ["mcp"]
    }
  }
}
```

### Terminal

Um binário para macOS, Linux e Windows, conferido contra o SHA256SUMS.

```sh
standcast login
standcast draft
standcast submit
```

## Mais sobre o Standcast

- [Início](https://standcast.usefachada.dev/pt-BR/index.md)
- [Privacidade](https://standcast.usefachada.dev/pt-BR/privacidade/index.md)
- [Preços](https://standcast.usefachada.dev/pt-BR/precos/index.md)
- [Perguntas frequentes](https://standcast.usefachada.dev/pt-BR/perguntas-frequentes/index.md)
- [Entrar no beta](https://standcast.usefachada.dev/pt-BR/beta/index.md)
- [Termos de uso](https://standcast.usefachada.dev/pt-BR/termos/index.md)
- [English version](https://standcast.usefachada.dev/how-it-works/index.md)

Suporte: support.standcast@usefachada.dev
