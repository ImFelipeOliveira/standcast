# FAQ

## O meu gestor vê o meu rascunho?

Não. O rascunho é só seu. O gestor vê apenas o que você confirmou e enviou.

## O Standcast pode enviar a daily por mim?

Não. Toda daily precisa da sua confirmação explícita. A skill e o servidor MCP perguntam antes de enviar, e a API pública não tem como enviar daily.

## Posso editar a daily depois de enviar?

Sim, envie de novo no mesmo dia. A nova versão substitui a anterior. Se o consolidado já saiu, a sua primeira daily atrasada é publicada na thread; as versões seguintes ficam guardadas e vão para os webhooks, mas não são publicadas de novo.

## Mandei a daily no sábado. Para onde ela foi?

Ela conta para o próximo dia útil do seu primeiro time, então aparece no consolidado de segunda.

## Estou em dois times. Escrevo duas dailies?

Não. Uma daily por dia por organização. Ela aparece no consolidado de todos os seus times.

## Trabalho em duas organizações que usam o Standcast.

Você escreve uma daily para cada. A CLI pede `--org` e as tools do MCP pedem `org` quando você está em mais de uma.

## Quais agentes posso usar?

Claude Code pela [skill](/pt-BR/members/claude-code). Claude Desktop, Cursor, Codex, VS Code e qualquer outro cliente MCP pelo [servidor MCP](/pt-BR/members/mcp). Sem agente, use a [CLI](/pt-BR/members/cli).

## O Standcast usa IA nos meus dados?

Não. Nenhum LLM processa os seus dados nos servidores do Standcast. O seu agente roda na sua máquina, com a sua conta. Veja [Privacidade](/pt-BR/privacy).

## O Standcast mede produtividade?

Não. Não há ranking, nota, contagem de commits por pessoa nem agregados por pessoa em lugar nenhum.

## Funciona com Google Chat, Linear ou Jira?

O Google Chat funciona hoje: cada time publica no Slack ou no Google Chat. Veja [Google Chat](/pt-BR/admin/google-chat). O Linear também funciona: os seus cards aparecem no rascunho, os impedimentos de card são encaminhados e cards parados viram sugestões. Veja [Instalar](/pt-BR/admin/install#_5-conecte-o-linear-opcional). O Jira vem em breve.

## Tem lembrete para quem não mandou a daily?

Sim. No `remind_at`, quem ainda não enviou a daily recebe uma mensagem direta no Slack ou no Google Chat, no máximo uma vez por dia. Veja [Como funciona](/pt-BR/how-it-works).

## O meu gestor vê os impedimentos que o Standcast sugere?

Não. Os impedimentos sugeridos aparecem só para você, no seu rascunho. O gestor só vê um impedimento depois que você o adiciona à sua daily.

## Quem recebe o meu impedimento?

Cada impedimento novo vai uma vez, por mensagem direta, para os revisores do pull request ligado, ou os CODEOWNERS dele, ou os gestores do time. Veja [Encaminhamento de impedimentos](/pt-BR/how-it-works#encaminhamento-de-impedimentos).

## Dá para configurar o Standcast sem o repositório `.github`?

Não. A configuração mora só no `standcast.yml` da raiz do repositório `.github`. Um repositório `.github` privado funciona.

## Posso rodar o Standcast nos meus servidores?

Sim. O Standcast tem código aberto, com licença MIT, e a [seção de self-hosting do README](https://github.com/ImFelipeOliveira/standcast#self-hosting) explica a API, o worker e o Postgres. Durante o beta, o suporte é para o serviço hospedado em `api.standcast.app`.

## Como falo com o suporte?

Mande um e-mail para <SupportEmail />.
