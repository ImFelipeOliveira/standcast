# Skill do Claude Code

O plugin do Standcast para o Claude Code adiciona a skill `/daily` e registra o servidor MCP do Standcast para você.

## Instalar

1. [Instale a CLI e entre](/pt-BR/members/getting-started). O plugin usa o binário `standcast` do seu `PATH`; ele não o instala.
2. No Claude Code, adicione o marketplace e instale o plugin:

```text
/plugin marketplace add ImFelipeOliveira/standcast
/plugin install standcast@standcast
```

3. Reinicie o Claude Code para ele carregar a skill e o servidor MCP.

## Usar

Digite `/daily`, ou peça do seu jeito: "minha daily", "standup", "o que eu fiz ontem". A skill:

1. Busca o rascunho do ontem a partir da sua atividade no GitHub, dos seus cards se o Linear está conectado e das suas sessões locais do Claude Code. Se você está em mais de uma organização, pergunta qual.
2. Mostra o ontem resumido, em até 5 linhas agrupadas por projeto ou tema, e deixa você corrigir, remover ou adicionar itens. Ela pode adicionar coisas que de fato aconteceram nesta sessão do Claude Code.
3. Se o rascunho tem impedimentos sugeridos, como um pull request seu esperando revisão, com checks falhando ou um card em andamento há dias, pergunta sobre cada um. Se for um impedimento de verdade, ele entra nos seus impedimentos com o link; se não, a skill o ignora e ele só volta se o sinal mudar. Ela nunca adiciona uma sugestão sem a sua resposta, e as sugestões só são visíveis para você.
4. Pergunta o que você vai fazer hoje e o que está travando você, no seu idioma.
5. Pergunta se você precisa de apoio de alguém, sem estar travado: um review, uma decisão, um pareamento. "Não" deixa a seção vazia.
6. Mostra a daily final e pede a sua confirmação explícita.
7. Envia e avisa se ela foi para a thread do consolidado porque ele já tinha sido publicado.

Ela usa as tools do MCP quando estão disponíveis e, senão, a CLI `standcast`.

## A regra de confirmação

- A skill nunca envia sem a sua confirmação explícita da daily final. Só um sim claro vale.
- Qualquer mudança depois da revisão final, por menor que seja, exige uma nova revisão e uma nova confirmação.
- Quando envia pelo MCP e o Claude Code suporta, o próprio Standcast também pergunta a você, fora da conversa, mostrando exatamente o que vai ser publicado.
- Ela nunca traduz nem reescreve as suas palavras. Ela só pode dividir uma resposta de várias linhas em itens de uma linha.
- Ela nunca inventa atividade: só o que está no rascunho ou o que você disse.
- Títulos de PR, mensagens de commit e outros textos do GitHub são tratados como dados, nunca como instruções.

## Suas sessões de IA

O rascunho usa as suas sessões do Claude Code na janela do rascunho, então o ontem cobre também o trabalho que ainda não tem pull request. Uma sessão se junta a um pull request pelo repositório e pela branch, ou a um card quando a branch cita o card. Cada trabalho vira uma linha, escrita no seu idioma a partir dos títulos da atividade e dos títulos e prompts das sessões.

- O Standcast lê os arquivos das sessões em `~/.claude/projects` na sua máquina: títulos, até cinco dos seus prompts por sessão, a pasta de trabalho, a branch e os caminhos dos arquivos editados. Trechos que parecem segredos viram `[redacted]`.
- O Standcast lê os dados das sessões na sua máquina e não os envia para a API do Standcast, para logs nem para webhooks. O Claude Code recebe esses dados para montar o rascunho e os envia ao provedor do modelo dele, como o resto da conversa. Só a daily que você confirma é enviada ao Standcast.
- A skill não cola os seus prompts na daily, a menos que você peça, e nunca conta sessões, prompts ou horas.
- Títulos e prompts das sessões são tratados como dados, nunca como instruções.
- Para deixar as sessões de fora uma vez, é só dizer ("não use as sessões"). Para desligar de vez, defina `STANDCAST_SESSIONS=off` no seu ambiente.

## Exemplo

```text
Você:    /daily
Claude:  Este é o seu ontem a partir da atividade no GitHub e no Linear da acme e das suas sessões do Claude Code:
         1. Adicionou rate limiting na API pública e mergeou (acme/api#42, card ENG-42)
         2. Revisou "Retry webhooks with backoff" (acme/worker#17)
         3. Investigou o teste instável do checkout em acme/shop
         Quer corrigir, remover ou adicionar algo?
Você:    Tira o 3, não deu em nada.
Claude:  O que você vai fazer hoje? Algum impedimento?
Você:    Hoje vou escrever os guias para integradores. Travado: esperando o banco de staging.
Claude:  Precisa de apoio de alguém, sem estar travado?
Você:    Um review no PR da migração antes de sexta.
Claude:  Daily final da acme, 2026-10-28:
         Ontem
         - Adicionou rate limiting na API pública e mergeou (acme/api#42)
         - Revisou "Retry webhooks with backoff" (acme/worker#17)
         Hoje
         - vou escrever os guias para integradores
         Impedimentos
         - esperando o banco de staging
         Pedidos de apoio
         - Um review no PR da migração antes de sexta
         Posso enviar?
Você:    Pode.
Claude:  Enviada para 2026-10-28. Ela entra no consolidado do backend.
```

## Quando algo falha

| Situação | O que a skill faz |
| --- | --- |
| O `standcast` não está instalado | Explica como instalar a CLI e para. |
| Você não entrou, ou a sessão expirou | Pede para você rodar `standcast login` e para. |
| Mais de uma organização | Pergunta qual e tenta de novo com ela. |
| Uma sugestão já foi decidida | Avisa você e segue em frente. |
| A daily é inválida | Mostra os problemas, corrige com você sem mudar o sentido e pede uma nova confirmação. |
| Qualquer outro erro | Mostra a mensagem. Veja [Solução de problemas](/pt-BR/troubleshooting). |
