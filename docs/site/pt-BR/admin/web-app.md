# App web

O app web em [app-standcast.usefachada.dev](https://app-standcast.usefachada.dev) mostra a sua organização em duas telas: **Configuração** e **Hoje**. Entre com o GitHub. O app lista as organizações onde o Standcast está instalado e das quais você é membro.

O app está em português e inglês, com tema claro e escuro.

## Configuração

A Configuração mostra tudo o que o Standcast sabe sobre a organização:

- a instalação do GitHub App;
- as conexões com Slack e Linear, com o botão para conectar ou reconectar (só admins);
- o estado do `standcast.yml`: válido, inválido com os erros, ou ausente, com um link para criá-lo a partir de um modelo;
- cada time, com os horários do lembrete e do consolidado, o canal e qualquer time do GitHub ou canal do Slack que o Standcast não encontra;
- as últimas entregas que falharam, para você ver quando um consolidado, um lembrete ou um impedimento encaminhado não chegou.

A página de setup renderizada pelo servidor continua funcionando.

## Hoje

Hoje mostra um time no dia atual, no fuso horário do time. Escolha o time na barra lateral. Em um dia que não é dia útil do time, Hoje mostra o próximo dia útil.

- **Resumo**: quantas pessoas enviaram a daily de hoje, impedimentos abertos, pedidos de apoio e o que foi entregue ontem.
- **Precisa de você**: impedimentos abertos e pedidos de apoio. Cada impedimento mostra há quanto tempo está aberto, se voltou em dailies seguintes, para quem foi encaminhado e por quê, e, quando o pull request citado foi mergeado no dia em que o impedimento abriu ou depois, um aviso de que provavelmente foi resolvido, com a data do merge quando não foi hoje.
- **Dailies**: as dailies de hoje, com um filtro para quem enviou e quem não enviou. **Ver daily completa** abre a daily inteira.
- **Entregue ontem**: pull requests e cards citados nos itens de ontem.
- **Quem já enviou hoje**: os nomes, só de hoje.

Um membro do time abre Hoje do próprio time. Gestores abrem os times que gerenciam. Só admins abrem qualquer time.

### Resolver um impedimento

Gestores, admins e a pessoa que escreveu o impedimento podem marcá-lo como resolvido e reabri-lo. Um impedimento resolvido sai da lista de abertos. Se a pessoa continuar listando o impedimento em uma daily seguinte, ele abre de novo.

### Lembrar agora

Gestores e admins veem **Lembrar agora** ao lado de quem ainda não enviou a daily de hoje. O botão manda a mesma mensagem direta do lembrete agendado, no máximo uma vez por dia. Ele só funciona em dia útil do time e antes de o consolidado ser publicado.

## O que o app não mostra

O Standcast existe para destravar o time, não para vigiar pessoas:

- nenhuma métrica, taxa, nota ou ranking por pessoa;
- nenhum histórico de quem não enviou. Hoje mostra quem falta só no dia de hoje, e não existe tela para dias anteriores;
- uma daily enviada depois do consolidado mostra "depois do consolidado" só no card daquele dia.

Veja [Privacidade](/pt-BR/privacy) para saber o que o Standcast guarda e quem vê o quê.
