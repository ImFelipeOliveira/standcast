# Google Chat

O Standcast pode publicar o consolidado de um time num espaço do Google Chat em vez de num canal do Slack. O app do Standcast para o Google Chat faz o mesmo que o bot do Slack:

- publica cada daily no espaço quando ela é enviada, e o consolidado do time no `digest_at`;
- manda lembretes e impedimentos encaminhados por mensagem direta;
- manda impedimentos sugeridos por mensagem direta quando o time tem `signals.direct_message: true`.

Uma organização pode usar o Slack num time e o Google Chat em outro. A escolha é por time, no `standcast.yml`.

O app não lê mensagens nos espaços. Ele não tem comandos, e o único botão dele é **Vincular minha conta**, embaixo do consolidado: a daily continua sendo escrita no seu agente de IA ou na CLI.

## Disponibilidade

O app funciona nos domínios do Google Workspace em que ele está disponível. Uma listagem no Google Workspace Marketplace vem em breve, para que qualquer domínio do Workspace possa instalá-lo. Até lá, se você não encontrar o app do Standcast no Google Chat, escreva para <SupportEmail />.

Se o card do Google Chat no app web diz "O Google Chat não está disponível neste servidor.", o servidor do Standcast que você usa não tem um app do Google Chat configurado.

## 1. Adicione o app a um espaço

1. No Google Chat, abra o espaço onde o consolidado deve chegar.
2. Abra o menu do espaço, escolha **Apps e integrações**, depois **Adicionar apps**, e escolha **Standcast**.

O app publica uma mensagem no espaço com um código de vínculo. Ela vem no `language` dos times cujo `chat.channel` é este espaço no `standcast.yml`, e em inglês quando nenhum time usa o espaço ainda ou os times dele têm idiomas diferentes:

> O Standcast está neste espaço. Para receber os consolidados aqui, um admin da sua organização no GitHub cola este código no Standcast, em Configuração → Google Chat: `K7QF3MZP`. O código vale por 24 horas.

O código tem 8 caracteres, vale por 24 horas e só funciona uma vez. Para receber um código novo, remova o app do espaço e adicione de novo. O código novo substitui o anterior.

## 2. Vincule o espaço

Só um admin da organização pode vincular um espaço: um admin da organização no GitHub, ou o dono da conta, numa conta pessoal.

No [app web](/pt-BR/admin/web-app), abra **Configuração**. No card **Google Chat**, cole o código em **Código de vínculo** e clique em **Vincular espaço**.

O card passa a listar os espaços vinculados, com o nome de exibição do espaço e o nome dele, como `spaces/AAAAbbbbCCC`. Use **Copiar** para copiar o nome para o `standcast.yml`. Os outros membros veem a lista só para leitura.

Se o código não funcionar:

| Mensagem | O que fazer |
| --- | --- |
| Este código não é válido. Ele pode ter expirado ou já ter sido usado. | Remova o app do espaço e adicione de novo para receber outro código. |
| Este espaço já está vinculado a outra organização. | Um admin dessa organização desvincula o espaço antes. |
| Muitas tentativas. Espere um minuto e tente de novo. | Espere um minuto. As tentativas de vínculo são limitadas a 10 por minuto. |
| Esta organização já tem 20 espaços vinculados, o máximo. Desvincule um antes. | Uma organização pode vincular até 20 espaços. Desvincule um que não usa mais. |

Depois do vínculo, o app publica no espaço qual organização passa a receber os consolidados ali, no idioma dos times do espaço, ou em inglês como acima. Se não for a sua organização, remova o app do espaço para desfazer o vínculo.

Um espaço só pode estar vinculado a uma organização. Colar o código é o que prova que a sua organização pode publicar ali: só o nome do espaço no `standcast.yml` não basta.

## 3. Coloque o espaço no `standcast.yml`

Use `provider: google-chat` e o nome do espaço como canal:

```text
chat:
  provider: google-chat
  channel: spaces/AAAAbbbbCCC
```

O nome do espaço começa com `spaces/`. Copie do card do Google Chat, ou pegue a última parte do endereço do espaço no Google Chat e coloque `spaces/` antes. Veja a [referência do standcast.yml](/pt-BR/admin/configuration#chat).

O app web avisa no card do time quando o espaço não está vinculado à sua organização, não foi encontrado ou não tem o app.

## Desvincular um espaço

No card do Google Chat, um admin clica em **Desvincular** e depois em **Desvincular agora**. O Standcast para de publicar naquele espaço. Remover o app do espaço no Google Chat tem o mesmo efeito.

Quando a organização fica sem nenhum espaço vinculado, o Google Chat é desconectado. O vínculo de cada pessoa com o Google Chat é mantido, e volta a valer assim que um espaço for vinculado. Para vincular o espaço de novo, remova o app do espaço e adicione de novo para receber um código novo.

## Como as pessoas são vinculadas

O Google Chat não deixa o app achar uma pessoa pelo e-mail, então cada pessoa se vincula uma vez, pelo espaço do time dela. Entrar no Standcast antes é opcional. No espaço do time, faça uma destas coisas:

- clique em **Vincular minha conta** embaixo do consolidado do time;
- mencione o app do Standcast, por exemplo `@Standcast oi`.

O vínculo vale só para a organização do espaço onde você clicou ou mencionou o app, nunca para as suas outras organizações. Para se vincular em outra organização, faça isso num espaço dela.

Uma mensagem direta para o app não vincula: ela não pertence a nenhuma organização. O app responde que vincula contas pelo espaço do seu time.

O consolidado só mostra o botão **Vincular minha conta** enquanto alguém nele não está vinculado e aparece como `@login`. O botão vale para quem clica: ele vincula a pessoa que clicou, nunca as pessoas citadas no consolidado.

Os dois jeitos fazem a mesma coisa. Se você já entrou antes, o Standcast compara o e-mail da sua conta do Google com qualquer e-mail verificado da sua conta do GitHub, principal ou não, entre os membros da organização do espaço, e vincula você ali. Ele guarda só o seu id de usuário no Google Chat. Clicar de novo, ou mencionar o app de novo, mantém um único vínculo. O app responde, e a resposta só aparece para você:

| Resposta | O que significa |
| --- | --- |
| Vínculo feito, @seu-login. | Pronto. |
| Nenhuma conta do Standcast nesta organização usa este e-mail. A resposta também traz um link de entrada privado, "Entrar com GitHub para vincular a sua conta". | Nenhum membro desta organização tem este e-mail. Abra o link, entre com o GitHub e confirme. Ele vale por 15 minutos e só funciona uma vez. Você também pode entrar no app web ou com `standcast login` e clicar de novo. Se você não consegue entrar, veja abaixo. |
| Eu vinculo contas pelo espaço do seu time. Clique em Vincular minha conta abaixo do consolidado do time, ou me mencione nesse espaço. | Você mandou uma mensagem direta para o app. Faça isso pelo espaço do time. |
| Este espaço ainda não está vinculado a uma organização no Standcast. Peça a um admin para vinculá-lo e depois clique em Vincular minha conta de novo. | O espaço não está vinculado a uma organização, ou a organização não tem mais o Google Chat conectado. Um admin vincula o espaço com um código; depois clique em **Vincular minha conta** ou mencione o app de novo. |
| Este e-mail pertence a mais de uma conta do GitHub no Standcast, então não vinculei nenhuma. Peça a um admin para definir `google_chat` para você em `members` no standcast.yml, ou deixe o e-mail certo só na sua conta do GitHub e rode `standcast login` de novo. | Duas ou mais contas do GitHub que entraram no Standcast têm este e-mail, então o Standcast não vincula nenhuma. Na organização do espaço, ele também apaga os vínculos do Google Chat dessas contas e qualquer vínculo com este usuário do Google Chat. Mapeie a pessoa à mão, como abaixo, ou tire o e-mail das outras contas. |

A resposta vem em um idioma só: o dos times do espaço onde você clica no botão ou menciona o app. Quando o Standcast não consegue saber, ou esses times têm idiomas diferentes, ela vem em inglês. Nas respostas de conta não encontrada e de e-mail em mais de uma conta, o app também diz o id da pessoa no Google Chat (`users/` seguido de dígitos), pronto para o mapeamento abaixo.

### O link para entrar

O link funciona mesmo quando o e-mail da sua conta do Google não é um e-mail verificado da sua conta do GitHub. Ele prova os dois lados: só você recebeu o link, e você entra com o GitHub. Os e-mails não precisam ser iguais.

1. Abra o link e entre com o GitHub, se você ainda não entrou.
2. O Standcast mostra uma página: "Vincular a conta do Google Chat voce@empresa.com ao seu GitHub @login em sua-org?" Confira que a conta do Google é sua.
3. Clique em **Vincular**. A página diz "Vínculo feito em sua-org, @login. Pode fechar esta página." e o app manda uma mensagem direta com "Vínculo feito, @login." **Cancelar** não muda nada.

O link vale uma vez e expira em 15 minutos. Ele vincula o seu usuário do Google Chat só na organização do espaço onde você clicou, e só quando a sua conta do GitHub é membro dela. Senão, a página diz "A sua conta do GitHub @login não é membro de sua-org no Standcast. Entre com a conta do GitHub que você usa lá."

Outras páginas que você pode ver:

| Página | O que significa |
| --- | --- |
| Este link expirou. Clique em Vincular minha conta no Google Chat de novo. | O link expirou ou já foi usado. Peça um novo. |
| sua-org não tem mais o Google Chat conectado ao Standcast. Peça a um admin para vincular um espaço. | A organização não tem mais espaço vinculado. |
| Um admin definiu a sua conta do Google Chat no standcast.yml, então nada mudou. | Um mapeamento de admin no `standcast.yml` vale mais que o link. |
| Isso substitui o seu vínculo atual com o Google Chat em sua-org. | Aparece antes de você confirmar quando você já estava vinculado a outra conta do Google Chat nessa organização. |

Um usuário do Google Chat é uma pessoa só: quando você se vincula, qualquer outro membro da organização vinculado ao mesmo usuário do Google Chat é desvinculado. Quando o seu vínculo substitui outra conta sua do Google Chat, essa conta recebe uma mensagem direta: "Outra conta do Google Chat foi vinculada a @login em sua-org, então esta não está mais. Se não foi você, avise um admin."

O GitHub manda os seus e-mails verificados para o Standcast quando você roda `standcast login` ou entra no app web. O seu e-mail principal sempre vale. Os outros e-mails verificados só valem por 30 dias depois dessa entrada, então um e-mail que você tira do GitHub deixa de valer até lá. Depois de adicionar e verificar o seu e-mail do Google no GitHub, entre de novo de um desses jeitos e, em até 30 dias, clique em **Vincular minha conta** ou mencione o app no espaço do time. Se a sua conta do GitHub tem 1.000 e-mails ou mais, o Standcast não consegue ler todos e mantém a lista da entrada anterior até os 30 dias dela acabarem; peça a um admin para mapear você à mão, como abaixo.

Quando o e-mail do Google não é um e-mail verificado da conta do GitHub, um admin mapeia a pessoa à mão no `standcast.yml`, com o id de usuário dela no Google Chat:

```text
members:
  bob: { google_chat: users/123456789 }
```

O valor precisa ser `users/` seguido de dígitos. Os dígitos são o id de usuário do Google da pessoa, o mesmo id que o Admin SDK do Google Workspace e a People API usam.

As menções no consolidado usam o mapeamento como está, sem conferência. As mensagens diretas só conferem o mapeamento quando ele é um usuário diferente do que a pessoa vinculou pelo chat: antes de cada uma dessas mensagens diretas, o Standcast pergunta ao Google Chat se esse usuário está em um dos seus espaços vinculados. Ele confere todos os espaços vinculados, até 5 ao mesmo tempo e até 4 segundos por conferência, e para no primeiro em que a pessoa participa. Se ela não estiver em nenhum, nada é enviado e a entrega falha com `no_chat_identity`. Se o Google Chat não responder a tempo, a entrega falha com `timeout`: lembretes e impedimentos encaminhados são tentados de novo, uma mensagem de impedimento sugerido não. Quando o mapeamento é o mesmo usuário que a pessoa vinculou pelo chat, o Standcast envia sem a conferência. Um espaço vinculado pode ter convidados externos, então mapeie só pessoas em quem você confia.

O consolidado menciona cada pessoa vinculada com o usuário dela no Google Chat, e mostra `@` seguido do login do GitHub, como texto, quando não há vínculo.

## O que acontece sem vínculo

- **A pessoa não está vinculada.** Lembretes, impedimentos encaminhados e impedimentos sugeridos para ela falham com `no_chat_identity`. O consolidado sai mesmo assim, com `@login`. O botão **Vincular minha conta** aparece só quando `PUBLIC_URL` está definido no worker.
- **Ninguém para quem um impedimento iria pode ser alcançado.** Quando nenhuma das pessoas que o Standcast escolheu para um impedimento, como quem revisa, os donos do código ou as pessoas do card, tem vínculo com o Google Chat ou um mapeamento confirmado, o impedimento vai para os gestores do time. Nenhuma falha é registrada para as pessoas escolhidas antes. A exceção é uma conferência de participação que estourou o tempo: aí o impedimento não vai para os gestores, e a entrega para essa pessoa falha com `timeout` e é tentada de novo.
- **A pessoa nunca abriu uma mensagem direta com o app.** O Google Chat só entrega mensagem direta depois que a pessoa falou com o app uma vez numa mensagem direta. Vincular pelo botão ou por uma menção não basta para isso. As entregas para ela falham com `no_dm_space` e não são repetidas. Peça para ela mandar uma mensagem direta para o app.
- **O espaço não está vinculado à sua organização.** O consolidado e as dailies do time falham com `space_not_linked`, e nada é publicado até o espaço ser vinculado. Não há nova tentativa imediata; uma execução seguinte, como a próxima tentativa do consolidado ou o resumo, tenta a mesma entrega de novo enquanto ela tiver menos de 3 tentativas. Vincule o espaço com um código.

## Erros de entrega

Quando uma publicação falha, o app web mostra a falha em "Últimas entregas com falha". O Standcast tenta cada mensagem até 3 vezes no total, com os mesmos limites de tempo do Slack: um consolidado só é tentado de novo até 120 minutos depois do `digest_at`, e um lembrete nunca sai no `digest_at` ou depois dele.

| Código do erro | Significado | Como resolver |
| --- | --- | --- |
| `space_not_linked` | O espaço do time não está vinculado a esta organização. Não há nova tentativa imediata; uma execução seguinte tenta de novo enquanto a entrega tiver menos de 3 tentativas. | Adicione o app ao espaço e vincule com o código. |
| `no_dm_space` | A pessoa ainda não mandou mensagem para o app do Standcast. Não há nova tentativa. | Peça para a pessoa mandar uma mensagem direta para o app. |
| `channel_not_found` | O espaço não existe, ou o `chat.channel` não é um nome `spaces/...` válido. | Confira o `chat.channel`. Copie o nome do card do Google Chat. |
| `not_in_channel` | O app não está no espaço, ou não pode publicar ali. | Adicione o app do Standcast ao espaço. |
| `user_not_found` | O Google Chat não conhece o usuário da pessoa. O Standcast apaga o vínculo guardado. | Peça para a pessoa clicar em **Vincular minha conta** ou mencionar o app no espaço do time de novo, ou corrija `members.<login>.google_chat`. |
| `invalid_auth` | O Google Chat recusou as credenciais do app do Standcast. | Fale com o suporte. |
| `ratelimited` | O Google Chat pediu para o Standcast ir mais devagar. | Nada a fazer; há nova tentativa. |
| `timeout`, `request_failed`, `http_error`, `invalid_response` | O Google Chat não respondeu a tempo, não pôde ser acessado, ou respondeu com erro. | Nada a fazer; há nova tentativa. Fale com o suporte se repetir. |
| `no_chat_connection` | Nenhum espaço está vinculado a esta organização, ou o servidor não tem app do Google Chat. | Vincule um espaço. Se a Configuração diz que o Google Chat não está disponível neste servidor, fale com quem opera o servidor para configurar o Google Chat. |
| `no_chat_identity` | A pessoa, ou o gestor para quem um impedimento foi, não tem vínculo com o Google Chat, ou o usuário em `members.<login>.google_chat` não está em nenhum dos seus espaços vinculados. | Peça para a pessoa clicar em **Vincular minha conta** ou mencionar o app no espaço do time, ou adicione a pessoa a um espaço vinculado. |
| `no_route_target` | Um impedimento não tinha destinatário nenhum, por exemplo porque quem escreveu é o único gestor do time. | Adicione outro gestor ao time. |
| `worker_died` | O worker parou três vezes durante o envio. | Fale com o suporte se repetir. |
| `internal_error` | Erro inesperado. | Fale com o suporte se repetir. |

## Limites que vale conhecer

- As mensagens são texto simples, mais o card **Vincular minha conta** embaixo de um consolidado. Um consolidado com mais de 4.096 caracteres é cortado e termina com "… see Standcast".
- O app só reage quando é adicionado a um espaço ou removido dele, a mensagens diretas, a menções num espaço e ao botão **Vincular minha conta**. Uma mensagem direta só recebe a resposta acima. Uma menção num espaço ou um clique só vincula a pessoa; o app não lê o texto.
- Links para entrar: valem 15 minutos e só funcionam uma vez. Um link novo para a mesma pessoa e organização substitui o anterior ainda não usado.
- O botão precisa que o servidor do Standcast saiba o próprio endereço público: num servidor que você opera, defina `PUBLIC_URL` no worker. Sem ele, o consolidado sai sem o botão.
- Códigos de vínculo: 8 caracteres, valem por 24 horas, uso único. As tentativas de vínculo são limitadas a 10 por minuto.
- O Standcast trata no máximo 120 eventos do Google Chat por espaço por minuto.

O que o app recebe e guarda está em [Privacidade](/pt-BR/privacy#google-chat).
