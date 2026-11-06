# Privacidade

O que o Standcast lê, o que guarda, o que nunca faz e quem vê o quê. Esta página descreve o serviço como ele funciona hoje.

## Sem IA do nosso lado

Nenhum LLM processa os seus dados nos servidores do Standcast. O rascunho é montado com buscas simples no GitHub, e o consolidado é montado com o que as pessoas confirmaram. Quando você escreve a daily com um agente de IA, esse agente roda na sua máquina, com a sua conta no provedor dele. O Standcast não vê essa conversa.

## O que o Standcast lê

### GitHub

O Standcast usa as permissões do GitHub App dele: Metadata (read), Contents (read), Pull requests (read), Checks (write), Commit statuses (read), Members (read) e a permissão de conta Email addresses (read). Com elas, ele lê:

- o `standcast.yml` do repositório `.github` do dono da instalação;
- os membros dos times do GitHub citados no `standcast.yml` (`@org/time`);
- a participação e o papel na organização, para saber quem é membro e quem é admin;
- para os impedimentos sugeridos e o encaminhamento de impedimentos, em pull requests da organização: título, url, estado de rascunho, o momento em que ficou pronto para revisão, o estado das revisões (só contadas), as conclusões dos check runs no commit head, os caminhos dos arquivos alterados (só para achar os donos do código) e o arquivo `CODEOWNERS`;
- para a pessoa que pede o rascunho: títulos, links, repositórios e datas dos pull requests que ela abriu, mergeou e revisou, e dos commits de autoria dela, na organização;
- quando você entra: o seu id de usuário no GitHub, o seu login, o seu e-mail principal verificado e as instalações que você acessa.

Ele não lê o conteúdo do seu código nem outros arquivos além do `standcast.yml` e do `CODEOWNERS`. A permissão Checks (write) é usada só para criar o check run `Standcast config` no `standcast.yml`. O Standcast não escreve nos seus repositórios.

### Slack

O token do bot do app do Slack permite que o Standcast:

- busque um usuário do Slack pelo e-mail, para mencionar as pessoas no consolidado;
- liste canais, para transformar `#canal` no id do canal;
- publique o consolidado e as respostas na thread dele;
- envie mensagens diretas: lembretes, impedimentos encaminhados e, se o time ativar `signals.direct_message`, impedimentos sugeridos.

Ele não lê mensagens de nenhum canal ou conversa.

### Google Chat

O app do Standcast para o Google Chat chama a API do Google Chat como ele mesmo, com o escopo `chat.bot`. Ele permite que o Standcast:

- publique o consolidado e as respostas na thread dele, nos espaços que têm o app e estão vinculados à sua organização;
- confira se o espaço de um time existe e tem o app;
- confira se um usuário definido em `members.<login>.google_chat` participa de um dos seus espaços vinculados, antes de mandar uma mensagem direta para ele;
- encontre o espaço de mensagem direta com uma pessoa e envie mensagens diretas: lembretes, impedimentos encaminhados e, se o time ativar `signals.direct_message`, impedimentos sugeridos.

O Google só manda um evento para o Standcast quando o app é adicionado a um espaço, removido de um espaço ou recebe uma mensagem direta. Desses eventos, o Standcast usa:

- o nome do espaço (`spaces/...`) e o nome de exibição dele, para vincular o espaço à sua organização;
- de uma mensagem direta, o id de usuário no Google Chat e o e-mail de quem mandou, só para vincular a pessoa à conta dela no Standcast.

O Standcast não guarda nada do texto das mensagens que as pessoas mandam para o app. Ele não lê mensagens nos espaços e não busca pessoas pelo e-mail no Google Chat.

### Linear

Se um admin conectar o Linear, o Standcast usa um app OAuth que age como ele mesmo (`actor=app`), com o escopo só de leitura `read`, para um workspace do Linear por instalação. Ele lê:

- para quem pede o rascunho e para os sinais de cards: o identificador da issue, o título, a url, o tipo do estado, as datas de início e de conclusão, o responsável, quem criou, as relações "bloqueia" e a chave do time;
- para encaminhar um impedimento de card: o responsável e quem criou o card citado, e os responsáveis pelos cards que o bloqueiam, só para saber quem avisar;
- o e-mail dos usuários do Linear, só para ligar as pessoas ao usuário delas no Linear.

Ele nunca lê descrições nem comentários, e nunca escreve no Linear. Cards de outro workspace nunca são lidos. Os cards de uma pessoa aparecem só no rascunho dela e nunca são usados para medir pessoas.

### Suas sessões de IA, na sua máquina

Quando você escreve a daily com a skill do Claude Code, o servidor MCP ou o `standcast draft --sessions`, a CLI `standcast` na sua máquina lê os arquivos das suas sessões do Claude Code (`~/.claude/projects`, ou `STANDCAST_CLAUDE_DIR`) na janela do rascunho. Ela lê:

- o título da sessão, a pasta de trabalho, a branch e os horários de início e fim;
- até cinco dos seus prompts por sessão, cortados em 300 caracteres, sem saída de ferramentas nem texto do sistema;
- os caminhos dos arquivos editados na sessão, nunca o conteúdo deles;
- o remote `origin` da pasta de trabalho, para ligar a sessão a um repositório.

Trechos que parecem segredos (API keys, tokens do GitHub, do Slack, do Standcast e da AWS, sequências aleatórias longas) viram `[redacted]` nos títulos, nos prompts, na pasta de trabalho, na branch e nos caminhos dos arquivos. O Standcast lê esses dados na sua máquina: não os envia para a API do Standcast, para logs nem para webhooks, e não guarda nada deles. O cliente de IA com que você escreve a daily (o Claude Code ou outro cliente MCP) recebe esses dados e pode enviá-los ao provedor do modelo dele, com a sua conta e nos termos desse provedor. Só o texto da daily que você confirma é enviado ao Standcast.

Para desligar, defina `STANDCAST_SESSIONS=off` no seu ambiente, ou peça ao agente para não usar as suas sessões.

### Jira <Badge type="info" text="em breve" />

O Standcast ainda não se conecta ao Jira, então não lê nada dele.

## O que o Standcast guarda

| Dado | O que fica guardado | Proteção |
| --- | --- | --- |
| Instalação | Id da instalação no GitHub, login, tipo e id da conta, estado da configuração, o `standcast.yml` interpretado e os erros de validação | |
| Pessoa | Id de usuário no GitHub, login e e-mail principal verificado | |
| Participação em organizações | A quais instalações cada pessoa pertence | |
| Identidade no Slack | O id de usuário do Slack de cada pessoa, por instalação | |
| Conexão com o Slack | Id e nome do workspace e o token do bot | Token do bot criptografado com AES-256-GCM |
| Espaços do Google Chat | Para cada espaço que tem o app: o nome e o nome de exibição, quando o app foi adicionado e, depois do vínculo, a organização e quando foi vinculado. Enquanto há um código de vínculo pendente, um hash SHA-256 do código e quando ele expira. Um código expirado é apagado, e um espaço que nunca foi vinculado também, por uma limpeza que roda uma vez por dia, no máximo no dia seguinte ao vencimento do código | Só o hash do código de vínculo |
| Identidade no Google Chat | O id de usuário do Google Chat de cada pessoa, por instalação. O e-mail nunca é guardado | |
| Conexão com o Google Chat | Marca o Google Chat como conectado na instalação, com o nome do primeiro espaço vinculado | |
| Conexão com o Linear | Id, nome e chave da URL do workspace e os tokens de acesso e de renovação | Tokens criptografados com AES-256-GCM |
| Identidade no Linear | O id de usuário do Linear de cada pessoa, por instalação. O e-mail nunca é guardado | |
| Sessões | Um hash SHA-256 de cada token de sessão da CLI e da web, o tipo e quando foi criada e usada pela última vez | Só o hash; o token em si nunca é guardado |
| Dailies | Data, horário do primeiro e do último envio, os itens de ontem, hoje, impedimentos e pedidos de apoio com os links, e se quem confirmou foi a pessoa (`human`) ou o agente (`agent`) | |
| Estados de impedimentos | Para cada impedimento que alguém listou: o texto e o link, o primeiro e o último dia em que apareceu, e quando foi resolvido e quem resolveu. Ficam guardados até o app ser desinstalado | |
| Sugestões | Para cada impedimento sugerido: o link e o título do pull request (ou do card), o tipo, quando foi percebido e a sua decisão | Visível só para você |
| Entregas | Para cada consolidado, daily atrasada, lembrete e impedimento encaminhado: time, data, estado, tentativas, o canal e o id da mensagem no Slack ou o espaço e a thread no Google Chat, e o erro, se falhou | |
| API keys | Nome, os 8 primeiros caracteres depois de `sck_`, escopos, quem criou, datas de criação, último uso e revogação | Só um hash SHA-256 do segredo |
| Endpoints de webhook | URL, eventos, estado e número de falhas | Segredo de assinatura criptografado com AES-256-GCM |
| Entregas de webhook | O payload do evento enviado (que pode conter o texto da daily), estado, tentativas, último código de resposta ou erro | |
| Limites de taxa | Um contador por credencial ou endereço IP por minuto | Linhas apagadas depois de uns 10 minutos |

O token do GitHub do seu login é usado uma vez para identificar você e não é guardado. As chaves de criptografia ficam no ambiente do servidor, não no banco.

## Pedidos de beta

Quando alguém pede acesso ao beta na página do Standcast, o formulário coleta nome, e-mail de trabalho, tamanho do time, o chat e o tracker que o time usa e o idioma da página. Isso é separado da instalação do app e dos dados acima.

- **Para quê:** para entrar em contato com o time depois que instalar e verificar se está tudo indo bem.
- **Para onde vai:** fica guardado no Standcast e é enviado por e-mail para a caixa de suporte do Standcast através do Resend, um provedor de e-mail. Nunca é compartilhado de outra forma.
- **Por quanto tempo:** é apagado 12 meses depois do pedido.
- **Remoção antecipada:** mande um e-mail para <SupportEmail /> e o pedido é apagado antes.

## O que o Standcast nunca faz

- Enviar uma daily sem a confirmação explícita da pessoa.
- Mostrar a alguém um rascunho ou uma sugestão que a pessoa não confirmou.
- Mostrar um impedimento sugerido a outra pessoa que não ela, no consolidado, nas tools de organização ou de gestor, nos webhooks ou na página de setup.
- Calcular ranking, nota, métrica de produtividade ou agregado por pessoa.
- Ler o seu código, as suas mensagens no Slack ou no Google Chat, ou as suas mensagens diretas.
- Escrever nos seus repositórios.
- Mandar, por conta própria, os seus dados para um modelo de IA; quem recebe o rascunho é o agente que você escolhe para escrever a sua daily.
- Receber as suas sessões de IA: elas são lidas na sua máquina e nunca vão para o Standcast.
- Vender os seus dados, ou compartilhá-los com alguém além dos provedores que operam o serviço (como a Resend, para os e-mails de pedidos do beta).

## Quem vê o quê

| Quem | Vê |
| --- | --- |
| Você | O seu rascunho, os seus impedimentos sugeridos e as suas dailies, pelo seu agente |
| Membros do canal do time no Slack ou do espaço do time no Google Chat | O consolidado e as dailies atrasadas na thread dele |
| Gestores do time | Os consolidados, as dailies e os impedimentos confirmados do time nos últimos 90 dias, pelas tools de gestor do MCP |
| Admins da organização | Tudo o que os gestores veem, de todos os times; na página de setup, os controles para conectar e reconectar o Slack, os controles para vincular e desvincular espaços do Google Chat, as API keys e os webhooks |
| Membros da organização que entram na página de setup | O estado da configuração, o nome do workspace do Slack e os espaços vinculados do Google Chat, só para leitura, e as últimas entregas com falha: as mensagens do time uma a uma, e as mensagens diretas agrupadas por tipo e erro, com o login do destinatário só quando ele não tem identidade no chat. Nunca o texto de impedimentos nem sugestões. Não podem conectar nem trocar o workspace do Slack |
| Sistemas com uma API key | Times, dailies confirmadas, consolidados e impedimentos, limitados pelos escopos da key |
| Endpoints de webhook | Os eventos que assinaram |

## Retenção

Hoje o Standcast não apaga dailies de forma programada. Dailies e entregas de consolidado ficam guardadas enquanto o app estiver instalado. Alguns dados são removidos automaticamente:

- logs de entrega de webhook de saída: depois de 30 dias;
- sessões expiradas: removidas;
- sugestões resolvidas, aquelas cujo sinal deixou de existir: depois de 90 dias;
- registros de entrega sobre uma pessoa (lembretes, impedimentos encaminhados, DMs de sugestão e marcadores de varredura): depois de 90 dias;
- espaços do Google Chat que nunca foram vinculados: no dia seguinte ao vencimento do código de vínculo;
- sugestões ignoradas e confirmadas são mantidas, para não voltarem;
- contadores de limite de taxa: depois de uns 10 minutos.

As sessões da CLI param de funcionar depois de 90 dias sem uso, e as sessões da web depois de 7 dias.

## Remoção dos dados

- **Desinstale o GitHub App.** O Standcast apaga a instalação e tudo o que pertence a ela: configuração, dailies, estados de impedimentos, entregas, conexão com o Slack e identidades, espaços vinculados do Google Chat, a conexão com o Google Chat e as identidades, API keys, endpoints de webhook e as entregas deles.
- **Remova o app de um espaço do Google Chat, ou desvincule o espaço.** O Standcast apaga esse espaço. Quando a organização fica sem nenhum espaço vinculado, ele também apaga a conexão com o Google Chat; as identidades no Google Chat ficam até você desinstalar o GitHub App. Um espaço que tem o app mas nunca foi vinculado é apagado depois que o código de vínculo expira, ou quando o app é removido dele.
- **Saia.** O `standcast logout` revoga a sua sessão da CLI no servidor e apaga o arquivo local de credenciais.
- **O seu cadastro de pessoa.** O seu id de usuário no GitHub, o login e o e-mail não pertencem a uma instalação só, então desinstalar não os remove. Para apagá-los, mande um e-mail ao suporte.

## Contato

Dúvidas ou pedidos de remoção: <SupportEmail />.
