# Instalação

Configure o Standcast na sua organização em quatro passos. Você precisa ser dono da organização do GitHub (ou da conta pessoal) para instalar o app.

## 1. Instale o GitHub App

Na [página do GitHub App do Standcast](https://github.com/apps/standcast/installations/new), clique em **Install** e escolha a organização ou a conta pessoal.

Escolha **All repositories**, ou **Only select repositories** incluindo o repositório `.github-private` (recomendado) e o repositório `.github`. O Standcast lê a configuração do `.github-private` quando ele tem o `standcast.yml`, e do `.github` nos outros casos. Se nenhum dos dois existe ainda, você pode criar o `.github-private` no passo 4 e liberá-lo para o app depois.

Mantenha o arquivo em um repositório **privado**: o `.github-private`, ou um `.github` que você tornou privado. Na maioria das organizações o `.github` é público, e o `standcast.yml` cita as pessoas dos seus times. Veja [Onde fica o arquivo](/pt-BR/admin/configuration#onde-fica-o-arquivo).

O app pede estas permissões:

| Permissão | Acesso | Para quê |
| --- | --- | --- |
| Metadata | read | Exigida pelo GitHub para todo app |
| Contents | read | Ler o `standcast.yml` |
| Pull requests | read | Montar o rascunho a partir de pull requests e revisões |
| Checks | write | Criar o check run `Standcast config` no `standcast.yml` |
| Commit statuses | read | Ler os resultados dos checks dos pull requests, para os impedimentos sugeridos |
| Members | read | Resolver times do GitHub (`@org/time`) e conferir participação e papel |
| Email addresses (conta) | read | Ligar cada pessoa ao usuário dela no Slack ou no Google Chat pelo e-mail |

## 2. Abra a página de setup

Depois da instalação, o GitHub leva você para `https://app.standcast.app/setup?installation_id=<id>`. Entre com o GitHub quando pedir. Uma instalação que ainda abre `https://api.standcast.app/setup` é redirecionada para lá, e o `installation_id` é mantido.

Qualquer membro da organização que entrar pode abrir a página de setup. Só admins podem conectar ou reconectar o Slack e o Linear e vincular espaços do Google Chat, e só admins veem as seções **API keys** e **Webhooks**. Admin é quem é admin da organização no GitHub, ou o dono da conta, numa conta pessoal.

A página é uma lista de etapas. Um selo no topo conta as etapas, por exemplo **2 de 3 etapas concluídas**, e fica verde quando todas estão concluídas. Cada etapa tem um ícone de estado (um visto quando concluída, o número dela enquanto pendente, um x quando requer atenção) e um selo:

- **GitHub App**: instalado na sua organização, com um aviso quando o Standcast perdeu o acesso ao repositório de configuração;
- **Slack**: **Conectar Slack**, ou **Reconectar Slack** depois de conectado, para admins;
- **Linear**: **Conectar o Linear**, ou **Reconectar o Linear** depois de conectado, para admins. Só conta como etapa quando algum time usa o Linear, e aí vem antes do arquivo standcast.yml. Nos outros casos, mostra **Opcional** e vem depois do arquivo standcast.yml;
- **Google Chat**: os espaços vinculados e, para admins, um campo **Código de vínculo** com **Vincular espaço**. Mostra **Opcional** até um espaço ser vinculado, e **Indisponível** quando o servidor não tem app do Google Chat. Vem por último. O selo do topo conta o Slack e o Google Chat como uma etapa só de chat, concluída quando o Slack está conectado ou um espaço está vinculado;
- **Arquivo standcast.yml**: o estado do arquivo e o repositório de onde ele vem. Quando ele não existe, um botão para criá-lo a partir de um modelo, e o próprio modelo. Quando existe, **Editar no GitHub**, mesmo com o arquivo inválido. Um arquivo válido mostra também um cartão por time, com o canal e os horários, e um inválido, uma tabela com os erros. Quando o arquivo está em um repositório público e tem overrides de identidade em `members`, um aviso pede para movê-lo para o `.github-private` ou remover os overrides.

A coluna lateral mostra as últimas entregas com falha e, para admins, as API keys e os webhooks, e depois o endereço de suporte.

## 3. Conecte o Slack ou o Google Chat

Cada time publica no Slack ou no Google Chat, conforme o `standcast.yml`. Conecte os que os seus times usam.

**Slack.** Um admin clica em **Conectar Slack** e aprova o app no workspace do Slack. A etapa do Slack passa a mostrar um visto, o selo **Conectado** e "Conectado a" com o nome do workspace, e um botão **Reconectar Slack** para conectar de novo. Os outros membros veem a conexão só para leitura. Enquanto o Slack ainda não está conectado, eles veem "Só um admin pode conectar ou reconectar o Slack." Veja [Slack](/pt-BR/admin/slack) para as permissões e os canais privados.

**Google Chat.** Adicione o app do Standcast ao espaço do Google Chat; ele publica um código de vínculo. Um admin cola o código na etapa **Google Chat**, ou no card do Google Chat do [app web](/pt-BR/admin/web-app), e clica em **Vincular espaço**. Depois, cada pessoa manda uma mensagem direta para o app uma vez, para vincular o usuário dela no Google Chat. Veja [Google Chat](/pt-BR/admin/google-chat).

## 4. Crie o `standcast.yml`

Na etapa **Arquivo standcast.yml**, clique em **Criar standcast.yml com o modelo**. O GitHub abre o editor na branch padrão do repositório `.github-private`, ou do `.github` quando só ele existe, com o arquivo já preenchido. O modelo tem um time no Slack e um no Google Chat, e usa o seu login como gestor e membro:

```text
teams:
  - name: Time Slack
    language: pt-BR
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [seu-login]
    members: [seu-login]
    chat:
      provider: slack
      channel: "#daily"
  - name: Time Google Chat
    language: pt-BR
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [seu-login]
    members: [seu-login]
    chat:
      provider: google-chat
      channel: spaces/AAAAAAAAAAA
```

Apague o time do chat que você não usa. Troque o nome do time, o fuso, os horários, as pessoas e o canal e faça o commit. No Google Chat, o canal é o nome do espaço que aparece no card do Google Chat. O arquivo tem que ficar na **raiz** do repositório, na branch padrão. Se nem o `.github-private` nem o `.github` existirem, a página mostra **Criar o repositório .github-private**, que abre o formulário de novo repositório do GitHub com a sua organização como dona, o nome preenchido e a visibilidade privada. Se o GitHub App só tem acesso a repositórios selecionados, a página também avisa e mostra **Escolher repositórios no GitHub**: depois de criar o repositório, adicione-o ao app ali, ou o Standcast não vai encontrá-lo.

O modelo lista o seu login. Para um time maior, prefira um time do GitHub (`members: ["@org/team-slug"]`), para o arquivo não listar logins, e deixe de fora o mapa `members` do nível de cima: as pessoas são vinculadas pelo e-mail verificado da conta do GitHub quando rodam `standcast login`, e no Google Chat por uma mensagem direta para o app. Os overrides em `members.<login>` são só para exceções, e são rejeitados em repositório público. Veja [Mapeamento de identidades](/pt-BR/admin/configuration#mapeamento-de-identidades).

Referência completa: [standcast.yml](/pt-BR/admin/configuration).

O Standcast recarrega o arquivo a cada push na branch padrão do `.github-private` ou do `.github`, e quando os repositórios da instalação mudam. Atualize a página de setup para ver o novo estado. Quando o arquivo existe, a etapa mostra **Editar no GitHub**, que abre o `standcast.yml` no GitHub, mesmo com o arquivo inválido.

## 5. Conecte o Linear (opcional)

Pule este passo se os seus times não usam o Linear. Um admin clica em **Conectar o Linear** na etapa do Linear da página de setup e aprova o app no workspace do Linear. A etapa passa a mostrar `Conectado ao workspace <workspace>.` e um botão **Reconectar o Linear**.

- A conexão é só leitura (escopo `read`) e o app age como ele mesmo, não como o admin. Há um workspace do Linear por instalação. Os tokens são criptografados e renovados automaticamente.
- Só um admin pode conectar ou reconectar o Linear. Enquanto o Linear não está conectado, ou parou de funcionar, os outros membros veem "Só um admin pode conectar ou reconectar o Linear."
- Se o acesso ao Linear for revogado, a etapa mostra o selo **Requer atenção**, "O Linear parou de funcionar", `A conexão com o workspace <workspace> parou de funcionar. Reconecte o Linear.` e **Reconectar o Linear**. Até lá, os recursos do Linear pausam em silêncio: os rascunhos ficam sem cards, os impedimentos de card vão para os gestores e as sugestões de card ficam como estão.
- Reconectar um workspace diferente apaga as ligações com o Linear da instalação. As pessoas são ligadas de novo quando entram e sempre que o `standcast.yml` muda.
- A página avisa "Este time usa o Linear, mas o Linear ainda não está conectado a esta instalação." quando um time tem `tracker.provider: linear` e o Linear não está conectado. Para `tracker.provider: jira`, mostra "A integração com o Jira ainda não está disponível."

Depois, defina o tracker de cada time no `standcast.yml`. Veja [`tracker`](/pt-BR/admin/configuration#tracker) e [Mapeamento de identidades](/pt-BR/admin/configuration#mapeamento-de-identidades). O que o Standcast lê está em [Privacidade](/pt-BR/privacy#linear).

## Estados da configuração

A etapa **Arquivo standcast.yml** mostra um de três estados.

### Configurado

O selo **Configurado**. O Standcast está funcionando: as pessoas podem enviar dailies e os consolidados saem.

### Não configurado

O selo **Pendente** e "Ainda não configurado." O Standcast não encontrou o arquivo nem no `.github-private` nem no `.github`. Apagar o arquivo, ou apagar o repositório que o tem, desliga o Standcast para a organização: a configuração anterior é descartada, então um arquivo inválido depois não a traz de volta. Se o outro repositório também tem um `standcast.yml`, o Standcast passa a ler esse. A página mostra o motivo:

| Motivo | Significado | Como resolver |
| --- | --- | --- |
| `no_repo` | Nem o repositório `.github-private` nem o `.github` existem. | Crie o `.github-private`, adicione o `standcast.yml` e confira se o app tem acesso a ele. |
| `no_file` | O `standcast.yml` não está na raiz do `.github-private` nem do `.github`, na branch padrão. | Crie o arquivo lá. Um arquivo numa subpasta ou em outra branch não é lido. |
| `no_access` | O Standcast não tem acesso ao repositório de configuração, e ainda não havia configuração. | Nas configurações da instalação do app no GitHub, adicione o `.github-private` e o `.github` aos repositórios selecionados, ou escolha todos os repositórios. |

`no_access` é um aviso quando já há uma configuração em uso. O GitHub pode negar o acesso por um momento, por exemplo por limite de requisições, ou porque o repositório saiu dos repositórios selecionados. Quando o `.github-private` nega o acesso, o Standcast não cai para o `.github`, para nunca trocar de arquivo por acidente. O Standcast então mantém a configuração e o estado atuais, e a página de setup mostra "O Standcast não tem acesso ao repositório de configuração. O Standcast continua usando a configuração atual." junto de qualquer estado. O aviso some na próxima leitura bem-sucedida do `standcast.yml`, válida ou inválida. Dê de novo ao app acesso ao repositório para limpar o aviso.

### Inválido

O selo **Requer atenção** e "O standcast.yml é inválido. Corrija os erros abaixo e faça o commit." A página lista os erros numa tabela com as colunas **Caminho** e **Erro**, por exemplo o caminho `teams.0.digest_at` com o erro `must be HH:MM (24h)`. Use **Editar no GitHub** para abrir o arquivo e corrigi-lo. Veja os [erros comuns](/pt-BR/admin/configuration#erros-de-validacao-comuns).

Se o arquivo estava válido logo antes do push inválido, a página também diz "O Standcast continua usando a última versão válida até você corrigir." O consolidado sai e o rascunho e o envio continuam funcionando, com a última versão válida. Corrija o arquivo e faça o commit para aplicar as suas mudanças. Se não há uma versão válida em uso (o arquivo nunca foi válido, ou foi apagado antes do push inválido), o Standcast não roda para a organização: nenhum consolidado é publicado, e o rascunho e o envio falham com `org_not_configured`.

Quando um push em qualquer branch do repositório `.github-private` ou `.github` altera o `standcast.yml`, e nos pull requests desses repositórios que o alteram, o Standcast cria o check run `Standcast config` nesse repositório, com sucesso ou falha. Na falha há uma anotação por erro, na linha dele, e o resumo lista todos os erros. Um arquivo válido em repositório público também falha quando o mapa `members` do nível de cima tem overrides de identidade: o check tem o título "standcast.yml expõe dados pessoais", com uma anotação na chave `members`. O mesmo arquivo em repositório privado passa, e esse check nunca muda a configuração em uso. Se o arquivo não existe, não há check. Qualquer push na branch padrão recarrega a configuração, inclusive force push.

## Próximos passos

- Peça a cada membro para seguir o guia [Escreva sua primeira daily](/pt-BR/members/getting-started). As pessoas são ligadas ao usuário do Slack quando entram, então elas devem entrar depois que o Slack estiver conectado.
- No Google Chat, peça a cada membro para entrar e depois mandar uma mensagem direta para o app do Standcast uma vez.
- Se você usa o Linear, peça a cada membro para entrar depois que o Linear estiver conectado, para o usuário dele no Linear ser ligado.
- Crie [API keys](/pt-BR/admin/api-keys) ou [webhooks](/pt-BR/admin/webhooks) se outros sistemas precisarem dos dados.
