# Referência do standcast.yml

O Standcast lê toda a configuração de um arquivo só: o `standcast.yml` na **raiz** de um repositório de configuração da organização (ou da conta pessoal), na branch padrão. Não existe outro lugar para configurar os times.

## Onde fica o arquivo

O Standcast procura em dois repositórios, nesta ordem:

1. `.github-private`, quando ele existe **e** tem o `standcast.yml`. É o repositório privado que o GitHub usa para o perfil da organização visível só para membros.
2. `.github`, nos outros casos. Na maioria das organizações esse repositório é **público**, porque guarda os arquivos de comunidade e o perfil público da organização.

Mantenha o `standcast.yml` no `.github-private`, ou em um `.github` que você tornou privado. O arquivo cita as pessoas dos seus times, e qualquer um lê o que está em um repositório público. Quando os dois repositórios têm o arquivo, vale o do `.github-private` e o do `.github` é ignorado. Quando só o `.github` tem o arquivo, nada muda para você: é onde o Standcast sempre leu.

Para o arquivo não listar logins, inclua as pessoas por times do GitHub (`members: ["@org/team-slug"]` e `managers: ["@org/team-slug"]`, veja [Times do GitHub](#times-do-github)) e deixe de fora o mapa `members` do nível de cima: o [mapeamento de identidades](#mapeamento-de-identidades) padrão não precisa de item por pessoa.

Todo exemplo `yaml` desta página passa pelo parser de verdade quando a documentação é gerada.

## Exemplo mínimo

```yaml
teams:
  - name: backend
    timezone: America/Sao_Paulo
    remind_at: "09:30"
    digest_at: "10:00"
    language: pt-BR
    managers: [alice]
    members: [alice, bob]
    chat:
      provider: slack
      channel: "#daily-backend"
```

## Exemplo completo

```yaml
teams:
  - name: backend
    timezone: America/Boa_Vista
    workdays: [mon, tue, wed, thu, fri]
    remind_at: "09:30"
    digest_at: "10:00"
    language: pt-BR
    managers: [felipeoliveira]
    members: [alice, bob]
    chat:
      provider: slack
      channel: "#daily-backend"
    tracker:
      provider: linear
      team: BE
    signals:
      pr_review_hours: 48
      card_stale_days: 5
      direct_message: false
members:
  alice: { slack: U0123, linear: alice@acme.com }
```

## Nível de cima

| Chave | Tipo | Obrigatória | Padrão | Descrição |
| --- | --- | --- | --- | --- |
| `teams` | lista de times | sim | | Pelo menos um time. Os nomes dos times têm que ser únicos. |
| `members` | mapa de login do GitHub para identidades | não | `{}` | Mapeamento manual de identidades, só para exceções. Rejeitado em repositório público. Veja [Mapeamento de identidades](#mapeamento-de-identidades). |

Nenhuma outra chave é aceita. Uma chave desconhecida falha na validação com `Unrecognized key`.

## Chaves do time

| Chave | Tipo | Obrigatória | Padrão | Exemplo |
| --- | --- | --- | --- | --- |
| `name` | texto, não vazio | sim | | `backend` |
| `timezone` | fuso IANA | sim | | `America/Sao_Paulo` |
| `workdays` | lista de `mon` `tue` `wed` `thu` `fri` `sat` `sun`, pelo menos um | não | `[mon, tue, wed, thu, fri]` | `[mon, tue, wed, thu]` |
| `remind_at` | `HH:MM`, 24 horas | sim | | `"09:30"` |
| `digest_at` | `HH:MM`, 24 horas | sim | | `"10:00"` |
| `language` | `en` ou `pt-BR` | não | `en` | `pt-BR` |
| `managers` | lista de logins ou times do GitHub, pelo menos um | sim | | `[felipeoliveira, "@acme/leads"]` |
| `members` | lista de logins ou times do GitHub, pelo menos um | sim | | `[alice, "@acme/backend"]` |
| `chat.provider` | `slack` ou `google-chat` | sim | | `slack` |
| `chat.channel` | texto, não vazio | sim | | `"#daily-backend"` ou `spaces/AAAAbbbbCCC` |
| `tracker.provider` | `linear` ou `jira` | não | | `linear` |
| `tracker.team` | texto, não vazio | com `tracker` | | `BE` |
| `signals.pr_review_hours` | número maior que 0 | não | `48` | `24` |
| `signals.card_stale_days` | número maior que 0 | não | `5` | `3` |
| `signals.direct_message` | `true` ou `false` | não | `false` | `true` |

### `name`

O nome do time, como aparece no título do consolidado, na API e nas tools do MCP. Tem que ser único no arquivo. Renomear um time começa um histórico novo com o novo nome.

### `timezone`

Um nome de fuso IANA, como `America/Sao_Paulo`, `Europe/Lisbon` ou `UTC`. Abreviações como `BRT` e nomes de cidade como `Brasilia` são recusados.

### `workdays`

Os dias em que o time tem daily, com os nomes em inglês. Os consolidados só saem nesses dias. Uma daily enviada em outro dia conta para o próximo dia útil.

### `remind_at`

O horário local do lembrete, enviado por mensagem direta no Slack ou no Google Chat, em dias úteis, para quem ainda não enviou a daily. No máximo um por pessoa por dia. Ele tem que ser antes do `digest_at`, senão o arquivo é inválido. Veja [Como funciona](/pt-BR/how-it-works).

### `digest_at`

O horário local em que o consolidado é publicado. Use aspas (`"10:00"`) para manter o valor como texto. Use dois dígitos na hora: `"09:00"`, não `"9:00"`.

### `language`

O idioma do consolidado e das dailies atrasadas publicadas na thread dele: `en` ou `pt-BR`. Sem essa chave, o time usa inglês. Ela não muda o que as pessoas escreveram: as dailies nunca são traduzidas.

### `managers`

Quem gere o time. Gestores leem os consolidados, as dailies e os impedimentos do time pelas [tools de gestor do MCP](/pt-BR/members/mcp#tools-de-gestor) e pelo app web, marcam impedimentos como resolvidos ou abertos de novo e enviam o lembrete na hora. Admins da organização fazem o mesmo em todos os times sem precisar estar listados. Impedimentos sem outra pessoa para encaminhar vão para os gestores.

Cada item é:

- um login do GitHub, como `felipeoliveira`; ou
- um time do GitHub da sua organização, escrito `"@org/slug-do-time"`, como `"@acme/leads"`. Use aspas, porque o YAML não aceita um valor que começa com `@`.

Dá para misturar os dois, como em `[felipeoliveira, "@acme/leads"]`. Mantenha pelo menos um item. Qualquer outro valor que começa com `@`, como `@alice` ou `@acme/`, é rejeitado.

No GitHub, os membros de um time incluem os membros dos times filhos, então um time pai em `managers` torna gestor também quem está nos times filhos. Liste o time filho quando isso for amplo demais.

O acesso de gestor segue o time do GitHub. O Standcast guarda os membros de cada time do GitHub por até 5 minutos, então quem entra ou sai do time ganha ou perde o acesso de gestor em até 5 minutos. Isso inclui os impedimentos encaminhados aos gestores. Quando o app recebe o evento de membership do GitHub, o processo da API que o recebe descarta a cópia dele na hora, mas o worker e os outros processos da API mantêm a deles até passarem os 5 minutos, então conte com 5 minutos. Um time que o Standcast não consegue ler não dá acesso de gestor a ninguém:

- um time de outra organização, um time que não existe ou um time que o app não enxerga (confira a permissão Members) mostra um aviso na página Configuração;
- um time com 5.000 membros ou mais mostra um aviso e não é usado;
- quando o GitHub falha ou não responde em 5 segundos, o time fica de fora e um aviso aparece na página Configuração. O Standcast pergunta ao GitHub de novo depois de um minuto. Um impedimento encaminhado aos gestores nesse meio-tempo vai para os gestores listados por login; quando nenhum deles pode recebê-lo, ele é enviado de novo alguns minutos depois;
- quando o GitHub leva mais de 3 segundos, as tools de gestor, o `/v1/manage` e a lista de times que você gere no app web deixam o time de fora sem esperar. A leitura continua, e os pedidos que vêm depois usam a resposta dela.

Logins listados diretamente continuam funcionando em todos esses casos.

Se o seu repositório de configuração for público, liste os gestores como um time do GitHub em vez de logins: o arquivo mostra só o nome do time, e quem gere cada time fica no GitHub, onde a visibilidade e os membros do time são controlados pela sua organização.

### `members`

Quem escreve dailies neste time. Cada item é:

- um login do GitHub, como `alice`; ou
- um time do GitHub, escrito `"@org/slug-do-time"`, como `"@acme/backend"`. Use aspas, porque o YAML não aceita valor começando com `@`.

Os times do GitHub são lidos do GitHub, então as mudanças no GitHub valem sem editar o arquivo, nos mesmos 5 minutos de [`managers`](#managers). Um time do GitHub listado em `members` e em `managers`, ou em vários times, é lido uma vez só. O Standcast lê até 5.000 membros de cada time do GitHub. Qualquer outro valor que começa com `@`, como `@alice` ou `"@acme/back end"`, é rejeitado. Os logins são comparados sem diferenciar maiúsculas e minúsculas.

Uma pessoa pode estar em vários times. A daily dela aparece no consolidado de cada time, e a data da daily usa o fuso e os dias úteis do **primeiro** time que a lista.

### `chat`

Para onde vai o consolidado.

- `provider`: `slack` ou `google-chat`. Cada time escolhe o seu, então uma organização pode usar os dois.
- `channel` no Slack: o canal do Slack, como `"#nome"` (com aspas, porque `#` começa um comentário no YAML) ou como id do canal, por exemplo `C0123456789`. Num canal privado, convide o bot do Standcast antes. Veja [Slack](/pt-BR/admin/slack).
- `channel` no Google Chat: o nome do espaço, como `spaces/AAAAbbbbCCC`. Outro formato reprova o `standcast.yml`; se você colar o link do espaço (`https://chat.google.com/room/AAAAbbbbCCC`), o erro já diz o nome a usar. O espaço precisa ter o app do Standcast e estar vinculado à sua organização com um código, senão o consolidado falha com `space_not_linked`. Veja [Google Chat](/pt-BR/admin/google-chat).

::: code-group

```text [Slack]
chat:
  provider: slack
  channel: "#daily-backend"
```

```text [Google Chat]
chat:
  provider: google-chat
  channel: spaces/AAAAbbbbCCC
```

:::

### `tracker`

O gerenciador de projetos do time: `provider` (`linear` ou `jira`) e `team` (a chave do time).

```text
tracker:
  provider: linear
  team: BE
```

- `provider: linear`: o Standcast lê os cards do workspace do Linear que um admin conectou na página de setup. `team` é a chave do time no Linear, como `BE`, e limita a atividade e os sinais a esse time do Linear. Veja [Instalar](/pt-BR/admin/install#_5-conecte-o-linear-opcional).
- `provider: jira` é aceito pelo parser, mas o Jira ainda vem em breve. A página de setup mostra um aviso e mais nada acontece. ClickUp, Asana, GitHub Projects, Microsoft Teams e Discord ainda não são aceitos. Veja [Integrações](/pt-BR/integrations).
- Se um time usa o Linear e o Linear não está conectado, a página de setup avisa. Nada quebra: o rascunho só fica sem cards.

### `signals`

Ajustes dos impedimentos sugeridos, que aparecem só para a pessoa a quem se referem:

- `pr_review_hours`: um pull request seu, aberto e que não é rascunho, sem revisão há esse número de horas desde que ficou pronto para revisão. Padrão `48`.
- `card_stale_days`: um card seu no Linear em andamento há esse número de dias ou mais, contando de quando foi iniciado. Padrão `5`. A sugestão é `card_stale`.
- `direct_message`: com `true`, o impedimento sugerido também é enviado à pessoa por mensagem direta, uma vez por sugestão. Padrão `false`.

O CI falhando no commit head de um pull request conta depois de 24 horas, e não é configurável.

## Times do GitHub

Use um time do GitHub em vez de listar as pessoas uma a uma, em `members` e em `managers`. É o jeito recomendado: o time muda no GitHub sem editar o arquivo, e o arquivo não lista logins. O app precisa da permissão Members (read), que ele pede na instalação.

```yaml
teams:
  - name: platform
    timezone: Europe/Lisbon
    remind_at: "09:00"
    digest_at: "09:30"
    managers: [carol, "@acme/platform-leads"]
    members: ["@acme/platform", dave]
    chat:
      provider: slack
      channel: C0123456789
```

## Vários times

Cada time tem canal, fuso e horários próprios. Aqui o `mobile` usa o Google Chat. A Erin está nos dois times, então a data da daily dela segue o `backend`, o primeiro time que a lista.

```yaml
teams:
  - name: backend
    timezone: America/Sao_Paulo
    remind_at: "09:30"
    digest_at: "10:00"
    language: pt-BR
    managers: [felipeoliveira]
    members: [alice, bob, erin]
    chat:
      provider: slack
      channel: "#daily-backend"
  - name: mobile
    timezone: America/New_York
    workdays: [mon, tue, wed, thu]
    remind_at: "08:45"
    digest_at: "09:15"
    managers: [frank]
    members: [erin, grace]
    chat:
      provider: google-chat
      channel: spaces/AAAAbbbbCCC
```

## Mapeamento de identidades

Por padrão, ninguém precisa de item no arquivo. O Standcast menciona as pessoas no Slack comparando o e-mail principal verificado da conta do GitHub, capturado quando a pessoa entra com `standcast login`, com o e-mail do usuário no Slack. No Google Chat, cada pessoa se vincula mandando uma mensagem direta para o app do Standcast, comparada pelo mesmo e-mail. O usuário do Linear é vinculado pelo mesmo e-mail do GitHub.

Só quando os e-mails são diferentes, mapeie a pessoa à mão na chave `members` do nível de cima, pelo login do GitHub. Cada item põe o login da pessoa ao lado de um e-mail de trabalho ou de um id de usuário do chat, então é dado pessoal: o mapeamento só é aceito quando o `standcast.yml` está em um repositório privado. Em repositório público, o check `Standcast config` falha com "standcast.yml expõe dados pessoais", com anotação na chave `members`, e a página de configuração mostra um aviso. Mova o arquivo para o `.github-private` (ou torne o `.github` privado), ou remova os itens e deixe as pessoas se vincularem pelo padrão acima.

```yaml
teams:
  - name: backend
    timezone: America/Sao_Paulo
    remind_at: "09:30"
    digest_at: "10:00"
    managers: [alice]
    members: [alice, bob]
    chat:
      provider: slack
      channel: "#daily-backend"
members:
  bob: { slack: U0456 }
  erin: { google_chat: users/123456789 }
```

| Chave | Usada hoje | Valor |
| --- | --- | --- |
| `slack` | sim | Id de membro no Slack, como `U0456`. No Slack, abra o perfil da pessoa, clique nos três pontos e em **Copiar ID de membro**. |
| `google_chat` | sim | Usuário do Google Chat, como `users/` seguido de dígitos, por exemplo `users/123456789`. Os dígitos são o id de usuário do Google da pessoa. Veja [Google Chat](/pt-BR/admin/google-chat#como-as-pessoas-sao-vinculadas) |
| `linear` | sim | E-mail da pessoa no Linear. Opcional: sem ele, o Standcast usa o e-mail principal verificado do GitHub. Precisa ser um e-mail |
| `jira` | em breve | Conta no Jira |

Um mapeamento `slack` vale a partir do próximo consolidado, mesmo para quem nunca entrou. Quem não tem mapeamento é ligado pelo e-mail ao entrar com `standcast login` ou na página de setup. Se você conectar outro workspace do Slack, as ligações por e-mail são apagadas e refeitas no próximo login.

Nas menções do consolidado, um mapeamento `google_chat` vale mais que o vínculo feito por mensagem direta para o app. Quando o mapeamento é diferente desse vínculo, as mensagens diretas só o usam se esse usuário participa de um espaço do Google Chat vinculado à sua organização; caso contrário, falham com `no_chat_identity`. Veja [Google Chat](/pt-BR/admin/google-chat#como-as-pessoas-sao-vinculadas).

O e-mail `linear` tem prioridade sobre o e-mail do GitHub. As ligações com o Linear são feitas quando a pessoa entra, logo depois de o Linear ser conectado, e sempre que o `standcast.yml` muda, inclusive para quem está num time por um time do GitHub (`@org/time`). O Standcast guarda o id do usuário no Linear, nunca o e-mail. Se você conectar outro workspace do Linear, as ligações com o Linear são apagadas.

## Erros de validação comuns

Estas são as mensagens que a página de setup mostra, no formato `caminho: mensagem`. As mensagens são em inglês. `teams.0` é o primeiro time, `teams.1` o segundo, e assim por diante.

| Mensagem | Causa | Como resolver |
| --- | --- | --- |
| `teams.0.digest_at: must be HH:MM (24h)` | Um horário como `"9:30"`, `"10h"` ou `"25:00"` | Use dois dígitos e 24 horas: `"09:30"` |
| `teams.0.digest_at: Invalid input: expected string, received undefined` | Falta o `digest_at` (o mesmo vale para `remind_at`, `timezone` e `name`) | Adicione a chave |
| `teams.0.timezone: unknown IANA timezone` | `Brasilia`, `BRT`, `GMT-3` | Use um nome como `America/Sao_Paulo` |
| `teams.0.workdays.0: Invalid option: expected one of "mon"\|"tue"\|"wed"\|"thu"\|"fri"\|"sat"\|"sun"` | `monday`, `Mon`, `seg` | Use as três letras minúsculas em inglês |
| `teams.0.workdays: Too small: expected array to have >=1 items` | `workdays: []` | Liste pelo menos um dia, ou remova a chave |
| `teams.0.language: Invalid option: expected one of "pt-BR"\|"en"` | `pt`, `pt_BR`, `portugues` | Use `pt-BR` ou `en` |
| `teams.0.chat.provider: Invalid option: expected one of "slack"\|"google-chat"` | `teams`, `Slack`, `google_chat`, `gchat` | Use `slack` ou `google-chat` |
| `teams.0.members: Too small: expected array to have >=1 items` | `members: []` (o mesmo vale para `managers`) | Liste pelo menos uma pessoa |
| `teams.0.managers.0: managers must be GitHub logins or GitHub teams written as @org/team-slug` | `managers: ["@leads"]` | Escreva um login, como `alice`, ou um time, como `"@acme/leads"` |
| `teams.0.members.0: members must be GitHub logins or GitHub teams written as @org/team-slug` | `members: ["@alice"]`, `members: ["@acme/back end"]` | Escreva um login, como `alice`, ou um time pelo slug, como `"@acme/back-end"` |
| `teams.0: Unrecognized key: "reminder"` | Uma chave escrita errado ou desconhecida | Confira a chave nas tabelas acima |
| `members.alice.slack: must be a Slack user id like U0123ABCD` | Um nome, um e-mail, um id de canal ou `<!channel>` | Use o id de membro, que começa com `U` ou `W` |
| `members.alice.google_chat: must be a Google Chat user like users/123456789` | Um e-mail, um nome ou só um número | Use `users/` seguido dos dígitos do id de usuário |
| `members.alice: Unrecognized key: "slak"` | Uma chave de identidade escrita errado | Use `slack`, `google_chat`, `linear` ou `jira` |
| `standcast.yml expõe dados pessoais` (check run) | Overrides de identidade em `members` em um repositório público | Mova o arquivo para o `.github-private`, torne o repositório privado ou remova os overrides |
| `teams.1.name: duplicate team name "backend"` | Dois times com o mesmo nome | Renomeie um deles |
| `teams.0.signals.pr_review_hours: Too small: expected number to be >0` | `0` ou um número negativo | Use um número positivo |
| `teams: Too small: expected array to have >=1 items` | `teams: []` | Adicione um time |
| `: Invalid input: expected object, received null` | O arquivo está vazio | Adicione pelo menos um time |
| Uma mensagem de sintaxe do YAML com linha e coluna | Indentação quebrada, `[` ou aspas sem fechar | Corrija o YAML nessa linha |

Enquanto o arquivo estiver inválido, o Standcast continua usando a última versão válida até você corrigir. Veja [Estados da configuração](/pt-BR/admin/install#estados-da-configuracao).
