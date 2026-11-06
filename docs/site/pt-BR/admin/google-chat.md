# Google Chat

O Standcast pode publicar o consolidado de um time num espaço do Google Chat em vez de num canal do Slack. O app do Standcast para o Google Chat faz o mesmo que o bot do Slack:

- publica o consolidado do time no espaço no `digest_at`, e as dailies atrasadas na thread dele;
- manda lembretes e impedimentos encaminhados por mensagem direta;
- manda impedimentos sugeridos por mensagem direta quando o time tem `signals.direct_message: true`.

Uma organização pode usar o Slack num time e o Google Chat em outro. A escolha é por time, no `standcast.yml`.

O app não lê mensagens nos espaços. Ele não tem cards nem comandos: a daily continua sendo escrita no seu agente de IA ou na CLI.

## Disponibilidade

O app funciona nos domínios do Google Workspace em que ele está disponível. Uma listagem no Google Workspace Marketplace vem em breve, para que qualquer domínio do Workspace possa instalá-lo. Até lá, se você não encontrar o app do Standcast no Google Chat, escreva para <SupportEmail />.

Se o card do Google Chat no app web diz "O Google Chat não está disponível neste servidor.", o servidor do Standcast que você usa não tem um app do Google Chat configurado.

## 1. Adicione o app a um espaço

1. No Google Chat, abra o espaço onde o consolidado deve chegar.
2. Abra o menu do espaço, escolha **Apps e integrações**, depois **Adicionar apps**, e escolha **Standcast**.

O app publica uma mensagem no espaço, em inglês e português, com um código de vínculo:

> O Standcast está neste espaço. Para receber os consolidados aqui, um admin da sua organização no GitHub cola este código no Standcast, em Configuração → Google Chat: `K7QF3MZP`. O código vale por 24 horas.

O código tem 8 caracteres, vale por 24 horas e só funciona uma vez. Para receber um código novo, remova o app do espaço e adicione de novo. O código novo substitui o anterior.

## 2. Vincule o espaço

Só um admin da organização pode vincular um espaço: um admin da organização no GitHub, ou o dono da conta, numa conta pessoal.

No [app web](/pt-BR/admin/web-app), abra **Configuração**. No card **Google Chat**, cole o código em **Código de vínculo** e clique em **Vincular espaço**. Você também pode usar a etapa **Google Chat** no fim da página de setup renderizada pelo servidor.

O card passa a listar os espaços vinculados, com o nome de exibição do espaço e o nome dele, como `spaces/AAAAbbbbCCC`. Use **Copiar** para copiar o nome para o `standcast.yml`. Os outros membros veem a lista só para leitura.

Se o código não funcionar:

| Mensagem | O que fazer |
| --- | --- |
| Este código não é válido. Ele pode ter expirado ou já ter sido usado. | Remova o app do espaço e adicione de novo para receber outro código. |
| Este espaço já está vinculado a outra organização. | Um admin dessa organização desvincula o espaço antes. |
| Muitas tentativas. Espere um minuto e tente de novo. | Espere um minuto. As tentativas de vínculo são limitadas a 10 por minuto. |

Depois do vínculo, o app publica no espaço, em inglês e português, qual organização passa a receber os consolidados ali. Se não for a sua organização, remova o app do espaço para desfazer o vínculo.

Um espaço só pode estar vinculado a uma organização. Colar o código é o que prova que a sua organização pode publicar ali: só o nome do espaço no `standcast.yml` não basta.

## 3. Coloque o espaço no `standcast.yml`

Use `provider: google-chat` e o nome do espaço como canal:

```text
chat:
  provider: google-chat
  channel: spaces/AAAAbbbbCCC
```

O nome do espaço começa com `spaces/`. Copie do card do Google Chat, ou pegue a última parte do endereço do espaço no Google Chat e coloque `spaces/` antes. Veja a [referência do standcast.yml](/pt-BR/admin/configuration#chat).

A página de setup e o app web avisam no card do time quando o espaço não está vinculado à sua organização, não foi encontrado ou não tem o app.

## Desvincular um espaço

No card do Google Chat, um admin clica em **Desvincular** e depois em **Desvincular agora**. O Standcast para de publicar naquele espaço. Remover o app do espaço no Google Chat tem o mesmo efeito.

Quando a organização fica sem nenhum espaço vinculado, o Google Chat é desconectado. O vínculo de cada pessoa com o Google Chat é mantido, e volta a valer assim que um espaço for vinculado. Para vincular o espaço de novo, remova o app do espaço e adicione de novo para receber um código novo.

## Como as pessoas são vinculadas

O Google Chat não deixa o app achar uma pessoa pelo e-mail, então cada pessoa se vincula uma vez:

1. Rode `standcast login`, para o Standcast conhecer a sua conta do GitHub.
2. No Google Chat, mande uma mensagem direta para o app do Standcast. Qualquer texto serve.

O Standcast compara o e-mail da sua conta do Google com o e-mail principal verificado da sua conta do GitHub, e vincula você em todas as suas organizações que têm um espaço vinculado. O app responde:

| Resposta | O que significa |
| --- | --- |
| Vínculo feito, @seu-login. | Pronto. |
| Nenhuma conta do Standcast usa este e-mail. Rode `standcast login` primeiro e depois me mande uma mensagem de novo. | O Standcast não tem conta com este e-mail. Entre primeiro. Se o seu e-mail do GitHub é outro, veja abaixo. |
| Achei a sua conta, mas nenhuma organização sua conectou o Google Chat ao Standcast ainda. Peça a um admin para vincular um espaço e me mande uma mensagem de novo. | Vincule um espaço primeiro e mande uma mensagem para o app de novo. |
| Este e-mail pertence a mais de uma conta do GitHub no Standcast, então não vinculei nenhuma. Peça a um admin para definir `google_chat` para você em `members` no standcast.yml, ou deixe o e-mail certo só na sua conta do GitHub e rode `standcast login` de novo. | Duas ou mais contas do GitHub que entraram no Standcast têm este e-mail, então o Standcast não vincula nenhuma e apaga qualquer vínculo que já tinha para este usuário do Google Chat. Mapeie a pessoa à mão, como abaixo, ou tire o e-mail das outras contas. |

A resposta vem no idioma do time quando o Standcast sabe qual é, e em inglês e português quando não sabe.

Quando os e-mails são diferentes, um admin mapeia a pessoa à mão no `standcast.yml`, com o id de usuário dela no Google Chat:

```text
members:
  bob: { google_chat: users/123456789 }
```

O valor precisa ser `users/` seguido de dígitos. Os dígitos são o id de usuário do Google da pessoa, o mesmo id que o Admin SDK do Google Workspace e a People API usam.

As menções no consolidado usam o mapeamento. As mensagens diretas só usam o mapeamento quando a pessoa participa de pelo menos um espaço vinculado à sua organização: antes de cada mensagem direta, o Standcast pergunta ao Google Chat se esse usuário está em um dos seus espaços vinculados. Ele confere no máximo 10 espaços vinculados, ao mesmo tempo, e para no primeiro em que a pessoa participa. Se ela não estiver em nenhum, nada é enviado e a entrega falha com `no_chat_identity`. Se o Google Chat não responder a tempo, a entrega falha com `timeout` e há nova tentativa. Um mapeamento só alcança pessoas de um espaço vinculado à sua organização. Isso pode incluir convidados externos que o espaço aceita, então mapeie só pessoas em quem você confia. Quando o mapeamento é o mesmo usuário que a pessoa vinculou pela mensagem direta, a conferência não é necessária.

O consolidado menciona cada pessoa vinculada com o usuário dela no Google Chat, e mostra `@` seguido do login do GitHub, como texto, quando não há vínculo.

## O que acontece sem vínculo

- **A pessoa não está vinculada.** Lembretes, impedimentos encaminhados e impedimentos sugeridos para ela falham com `no_chat_identity`. O consolidado sai mesmo assim, com `@login`.
- **A pessoa nunca abriu uma mensagem direta com o app.** O Google Chat só entrega mensagem direta depois que a pessoa falou com o app uma vez. As entregas para ela falham com `no_dm_space` e não são repetidas. Peça para ela mandar uma mensagem direta para o app.
- **O espaço não está vinculado à sua organização.** O consolidado e as dailies atrasadas do time falham com `space_not_linked`. Nada é publicado, e não há nova tentativa. Vincule o espaço com um código.

## Erros de entrega

Quando uma publicação falha, a página de setup e o app web mostram a falha em "Últimas entregas com falha". O Standcast tenta cada mensagem até 3 vezes no total, com os mesmos limites de tempo do Slack: um consolidado só é tentado de novo até 120 minutos depois do `digest_at`, e um lembrete nunca sai no `digest_at` ou depois dele.

| Código do erro | Significado | Como resolver |
| --- | --- | --- |
| `space_not_linked` | O espaço do time não está vinculado a esta organização. Não há nova tentativa. | Adicione o app ao espaço e vincule com o código. |
| `no_dm_space` | A pessoa ainda não mandou mensagem para o app do Standcast. Não há nova tentativa. | Peça para a pessoa mandar uma mensagem direta para o app. |
| `channel_not_found` | O espaço não existe, ou o `chat.channel` não é um nome `spaces/...` válido. | Confira o `chat.channel`. Copie o nome do card do Google Chat. |
| `not_in_channel` | O app não está no espaço, ou não pode publicar ali. | Adicione o app do Standcast ao espaço. |
| `user_not_found` | O Google Chat não conhece o usuário da pessoa. O Standcast apaga o vínculo guardado. | Peça para a pessoa mandar mensagem para o app de novo, ou corrija `members.<login>.google_chat`. |
| `invalid_auth` | O Google Chat recusou as credenciais do app do Standcast. | Fale com o suporte. |
| `ratelimited` | O Google Chat pediu para o Standcast ir mais devagar. | Nada a fazer; há nova tentativa. |
| `timeout`, `request_failed`, `http_error`, `invalid_response` | O Google Chat não respondeu a tempo, não pôde ser acessado, ou respondeu com erro. | Nada a fazer; há nova tentativa. Fale com o suporte se repetir. |
| `no_chat_connection` | Nenhum espaço está vinculado a esta organização, ou o servidor não tem app do Google Chat. | Vincule um espaço. Se a página de setup diz que o Google Chat não está disponível neste servidor, fale com quem opera o servidor para configurar o Google Chat. |
| `no_chat_identity` | A pessoa, ou o gestor para quem um impedimento foi, não tem vínculo com o Google Chat, ou o usuário em `members.<login>.google_chat` não está em nenhum dos seus espaços vinculados. | Peça para a pessoa mandar mensagem para o app, ou adicione a pessoa a um espaço vinculado. |
| `no_route_target` | Um impedimento não tinha destinatário nenhum, por exemplo porque quem escreveu é o único gestor do time. | Adicione outro gestor ao time. |
| `worker_died` | O worker parou três vezes durante o envio. | Fale com o suporte se repetir. |
| `internal_error` | Erro inesperado. | Fale com o suporte se repetir. |

## Limites que vale conhecer

- As mensagens são texto simples. Um consolidado com mais de 4.096 caracteres é cortado e termina com "… see Standcast".
- O app só reage quando é adicionado a um espaço ou removido dele, e a mensagens diretas. Mencionar o app num espaço não faz nada.
- Códigos de vínculo: 8 caracteres, valem por 24 horas, uso único. As tentativas de vínculo são limitadas a 10 por minuto.
- O Standcast trata no máximo 120 eventos do Google Chat por espaço por minuto.

O que o app recebe e guarda está em [Privacidade](/pt-BR/privacy#google-chat).
