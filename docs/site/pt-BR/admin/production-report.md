# Relatório de produção

O relatório de produção conta para vendas e suporte o que chegou à produção, em linguagem simples. O Standcast publica o relatório num canal do Slack ou num espaço do Google Chat escolhido para cada time, em geral o de vendas ou o de suporte. Ele lista novidades e correções, sem nome de ninguém.

O texto é reescrito pelo DeepSeek para quem não lê código. Para isso você precisa de uma chave do DeepSeek. Sem ela, o relatório sai do mesmo jeito, com os títulos originais dos pull requests.

## O que conta como produção

Cada time tem uma branch de produção, `main` por padrão. Quando um push chega a essa branch, o Standcast registra os pull requests por trás dele e o momento em que o push chegou ao Standcast. Esse momento é a data de **Em produção desde** do relatório.

- Só entram os pushes que chegarem depois de você ligar o relatório. Nada de antes é reportado.
- Um pull request mergeado na `dev` não aparece no relatório até chegar à branch de produção.
- Cada relatório cobre o período desde o relatório anterior até 60 segundos antes da execução, para não perder um push que ainda está sendo registrado.
- Só entram pull requests de membros do time. Times do GitHub contam.
- Reverts feitos por pessoas de fora do time, como quem está de plantão, também contam: o item do time que eles revertem sai do relatório, ou vai para **Retirado do ar** quando já foi reportado. Os outros pull requests dessas pessoas não entram.
- Quando nada novo chegou à produção, nada é publicado.
- Um relatório que falha não perde itens: o próximo recolhe tudo.

## 1. Configure a chave do DeepSeek

Um admin da organização faz isso uma vez. No [app web](/pt-BR/admin/web-app), abra **Configuração → Reports** (`/orgs/<id>/settings/reports`).

1. Crie uma chave de API na sua conta do DeepSeek.
2. Cole a chave no campo e escolha o modelo. O padrão é `deepseek-chat`.
3. Salve.

A chave é só de escrita. O painel mostra os últimos quatro caracteres. Se o DeepSeek rejeitar a chave com um 401, o painel avisa e os relatórios usam os títulos originais até você trocá-la. Só um 401 marca a chave como rejeitada; outros erros do DeepSeek só fazem os itens afetados saírem com o título original.

Com a chave configurada, o Standcast envia ao DeepSeek o título e a descrição de cada pull request e o título e a descrição do card do Linear ligado a ele. O corpo original dos pull requests e a descrição dos cards nunca são guardados. Os itens reescritos ficam guardados por 90 dias.

## 2. Configure o relatório de um time

Admins da organização e gerentes do time configuram o relatório de cada time na mesma aba.

| Opção | O que faz |
| --- | --- |
| Ligado ou desligado | Liga o relatório do time. |
| Canal | O canal do Slack ou espaço do Google Chat que recebe o relatório. Usa o `chat.provider` do time no `standcast.yml`. |
| Dia da semana | O dia em que o relatório é publicado. |
| Horário | A hora do dia, no fuso do time. |
| Branch de produção | A branch que significa "em produção". Padrão `main`. |

Ao salvar, o Standcast confere o canal e avisa quando não consegue publicar nele:

- Slack: adicione o bot do Standcast ao canal.
- Google Chat: o espaço precisa estar vinculado à sua organização. Veja [Google Chat](/pt-BR/admin/google-chat).

Um time removido do `standcast.yml` mantém as configurações, mas o relatório dele para.

## Como o relatório fica

A mensagem principal é uma lista curta, uma linha por item, com links para o pull request e o card. Cada item também recebe uma resposta na thread com os detalhes. O texto sai no idioma do time.

| Seção | Conteúdo |
| --- | --- |
| Novidades | O que muda, para quem é, onde fica e um link de chamado. |
| Correções | O problema, quem era afetado, o que o cliente precisa fazer e um link de chamado. |
| Retirado do ar | Aparece só quando algo já reportado foi revertido. Lista o item, a data de **Fora do ar desde** e o pull request do revert. |

Todo item tem título, a data de **Em produção desde** e os links. Um detalhe fica de fora quando o pull request e o card não o dizem.

- Pull requests que ligam ao mesmo card do Linear viram um item só.
- O revert de algo já reportado vai em **Retirado do ar**.
- Uma funcionalidade e o revert dela no mesmo relatório somem os dois.
- O link de **Chamado** só é mantido quando é uma URL http(s) que aparece no texto do pull request ou do card e não é um dos links do item. Ele é mantido inteiro, então um número de chamado longo não é cortado.
- Um relatório longo continua em mais mensagens.

## O que fica de fora

- Mudanças internas: títulos que começam com `chore`, `ci`, `build`, `test`, `docs`, `style` ou `refactor`, pull requests de bots e itens que o modelo classifica como internos.
- Identificadores de clientes. O modelo é instruído a não incluir nomes de clientes, nomes de pessoas, usernames nem IDs de conta. O Standcast também remove do texto e-mails, sequências de 8 ou mais dígitos com separadores (telefones, números de conta; datas ISO são mantidas) e @menções. Os links de chamado são mantidos inteiros: um link de chamado fica de fora quando tem e-mail, usuário ou senha, ou dados de contato na query ou no fragmento.
- Nome ou login de qualquer pessoa, e qualquer contagem por pessoa.

## Se o DeepSeek falhar

Cada item é reescrito separadamente. Se uma resposta falha, ou não há chave, aquele item sai com o título original do pull request, sem detalhes. Ele entra em **Correções** quando um título começa com `fix`, `fixes`, `fixed`, `hotfix` ou `bugfix`, ou quando o pull request ou o card tem o label `bug`, e em **Novidades** nos outros casos. O relatório nunca fica bloqueado.

## Dica: uma seção "Para o cliente"

Adicione ao template de pull request uma seção, por exemplo "Para o cliente", em que o autor diz em uma ou duas frases o que muda para o cliente. O modelo trabalha só com o que o pull request e o card dizem, então o relatório melhora quando esse texto existe.
