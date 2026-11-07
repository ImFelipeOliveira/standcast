# Integrações

O que o Standcast conecta hoje, e o que ainda vem. Um tracker acrescenta os seus cards ao rascunho. Um chat é onde chegam o consolidado do time, os lembretes e as mensagens diretas. Cada time escolhe o próprio chat no `standcast.yml`.

## Disponível agora

### GitHub

A origem do rascunho: pull requests abertos, mergeados e revisados, e commits, desde a sua última daily. Uma organização instala o Standcast como um [GitHub App](/pt-BR/admin/install). O Standcast também lê o `standcast.yml`, a participação em times e o CODEOWNERS. Ele nunca lê arquivos de código.

### Linear

Tracker opcional. Um admin conecta um workspace do Linear na página de setup, só leitura. Os seus cards que começaram ou terminaram aparecem no rascunho. Um impedimento ligado a um card vai para quem é dono do card que bloqueia, depois para o responsável pelo card, para quem o criou ou para os gestores do time. Um card parado em andamento pode virar uma sugestão que só você vê. Veja [Instalar](/pt-BR/admin/install#_5-conecte-o-linear-opcional).

### Slack

Um consolidado por time no canal definido no `standcast.yml`, dailies atrasadas na thread desse consolidado, um lembrete por dia e mensagens diretas para impedimentos encaminhados. Veja [Slack](/pt-BR/admin/slack).

### Google Chat

As mesmas entregas num espaço do Google Chat, pelo app do Standcast. Uma organização pode usar o Slack num time e o Google Chat em outro. Veja [Google Chat](/pt-BR/admin/google-chat).

## Em breve

Ainda não estão conectados. O Standcast não lê nada deles.

| Nome | Papel | Notas |
| --- | --- | --- |
| Jira | Tracker | `tracker.provider: jira` já é aceito no `standcast.yml`. A página de setup avisa que a integração ainda não está disponível, e mais nada acontece. |
| ClickUp | Tracker | O mesmo papel do Linear: cards no rascunho e impedimentos de card. |
| Asana | Tracker | O mesmo papel do Linear. |
| GitHub Projects | Tracker | O mesmo papel do Linear. |
| Microsoft Teams | Chat | O mesmo papel do Slack: consolidado, thread, lembrete e mensagens diretas. |
| Discord | Chat | O mesmo papel do Slack. |

Nada é lido de um serviço antes de ele existir. A lista pode crescer: um tracker ou um chat novo é mais um adaptador, e o rascunho, a confirmação e o consolidado continuam os mesmos.
