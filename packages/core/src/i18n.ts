import type { Language } from './config';

const ptBR = {
  digestTitle: '📅 Daily — {team} — {date}',
  blockers: '🚧 Impedimentos',
  support: '🤝 Pedidos de apoio',
  yesterday: '🗓️ Ontem',
  today: '🎯 Hoje',
  missing: '⏳ Não enviaram a daily:',
  lateDaily: 'Daily enviada depois do consolidado:',
  'web.setup.title': 'Configuração do Standcast',
  'web.setup.heading': 'Configuração',
  'web.setup.logout': 'Sair',
  'web.header.docs': 'Docs',
  'web.header.beta': 'Beta',
  'web.header.switch': 'Ir',
  'web.header.nav': 'Conta',
  'web.setup.organization': 'Organização',
  'web.setup.configTitle': 'Arquivo standcast.yml',
  'web.setup.configInvalid': 'O standcast.yml é inválido. Corrija os erros abaixo e faça o commit.',
  'web.setup.configKeepsLastValid':
    'O Standcast continua usando a última versão válida até você corrigir.',
  'web.setup.configMissing': 'Ainda não configurado.',
  'web.setup.reason': 'Motivo',
  'web.setup.reason.no_repo': 'O repositório .github não existe.',
  'web.setup.reason.no_file': 'O arquivo standcast.yml não existe na raiz do repositório .github.',
  'web.setup.reason.no_access': 'O Standcast não tem acesso ao repositório .github.',
  'web.setup.accessWarning': 'O Standcast continua usando a configuração atual.',
  'web.setup.instruction':
    'Crie o arquivo standcast.yml na raiz do repositório .github da organização, na branch padrão.',
  'web.setup.templateHint':
    'O modelo tem um time no Slack e um time no Google Chat. Mantenha o que você usa, ajuste o canal dele e apague o outro antes do commit.',
  'web.setup.createFile': 'Criar standcast.yml com o modelo',
  'web.setup.createRepo': 'Criar o repositório .github',
  'web.setup.template': 'Modelo do standcast.yml',
  'web.setup.failedTitle': 'Últimas entregas com falha',
  'web.setup.noFailed': 'Nenhuma entrega com falha.',
  'web.setup.teamFailures': 'Mensagens do time',
  'web.setup.personFailures': 'Mensagens diretas',
  'web.setup.count': 'Ocorrências',
  'web.setup.kind.digest': 'Consolidado',
  'web.setup.kind.late_daily': 'Daily atrasada',
  'web.setup.kind.reminder': 'Lembrete',
  'web.setup.kind.blocker_route': 'Encaminhamento de impedimento',
  'web.setup.team': 'Time',
  'web.setup.error': 'Erro',
  'web.setup.support': 'Suporte',
  'web.setup.subtitle':
    'Conecte o Standcast às ferramentas do time e confira se tudo está funcionando.',
  'web.setup.progress': '{done} de {total} etapas concluídas',
  'web.step.done': 'Concluída',
  'web.step.todo': 'Pendente',
  'web.step.error': 'Erro',
  'web.badge.installed': 'Instalado',
  'web.badge.connected': 'Conectado',
  'web.badge.configured': 'Configurado',
  'web.badge.optional': 'Opcional',
  'web.badge.unavailable': 'Indisponível',
  'web.badge.needsAttention': 'Requer atenção',
  'web.github.title': 'GitHub App',
  'web.github.installed': 'Instalado em {owner}',
  'web.slack.connectedTo': 'Conectado a {workspace}',
  'web.slack.description': 'Lembretes e consolidados são publicados no Slack.',
  'web.linear.description': 'Vincula issues do Linear às dailies e aos impedimentos.',
  'web.linear.stopped': 'O Linear parou de funcionar',
  'web.config.description': 'Times, horários e canais vêm do standcast.yml no repositório .github.',
  'web.config.editOnGithub': 'Editar no GitHub',
  'web.config.teamTimes': 'lembrete {remindAt} · consolidado {digestAt}',
  'web.config.teams': 'Times',
  'web.config.path': 'Caminho',
  'web.apiKeys.new': 'Nova chave',
  'web.webhooks.new': 'Novo endpoint',
  'web.slack.title': 'Slack',
  'web.slack.connect': 'Conectar Slack',
  'web.slack.reconnect': 'Reconectar Slack',
  'web.slack.adminOnly': 'Só um admin pode conectar ou reconectar o Slack.',
  'web.googleChat.title': 'Google Chat',
  'web.googleChat.description':
    'Lembretes e consolidados são publicados em espaços do Google Chat.',
  'web.googleChat.unavailable': 'O Google Chat não está disponível neste servidor.',
  'web.googleChat.instructions':
    'Adicione o app do Standcast a um espaço do Google Chat; ele publica um código. Cole o código aqui.',
  'web.googleChat.spaces': 'Espaços vinculados',
  'web.googleChat.none': 'Nenhum espaço vinculado ainda.',
  'web.googleChat.code': 'Código de vínculo',
  'web.googleChat.link': 'Vincular espaço',
  'web.googleChat.adminOnly': 'Só um admin pode vincular um espaço do Google Chat.',
  'web.template.teamName': 'Time',
  'web.apiKeys.title': 'API keys',
  'web.apiKeys.description':
    'Chaves para integrar outros sistemas ao Standcast com acesso somente leitura aos dados da organização. Só administradores veem esta seção.',
  'web.apiKeys.name': 'Nome',
  'web.apiKeys.scopes': 'Escopos',
  'web.apiKeys.create': 'Criar chave',
  'web.apiKeys.created': 'Chave criada: {name}',
  'web.apiKeys.copyNow':
    'Copie agora. Esta chave não será exibida novamente e o Standcast guarda apenas um hash dela.',
  'web.apiKeys.revokeHint':
    'Revogue esta chave na lista abaixo se não conseguir copiá-la e crie outra.',
  'web.apiKeys.createdAt': 'Criada em',
  'web.apiKeys.lastUsed': 'Último uso',
  'web.apiKeys.never': 'Nunca',
  'web.apiKeys.revoke': 'Revogar',
  'web.apiKeys.revoked': 'Revogada',
  'web.apiKeys.none': 'Nenhuma chave criada.',
  'web.apiKeys.scope.teams_read': 'Ler times',
  'web.apiKeys.scope.dailies_read': 'Ler dailies',
  'web.apiKeys.scope.digests_read': 'Ler consolidados',
  'web.apiKeys.scope.blockers_read': 'Ler impedimentos',
  'web.webhooks.title': 'Webhooks',
  'web.webhooks.description':
    'Endereços HTTPS que recebem os eventos do Standcast, assinados com o segredo de cada endpoint. Só admins veem esta seção.',
  'web.webhooks.url': 'URL',
  'web.webhooks.events': 'Eventos',
  'web.webhooks.create': 'Adicionar endpoint',
  'web.webhooks.created': 'Endpoint criado: {url}',
  'web.webhooks.copyNow':
    'Copie agora o segredo de assinatura. Ele não será mostrado de novo e fica guardado criptografado.',
  'web.webhooks.disableHint':
    'Se não conseguiu copiar, desative este endpoint na lista abaixo e crie outro.',
  'web.webhooks.none': 'Nenhum endpoint criado.',
  'web.webhooks.active': 'Ativo',
  'web.webhooks.disabled': 'Desativado',
  'web.webhooks.disabledFailures': 'Desativado após {count} entregas seguidas com falha',
  'web.webhooks.disable': 'Desativar',
  'web.webhooks.sendTest': 'Enviar evento de teste',
  'web.webhooks.deliveriesTitle': 'Últimas 20 entregas',
  'web.webhooks.noDeliveries': 'Nenhuma entrega.',
  'web.webhooks.attempts': 'Tentativas',
  'web.webhooks.response': 'Resposta',
  'web.webhooks.createdAt': 'Criada em',
  'web.webhooks.lastDelivery': 'Última entrega',
  'web.webhooks.delivery.pending': 'Pendente',
  'web.webhooks.delivery.delivered': 'Entregue',
  'web.webhooks.delivery.failed': 'Falhou',
  'web.webhooks.event.daily_submitted': 'Daily enviada',
  'web.webhooks.event.blocker_opened': 'Impedimento novo',
  'web.webhooks.event.digest_sent': 'Consolidado publicado',
  'web.error.signIn': 'Entrar com o GitHub',
  'web.error.questions': 'Dúvidas?',
  'web.error.refresh': 'Atualizar a página',
  'web.error.generic.title': 'Algo deu errado',
  'web.error.generic.body': 'Não foi possível concluir esta ação. Tente novamente em instantes.',
  'web.error.unauthorized.title': 'Login necessário',
  'web.error.unauthorized.body': 'Entre com o GitHub para continuar.',
  'web.error.forbidden.title': 'Acesso negado',
  'web.error.forbidden.body': 'Você não tem acesso a esta instalação do Standcast.',
  'web.error.invalid_state.title': 'Link expirado ou inválido',
  'web.error.invalid_state.body': 'O link de autorização expirou ou é inválido. Entre novamente.',
  'web.error.access_denied.title': 'Autorização negada',
  'web.error.access_denied.body': 'O acesso foi negado. Nada foi alterado.',
  'web.error.installation_pending.title': 'Instalação em processamento',
  'web.error.installation_pending.body':
    'Esta instalação ainda está sendo processada. Atualize a página em alguns segundos.',
  'web.error.not_found.title': 'Não encontrado',
  'web.error.not_found.body': 'O item solicitado não existe ou já foi removido.',
  'web.error.rate_limited.title': 'Muitas requisições',
  'web.error.rate_limited.body': 'Você fez muitas requisições. Espere um minuto e tente de novo.',
  'web.error.invalid_code.title': 'Código inválido',
  'web.error.invalid_code.body':
    'O código não existe, já foi usado ou expirou. Remova o app Standcast do espaço e adicione de novo para receber um código novo.',
  'web.error.space_already_linked.title': 'Espaço já vinculado',
  'web.error.space_already_linked.body':
    'Este espaço do Google Chat está vinculado a outra organização. Um admin de lá precisa desvincular antes.',
  'web.error.too_many_spaces.title': 'Espaços demais',
  'web.error.too_many_spaces.body':
    'Esta organização já tem 20 espaços do Google Chat vinculados, o máximo. Desvincule um antes de vincular outro.',
  'web.error.slack_oauth_failed.title': 'Falha ao conectar o Slack',
  'web.error.slack_oauth_failed.body':
    'Não foi possível concluir a conexão com o Slack. Tente conectar novamente.',
  'web.error.linear_oauth_failed.title': 'Falha ao conectar o Linear',
  'web.error.linear_oauth_failed.body':
    'Não foi possível concluir a conexão com o Linear. Tente conectar novamente.',
  'cli.usage':
    'Uso: standcast <comando> [opções]\n\nComandos:\n  login     Entra com o GitHub\n  logout    Remove as credenciais locais\n  whoami    Mostra o usuário e as organizações\n  draft     Gera o rascunho da daily (JSON)\n  submit    Envia a daily (JSON em --file ou stdin)\n  suggestion confirm|ignore <id>\n            Confirma ou ignora uma sugestão de impedimento do rascunho\n  mcp       Inicia o servidor MCP (stdio) para agentes de IA\n\nOpções:\n  --org <login>      Organização\n  --file <caminho>   Arquivo JSON da daily\n  --api-url <url>    URL da API (STANDCAST_API_URL)\n  --sessions         Inclui as sessões locais de IA no rascunho (draft)\n  --help             Mostra esta ajuda\n  --version          Mostra a versão',
  'cli.invalidArgs': 'Argumentos inválidos: {message}',
  'cli.suggestionUsage':
    'Uso: standcast suggestion confirm <id> [--org <login>]\n     standcast suggestion ignore <id> [--org <login>]',
  'cli.unknownCommand': 'Comando desconhecido: {command}',
  'cli.notLoggedIn': 'Você não está autenticado. Execute: standcast login',
  'cli.loggedIn': 'Autenticado como {login}.',
  'cli.loggedOut': 'Credenciais removidas.',
  'cli.deviceCode': 'Abra {uri} e informe o código: {code}',
  'cli.waitingAuth': 'Aguardando a autorização no GitHub...',
  'cli.deviceExpired': 'O código expirou. Execute standcast login novamente.',
  'cli.deviceDenied': 'A autorização foi negada no GitHub.',
  'cli.deviceFailed': 'Falha no login com o GitHub: {reason}',
  'cli.networkError': 'Não foi possível conectar a {url}.',
  'cli.retryAfter': 'tente novamente em {seconds}s',
  'cli.ambiguousOrg': 'Mais de uma organização. Use --org com uma de: {orgs}',
  'cli.noOrgs': 'Nenhuma organização com o Standcast instalado para este usuário.',
  'cli.invalidJson': 'O JSON da daily é inválido.',
  'cli.validationFailed': 'A daily é inválida:',
  'cli.fileReadFailed': 'Não foi possível ler o arquivo {path}.',
  'cli.insecureUrl': 'URL insegura: {url}. Use https (http só para localhost).',
  'cli.originMismatch':
    'As credenciais guardadas pertencem a outra API. Execute: standcast login --api-url {url}',
  'cli.githubUrlIgnored':
    'STANDCAST_GITHUB_URL ignorada: só localhost é aceito. Usando https://github.com.',
  'cli.confirm.question': 'Enviar esta daily para {org}? Data: {date}.',
  'cli.confirm.yesterday': '🗓️ Ontem:',
  'cli.confirm.today': '🎯 Hoje:',
  'cli.confirm.blockers': '🚧 Impedimentos:',
  'cli.confirm.support': '🤝 Pedidos de apoio:',
  'cli.confirm.none': '(nenhum)',
  'cli.confirm.title': 'Enviar esta daily',
  'cli.confirm.description': 'Marque para enviar a daily exatamente como mostrada.',
  'reminder.title': 'Lembrete da daily',
  'reminder.body': 'O consolidado do time sai às {digestAt}. Envie a sua com /daily quando puder.',
  'blockerRouted.title': 'Impedimento de {name}',
  'blockerRouted.body':
    '{name} confirmou um impedimento na daily: {blocker}. Você pode ajudar a destravar?',
  'blockerRouted.reason.pr_reviewers': 'Você recebeu porque você é revisor solicitado no PR.',
  'blockerRouted.reason.codeowners': 'Você recebeu porque você é dono de código alterado no PR.',
  'blockerRouted.reason.card_blocker':
    'Você recebeu porque você é responsável pelo card que bloqueia.',
  'blockerRouted.reason.card_owner':
    'Você recebeu porque você é responsável pelo card bloqueado ou o criou.',
  'blockerRouted.reason.manager': 'Você recebeu porque você é gestor do time.',
  'blockerAlert.title': '🚧 Impedimento aberto há {age} · {team}',
  'blockerAlert.body':
    '{managers}, este impedimento segue aberto há {age}. Alguém pode ajudar a destravar?',
  'blockerAlert.opened': 'Aberto desde {date}, informado por {author}.',
  'blockerAlert.routed': 'Encaminhado para {logins}.',
  'blockerAlert.age.one': '1 dia',
  'blockerAlert.age.other': '{days} dias',
  'suggestion.pr_no_review':
    'O PR {title} está há mais de {hours}h sem review. Quer mencioná-lo como impedimento?',
  'suggestion.ci_failing':
    'Os checks do PR {title} estão falhando há mais de {hours}h. Quer mencioná-lo como impedimento?',
  'suggestion.card_stale':
    'O card {title} está parado há mais de {days} dias. Quer mencioná-lo como impedimento?',
  'setup.linear.title': 'Linear',
  'setup.linear.connect': 'Conectar o Linear',
  'setup.linear.connected': 'Conectado ao workspace {workspace}.',
  'setup.linear.reconnect': 'Reconectar o Linear',
  'setup.linear.invalid':
    'A conexão com o workspace {workspace} parou de funcionar. Reconecte o Linear.',
  'setup.linear.adminOnly': 'Só um admin pode conectar ou reconectar o Linear.',
  'setup.teams.missing':
    'Time {team}: o time {reference} do GitHub não foi encontrado, ou o Standcast não consegue vê-lo. Confira o nome e se o app tem a permissão Members na organização.',
  'setup.teams.truncated':
    'Time {team}: o time {reference} do GitHub é grande demais; só os primeiros 5.000 membros são usados.',
  'setup.teams.channelNotFound':
    'Time {team}: o canal {reference} do Slack não foi encontrado. Crie o canal ou, se ele for privado, convide o bot do Standcast com /invite @Standcast.',
  'setup.teams.channelNotMember':
    'Time {team}: o bot do Standcast não está no canal {reference} do Slack. Convide-o com /invite @Standcast no canal.',
  'setup.teams.spaceNotLinked':
    'Time {team}: este espaço do Google Chat ({reference}) ainda não está vinculado a esta organização. Adicione o app do Standcast ao espaço e cole o código que ele publicar em Configuração → Google Chat.',
  'setup.teams.spaceNotFound':
    'Time {team}: o espaço {reference} do Google Chat não foi encontrado. Confira o nome do espaço e adicione o app do Standcast a ele.',
  'setup.teams.spaceNotMember':
    'Time {team}: o app do Standcast não está no espaço {reference} do Google Chat. Adicione o app do Standcast ao espaço.',
  'setup.tracker.jiraComingSoon': 'A integração com o Jira ainda não está disponível.',
  'setup.tracker.notConnected':
    'Este time usa o Linear, mas o Linear ainda não está conectado a esta instalação.',
  'suggestion.dm.title': 'Sugestões só para você',
  'checkRun.success.title': 'standcast.yml válido',
  'checkRun.failure.title': 'standcast.yml inválido',
  'checkRun.summary': '{count} erro(s) encontrado(s):\n{errors}',
  'checkRun.publicIdentity.title': 'standcast.yml expõe dados pessoais',
  'checkRun.publicIdentity.message':
    'O repositório {repo} é público e o mapa members tem overrides de identidade (linear, slack, google_chat, jira). Eles publicam o e-mail de trabalho e o vínculo entre login e e-mail de cada pessoa. Mova o standcast.yml para o repositório {preferred} (ou torne o {repo} privado), ou remova os overrides e use a vinculação padrão: o e-mail verificado do GitHub no standcast login e a mensagem direta do Google Chat.',
  'googleChat.linkCode':
    'O Standcast está neste espaço. Para receber os consolidados aqui, um admin da sua organização no GitHub cola este código no Standcast, em Configuração → Google Chat: {code}. O código vale por 24 horas.',
  'googleChat.spaceLinked':
    'Este espaço agora recebe os consolidados da organização {org} no Standcast. Se não era isso, remova o app do espaço para desfazer.',
  'googleChat.linked': 'Vínculo feito, {logins}.',
  'googleChat.notFound':
    'Nenhuma conta do Standcast usa este e-mail. Rode `standcast login` primeiro e depois me mande uma mensagem de novo.',
  'googleChat.notConnected':
    'Achei a sua conta, mas nenhuma organização sua conectou o Google Chat ao Standcast ainda. Peça a um admin para vincular um espaço e me mande uma mensagem de novo.',
  'googleChat.ambiguous':
    'Este e-mail pertence a mais de uma conta do GitHub no Standcast, então não vinculei nenhuma. Peça a um admin para definir `google_chat` para você em `members` no standcast.yml, ou deixe o e-mail certo só na sua conta do GitHub e rode `standcast login` de novo.',
  'googleChat.mapHint':
    'O seu id no Google Chat é {userId}. Se o e-mail principal da sua conta do GitHub não é este, um admin pode vincular você à mão: em `members` no standcast.yml, defina `google_chat: {userId}` para o seu login do GitHub.',
} as const;

const en = {
  digestTitle: '📅 Daily — {team} — {date}',
  blockers: '🚧 Blockers',
  support: '🤝 Support requests',
  yesterday: '🗓️ Yesterday',
  today: '🎯 Today',
  missing: '⏳ Did not send the daily:',
  lateDaily: 'Daily sent after the digest:',
  'web.setup.title': 'Standcast setup',
  'web.setup.heading': 'Setup',
  'web.setup.logout': 'Sign out',
  'web.header.docs': 'Docs',
  'web.header.beta': 'Beta',
  'web.header.switch': 'Go',
  'web.header.nav': 'Account',
  'web.setup.organization': 'Organization',
  'web.setup.configTitle': 'standcast.yml file',
  'web.setup.configInvalid': 'standcast.yml is invalid. Fix the errors below and commit.',
  'web.setup.configKeepsLastValid':
    'Standcast keeps using the last valid version until you fix it.',
  'web.setup.configMissing': 'Not configured yet.',
  'web.setup.reason': 'Reason',
  'web.setup.reason.no_repo': 'The .github repository does not exist.',
  'web.setup.reason.no_file': 'standcast.yml does not exist at the root of the .github repository.',
  'web.setup.reason.no_access': 'Standcast has no access to the .github repository.',
  'web.setup.accessWarning': 'Standcast keeps using the current configuration.',
  'web.setup.instruction':
    "Create standcast.yml at the root of the organization's .github repository, on the default branch.",
  'web.setup.templateHint':
    'The template has one Slack team and one Google Chat team. Keep the one you use, set its channel, and delete the other before committing.',
  'web.setup.createFile': 'Create standcast.yml from the template',
  'web.setup.createRepo': 'Create the .github repository',
  'web.setup.template': 'standcast.yml template',
  'web.setup.failedTitle': 'Latest failed deliveries',
  'web.setup.noFailed': 'No failed deliveries.',
  'web.setup.teamFailures': 'Team messages',
  'web.setup.personFailures': 'Direct messages',
  'web.setup.count': 'Occurrences',
  'web.setup.kind.digest': 'Digest',
  'web.setup.kind.late_daily': 'Late daily',
  'web.setup.kind.reminder': 'Reminder',
  'web.setup.kind.blocker_route': 'Blocker routing',
  'web.setup.team': 'Team',
  'web.setup.error': 'Error',
  'web.setup.support': 'Support',
  'web.setup.subtitle':
    'Connect Standcast to your team tools and check that everything is running.',
  'web.setup.progress': '{done} of {total} steps done',
  'web.step.done': 'Done',
  'web.step.todo': 'To do',
  'web.step.error': 'Error',
  'web.badge.installed': 'Installed',
  'web.badge.connected': 'Connected',
  'web.badge.configured': 'Configured',
  'web.badge.optional': 'Optional',
  'web.badge.unavailable': 'Unavailable',
  'web.badge.needsAttention': 'Needs attention',
  'web.github.title': 'GitHub App',
  'web.github.installed': 'Installed on {owner}',
  'web.slack.connectedTo': 'Connected to {workspace}',
  'web.slack.description': 'Reminders and digests are posted in Slack.',
  'web.linear.description': 'Links Linear issues to dailies and blockers.',
  'web.linear.stopped': 'Linear stopped working',
  'web.config.description':
    'Teams, times and channels come from standcast.yml in the .github repository.',
  'web.config.editOnGithub': 'Edit on GitHub',
  'web.config.teamTimes': 'reminder {remindAt} · digest {digestAt}',
  'web.config.teams': 'Teams',
  'web.config.path': 'Path',
  'web.apiKeys.new': 'New key',
  'web.webhooks.new': 'New endpoint',
  'web.slack.title': 'Slack',
  'web.slack.connect': 'Connect Slack',
  'web.slack.reconnect': 'Reconnect Slack',
  'web.slack.adminOnly': 'Only an admin can connect or reconnect Slack.',
  'web.googleChat.title': 'Google Chat',
  'web.googleChat.description': 'Reminders and digests are posted in Google Chat spaces.',
  'web.googleChat.unavailable': 'Google Chat is not available on this server.',
  'web.googleChat.instructions':
    'Add the Standcast app to a Google Chat space; it posts a code. Paste it here.',
  'web.googleChat.spaces': 'Linked spaces',
  'web.googleChat.none': 'No space linked yet.',
  'web.googleChat.code': 'Link code',
  'web.googleChat.link': 'Link space',
  'web.googleChat.adminOnly': 'Only an admin can link a Google Chat space.',
  'web.template.teamName': 'Team',
  'web.apiKeys.title': 'API keys',
  'web.apiKeys.description':
    'Keys to connect other systems to Standcast with read-only access to the organization data. Only admins see this section.',
  'web.apiKeys.name': 'Name',
  'web.apiKeys.scopes': 'Scopes',
  'web.apiKeys.create': 'Create key',
  'web.apiKeys.created': 'Key created: {name}',
  'web.apiKeys.copyNow':
    'Copy it now. This key will not be shown again and Standcast stores only a hash of it.',
  'web.apiKeys.revokeHint':
    'Revoke this key in the list below if you could not copy it, and create another.',
  'web.apiKeys.createdAt': 'Created',
  'web.apiKeys.lastUsed': 'Last used',
  'web.apiKeys.never': 'Never',
  'web.apiKeys.revoke': 'Revoke',
  'web.apiKeys.revoked': 'Revoked',
  'web.apiKeys.none': 'No keys created.',
  'web.apiKeys.scope.teams_read': 'Read teams',
  'web.apiKeys.scope.dailies_read': 'Read dailies',
  'web.apiKeys.scope.digests_read': 'Read digests',
  'web.apiKeys.scope.blockers_read': 'Read blockers',
  'web.webhooks.title': 'Webhooks',
  'web.webhooks.description':
    'HTTPS endpoints that receive Standcast events, signed with the secret of each endpoint. Only admins see this section.',
  'web.webhooks.url': 'URL',
  'web.webhooks.events': 'Events',
  'web.webhooks.create': 'Add endpoint',
  'web.webhooks.created': 'Endpoint created: {url}',
  'web.webhooks.copyNow':
    'Copy it now. This signing secret will not be shown again and is stored encrypted.',
  'web.webhooks.disableHint':
    'If you could not copy it, disable this endpoint in the list below and create another.',
  'web.webhooks.none': 'No endpoints created.',
  'web.webhooks.active': 'Active',
  'web.webhooks.disabled': 'Disabled',
  'web.webhooks.disabledFailures': 'Disabled after {count} failed deliveries in a row',
  'web.webhooks.disable': 'Disable',
  'web.webhooks.sendTest': 'Send test event',
  'web.webhooks.deliveriesTitle': 'Latest 20 deliveries',
  'web.webhooks.noDeliveries': 'No deliveries.',
  'web.webhooks.attempts': 'Attempts',
  'web.webhooks.response': 'Response',
  'web.webhooks.createdAt': 'Created',
  'web.webhooks.lastDelivery': 'Last delivery',
  'web.webhooks.delivery.pending': 'Pending',
  'web.webhooks.delivery.delivered': 'Delivered',
  'web.webhooks.delivery.failed': 'Failed',
  'web.webhooks.event.daily_submitted': 'Daily submitted',
  'web.webhooks.event.blocker_opened': 'Blocker opened',
  'web.webhooks.event.digest_sent': 'Digest sent',
  'web.error.signIn': 'Sign in with GitHub',
  'web.error.questions': 'Questions?',
  'web.error.refresh': 'Refresh the page',
  'web.error.generic.title': 'Something went wrong',
  'web.error.generic.body': 'We could not complete this action. Please try again shortly.',
  'web.error.unauthorized.title': 'Login required',
  'web.error.unauthorized.body': 'Sign in with GitHub to continue.',
  'web.error.forbidden.title': 'Access denied',
  'web.error.forbidden.body': 'You do not have access to this Standcast installation.',
  'web.error.invalid_state.title': 'Link expired or invalid',
  'web.error.invalid_state.body': 'The authorization link expired or is invalid. Sign in again.',
  'web.error.access_denied.title': 'Authorization denied',
  'web.error.access_denied.body': 'Access was denied. Nothing was changed.',
  'web.error.installation_pending.title': 'Installation in progress',
  'web.error.installation_pending.body':
    'This installation is still being processed. Refresh the page in a few seconds.',
  'web.error.not_found.title': 'Not found',
  'web.error.not_found.body': 'The requested item does not exist or was already removed.',
  'web.error.rate_limited.title': 'Too many requests',
  'web.error.rate_limited.body': 'You made too many requests. Wait a minute and try again.',
  'web.error.invalid_code.title': 'Invalid code',
  'web.error.invalid_code.body':
    'The code does not exist, was already used or has expired. Remove the Standcast app from the space and add it again to get a new code.',
  'web.error.space_already_linked.title': 'Space already linked',
  'web.error.space_already_linked.body':
    'This Google Chat space is linked to another organization. An admin there must unlink it first.',
  'web.error.too_many_spaces.title': 'Too many spaces',
  'web.error.too_many_spaces.body':
    'This organization already has 20 linked Google Chat spaces, the maximum. Unlink one before linking another.',
  'web.error.slack_oauth_failed.title': 'Slack connection failed',
  'web.error.slack_oauth_failed.body':
    'We could not complete the Slack connection. Please try connecting again.',
  'web.error.linear_oauth_failed.title': 'Linear connection failed',
  'web.error.linear_oauth_failed.body': 'Could not finish connecting Linear. Try connecting again.',
  'cli.usage':
    'Usage: standcast <command> [options]\n\nCommands:\n  login     Sign in with GitHub\n  logout    Remove local credentials\n  whoami    Show the user and organizations\n  draft     Build the daily draft (JSON)\n  submit    Submit the daily (JSON from --file or stdin)\n  suggestion confirm|ignore <id>\n            Confirm or ignore a suggested blocker from the draft\n  mcp       Start the MCP server (stdio) for AI agents\n\nOptions:\n  --org <login>      Organization\n  --file <path>      Daily JSON file\n  --api-url <url>    API URL (STANDCAST_API_URL)\n  --sessions         Add local AI sessions to the draft (draft)\n  --help             Show this help\n  --version          Show the version',
  'cli.invalidArgs': 'Invalid arguments: {message}',
  'cli.suggestionUsage':
    'Usage: standcast suggestion confirm <id> [--org <login>]\n       standcast suggestion ignore <id> [--org <login>]',
  'cli.unknownCommand': 'Unknown command: {command}',
  'cli.notLoggedIn': 'You are not signed in. Run: standcast login',
  'cli.loggedIn': 'Signed in as {login}.',
  'cli.loggedOut': 'Credentials removed.',
  'cli.deviceCode': 'Open {uri} and enter the code: {code}',
  'cli.waitingAuth': 'Waiting for authorization on GitHub...',
  'cli.deviceExpired': 'The code expired. Run standcast login again.',
  'cli.deviceDenied': 'Authorization was denied on GitHub.',
  'cli.deviceFailed': 'GitHub login failed: {reason}',
  'cli.networkError': 'Could not connect to {url}.',
  'cli.retryAfter': 'retry after {seconds}s',
  'cli.ambiguousOrg': 'More than one organization. Use --org with one of: {orgs}',
  'cli.noOrgs': 'No organization with Standcast installed for this user.',
  'cli.invalidJson': 'The daily JSON is invalid.',
  'cli.validationFailed': 'The daily is invalid:',
  'cli.fileReadFailed': 'Could not read the file {path}.',
  'cli.insecureUrl': 'Insecure URL: {url}. Use https (http only for localhost).',
  'cli.originMismatch':
    'The stored credentials belong to a different API. Run: standcast login --api-url {url}',
  'cli.githubUrlIgnored':
    'STANDCAST_GITHUB_URL ignored: only localhost is accepted. Using https://github.com.',
  'cli.confirm.question': 'Send this daily to {org}? Date: {date}.',
  'cli.confirm.yesterday': '🗓️ Yesterday:',
  'cli.confirm.today': '🎯 Today:',
  'cli.confirm.blockers': '🚧 Blockers:',
  'cli.confirm.support': '🤝 Support requests:',
  'cli.confirm.none': '(none)',
  'cli.confirm.title': 'Send this daily',
  'cli.confirm.description': 'Check to send the daily exactly as shown.',
  'reminder.title': 'Daily reminder',
  'reminder.body': 'The team digest goes out at {digestAt}. Send yours with /daily when you can.',
  'blockerRouted.title': "{name}'s blocker",
  'blockerRouted.body':
    '{name} confirmed a blocker in their daily: {blocker}. Can you help unblock it?',
  'blockerRouted.reason.pr_reviewers':
    'You got this because you are a requested reviewer on the PR.',
  'blockerRouted.reason.codeowners': 'You got this because you own code changed in the PR.',
  'blockerRouted.reason.card_blocker':
    'You got this because you are responsible for the blocking card.',
  'blockerRouted.reason.card_owner':
    'You got this because you are responsible for or created the blocked card.',
  'blockerRouted.reason.manager': 'You got this because you manage the team.',
  'blockerAlert.title': '🚧 Blocker open for {age} · {team}',
  'blockerAlert.body':
    '{managers}, this blocker has been open for {age}. Can someone help unblock it?',
  'blockerAlert.opened': 'Open since {date}, reported by {author}.',
  'blockerAlert.routed': 'Routed to {logins}.',
  'blockerAlert.age.one': '1 day',
  'blockerAlert.age.other': '{days} days',
  'suggestion.pr_no_review':
    'The PR {title} has had no review for over {hours}h. Want to mention it as a blocker?',
  'suggestion.ci_failing':
    'The checks on PR {title} have been failing for over {hours}h. Want to mention it as a blocker?',
  'suggestion.card_stale':
    'The card {title} has been idle for over {days} days. Want to mention it as a blocker?',
  'setup.linear.title': 'Linear',
  'setup.linear.connect': 'Connect Linear',
  'setup.linear.connected': 'Connected to the {workspace} workspace.',
  'setup.linear.reconnect': 'Reconnect Linear',
  'setup.linear.invalid':
    'The connection to the {workspace} workspace stopped working. Reconnect Linear.',
  'setup.linear.adminOnly': 'Only an admin can connect or reconnect Linear.',
  'setup.teams.missing':
    'Team {team}: the GitHub team {reference} was not found, or Standcast cannot see it. Check the name, and that the app has the Members permission on the organization.',
  'setup.teams.truncated':
    'Team {team}: the GitHub team {reference} is too large; only the first 5,000 members are used.',
  'setup.teams.channelNotFound':
    'Team {team}: the Slack channel {reference} was not found. Create it, or if it is private, invite the Standcast bot with /invite @Standcast.',
  'setup.teams.channelNotMember':
    'Team {team}: the Standcast bot is not in the Slack channel {reference}. Invite it with /invite @Standcast in the channel.',
  'setup.teams.spaceNotLinked':
    'Team {team}: this Google Chat space ({reference}) is not linked to this organization yet. Add the Standcast app to the space and paste the code it posts in Settings → Google Chat.',
  'setup.teams.spaceNotFound':
    'Team {team}: the Google Chat space {reference} was not found. Check the space name, and add the Standcast app to the space.',
  'setup.teams.spaceNotMember':
    'Team {team}: the Standcast app is not in the Google Chat space {reference}. Add the Standcast app to the space.',
  'setup.tracker.jiraComingSoon': 'The Jira integration is not available yet.',
  'setup.tracker.notConnected':
    'This team uses Linear, but Linear is not connected to this installation yet.',
  'suggestion.dm.title': 'Suggestions just for you',
  'checkRun.success.title': 'standcast.yml is valid',
  'checkRun.failure.title': 'standcast.yml is invalid',
  'checkRun.summary': '{count} error(s) found:\n{errors}',
  'checkRun.publicIdentity.title': 'standcast.yml exposes personal data',
  'checkRun.publicIdentity.message':
    "The {repo} repository is public and the members map has identity overrides (linear, slack, google_chat, jira). They publish each person's work e-mail and the login to e-mail mapping. Move standcast.yml to the {preferred} repository (or make {repo} private), or remove the overrides and use the default linking: the GitHub verified e-mail at standcast login and the Google Chat direct message.",
  'googleChat.linkCode':
    'Standcast is in this space. To get digests here, an admin of your GitHub organization pastes this code in Standcast, Settings → Google Chat: {code}. The code is valid for 24 hours.',
  'googleChat.spaceLinked':
    'This space now gets the digests of the {org} organization on Standcast. If that is not right, remove the app from the space to undo it.',
  'googleChat.linked': "You're linked, {logins}.",
  'googleChat.notFound':
    'No Standcast account uses this email; run `standcast login` first, then message me again.',
  'googleChat.notConnected':
    'I found your account, but none of your organizations has connected Google Chat to Standcast yet. Ask an admin to link a space, then message me again.',
  'googleChat.ambiguous':
    'This email belongs to more than one GitHub account on Standcast, so I linked none of them. Ask an admin to set `google_chat` for you under `members` in standcast.yml, or keep the email only on your own GitHub account and run `standcast login` again.',
  'googleChat.mapHint':
    'Your Google Chat id is {userId}. If the primary email of your GitHub account is a different one, an admin can link you by hand: under `members` in standcast.yml, set `google_chat: {userId}` for your GitHub login.',
} as const satisfies Record<keyof typeof ptBR, string>;

const messages: {
  'pt-BR': Record<keyof typeof en, string>;
  en: Record<keyof typeof ptBR, string>;
} = { 'pt-BR': ptBR, en };

export type MessageKey = keyof typeof ptBR;

export function t(
  lang: Language,
  key: MessageKey,
  vars: Record<string, string | number> = {},
): string {
  const template = messages[lang][key];
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

export function formatDate(lang: Language, isoDate: string): string {
  if (lang !== 'pt-BR') return isoDate;
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}
