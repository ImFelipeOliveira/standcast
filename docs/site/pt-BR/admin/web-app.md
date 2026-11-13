# App web

O app web em [app.standcast.app](https://app.standcast.app) mostra a sua organização em duas telas: **Configuração** e **Hoje**. Entre com o GitHub. O app lista as organizações onde o Standcast está instalado e das quais você é membro.

O app está em português e inglês, com tema claro e escuro.

## Configuração

A Configuração mostra tudo o que o Standcast sabe sobre a organização:

- a instalação do GitHub App;
- as conexões com Slack e Linear, com o botão para conectar ou reconectar (só admins);
- o card do Google Chat: os espaços vinculados, cada um com o nome de exibição, o nome `spaces/...` e um botão **Copiar**. Admins colam um código de vínculo e clicam em **Vincular espaço**, e podem **Desvincular** um espaço depois de confirmar. Veja [Google Chat](/pt-BR/admin/google-chat);
- o estado do `standcast.yml`: válido, inválido com os erros, ou ausente, com um link para criá-lo a partir de um modelo;
- cada time, com os horários do lembrete e do consolidado, o canal e qualquer time do GitHub, canal do Slack ou espaço do Google Chat que o Standcast não encontra ou que não está vinculado;
- as últimas entregas que falharam, para você ver quando um consolidado, um lembrete ou um impedimento encaminhado não chegou.

## Hoje

Hoje mostra um time no dia atual, no fuso horário do time. Escolha o time na barra lateral. Em um dia que não é dia útil do time, Hoje mostra o próximo dia útil.

- **Resumo**: quantas pessoas enviaram a daily de hoje, impedimentos abertos, pedidos de apoio e o que foi entregue ontem.
- **Precisa de você**: impedimentos abertos e pedidos de apoio. Cada impedimento mostra há quanto tempo está aberto, se voltou em dailies seguintes, para quem foi encaminhado e por quê, e, quando o pull request citado foi mergeado no dia em que o impedimento abriu ou depois, um aviso de que provavelmente foi resolvido, com a data do merge quando não foi hoje.
- **Dailies**: as dailies de hoje, com um filtro para quem enviou e quem não enviou. **Ver daily completa** abre a daily inteira.
- **Entregue ontem**: pull requests e cards citados nos itens de ontem.
- **Quem já enviou hoje**: os nomes, só de hoje.

Um membro do time abre Hoje do próprio time. Gestores abrem os times que gerenciam. Só admins abrem qualquer time.

### Resolver um impedimento

Gestores, admins e a pessoa que escreveu o impedimento podem marcá-lo como resolvido e reabri-lo. Um impedimento resolvido sai da lista de abertos. Se a pessoa listar o impedimento de novo na daily de um dia seguinte, ele abre de novo. Reenviar a daily do dia em que ele foi resolvido mantém o impedimento resolvido. Um impedimento resolvido só pode ser reaberto enquanto está na última daily da pessoa: depois que ela envia uma daily sem ele, ele continua resolvido até ela listar de novo.

### Lembrar agora

Gestores e admins veem **Lembrar agora** ao lado de quem ainda não enviou a daily de hoje. O botão manda a mesma mensagem direta do lembrete agendado, no máximo uma vez por dia. Ele só funciona em dia útil do time e antes de o consolidado desse time ser publicado, mesmo quando a pessoa também está em um time com consolidado mais tarde.

## O que o app não mostra

O Standcast existe para destravar o time, não para vigiar pessoas:

- nenhuma métrica, taxa, nota ou ranking por pessoa;
- nenhum histórico de quem não enviou. Hoje mostra quem falta só no dia de hoje, e não existe tela para dias anteriores;
- uma daily enviada depois do consolidado mostra "depois do consolidado" só no card daquele dia.

Veja [Privacidade](/pt-BR/privacy) para saber o que o Standcast guarda e quem vê o quê.
