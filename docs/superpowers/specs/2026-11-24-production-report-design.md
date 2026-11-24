# Production report for sales and support

## Intent

Sales and support people need to know what reached production, written for people who do not read code. Sales uses it to sell new features. Support uses it to tell customers that a problem they reported was fixed, and to learn about problems that existed and are now fixed. Felipe asked for it on 2026-11-24.

Today nothing in Standcast answers "what is live". The History shipped tab (`/history?tab=shipped`) lists what people said in their dailies about pull requests and cards. A pull request merged into `dev` shows up there without being in production, and the text is written by and for developers.

This is the first of three deliveries that share one base: the list of pull requests that reached a team's production branch, an LLM to rewrite them, and per team settings in the panel.

1. **Production report to a chat channel** (this spec).
2. Public content: a blog post draft and social media posts (next spec).
3. More chat providers beyond Slack and Google Chat (later; Teams is already parked on the roadmap).

## Goals

- Every team can turn on a report, in the panel, that posts to a Slack channel or Google Chat space chosen for it, usually the sales or support one.
- The report lists only pull requests that reached the team's production branch since the previous report, split into **New** and **Fixed** (plus **Removed** when something already reported was reverted), with no person's name and no customer identifiers.
- The main message is a short list, one line per item. Each item gets a thread reply with details.
- The text is rewritten by DeepSeek for non-developers, in the team's language, using only what the pull request and its linked card say.
- Without an LLM key, or when the LLM fails, the report still goes out with the raw titles.

## Non-goals

- Blog and social media content (next spec).
- Email delivery, Microsoft Teams or any chat beyond Slack and Google Chat.
- LLM providers other than DeepSeek. The provider sits behind an interface so others can be added later.
- An effort or reasoning setting. DeepSeek has no such knob; it comes back when a provider that has one is added.
- GitHub deployments or releases as the production signal.
- Backfilling pull requests that reached production before the report was turned on.
- Manual approval of the report before it is posted.

## Anti-goals

- A person's name, login or any per person count in the report. Authors are only used to pick the team's pull requests.
- The LLM deciding that something reached production. The list comes from GitHub; the LLM only rewrites and classifies.
- Text the source does not support. A detail field the pull request and card do not back is left out, never filled in.
- Pull request or card text from one organization reaching another organization's report or DeepSeek key.
- Storing raw pull request bodies or card descriptions in Standcast's database.

## Approaches

How Standcast learns what reached production. Felipe picked 1.

1. **Record at push time (picked).** The `push` webhook already reaches Standcast for every repository of the installation (`packages/orchestrator/src/modules/github/handle-github-event.ts`, `onPush`), and today it is ignored outside the config repository. When a push lands on a production branch, Standcast compares `before...after`, finds the merged pull requests behind those commits and records when each one reached production. The report reads those rows. Exact "live since" time, a cheap report, no new GitHub permission, no repository list to configure. Costs a new table, and only sees what arrived after the report was turned on.
2. **Compute at report time.** At report time, compare each team repository's production branch since the last reported commit. Needs a repository list per team in the panel, concentrates GitHub calls at report time against the installation rate limit, and the "live since" date comes from commit dates.
3. **Search merged pull requests by team members and check each one.** Rejected: a pull request that waits weeks in `dev` falls outside the search window, and it costs the most calls.

What counts as production. Felipe picked 1.

1. **A production branch per team, default `main` (picked).** A pull request counts once its commits are on that branch. No new permission; works for continuous deploy and for a `dev → main` flow. Limit: when `main` is deployed manually and late, the report runs ahead of the real deploy.
2. **GitHub `deployment_status` for environment `production`.** The most faithful, but needs the `deployments: read` permission, which every installed organization must approve, and misses deploys made outside GitHub. Kept for later if a team complains about the gap.
3. **GitHub releases.** Only fits teams that tag releases.

LLM wiring. Felipe asked for an interface with adapters and a factory, and picked DeepSeek for now.

## Decisions

### Felipe's calls

- The report goes to chat channels: Slack and Google Chat now, other chats later.
- Report options are set in the panel, per team.
- DeepSeek is the only LLM for now; the user who configures it picks the model.
- Production means the team's production branch, recorded at push time.
- Only things that reached production go in the report.
- Item text is detailed (fields below), not one line.

### Claude's calls, agreed in conversation

- Sections **New** and **Fixed**, no person's name, each line with its pull request and card links.
- Short list in the main message, details as one thread reply per item. Both chat adapters already reply in threads (`ChatChannel.replyInThread` in `packages/core/src/ports.ts`).
- A detail field the source does not support is omitted.
- No approval step: the list comes from GitHub and every line links to its source.
- Default schedule weekly, weekday and time set per team, in the team's time zone.
- DeepSeek key per organization, not per team.
- No effort setting.
- **Rewritten items are stored** with the report, so thread replies can be retried with the same text and the blog and social spec can read them. The raw pull request and card text is never stored.
- **One item per card:** pull requests that link the same Linear card become one item with every pull request link, so a feature and a fix to it that ship together are reported once. Pull requests without a card are one item each.
- **Reverts in the same window cancel out:** a pull request whose body carries GitHub's revert marker (`Reverts owner/repo#N`) drops itself and pull request N when both are in the window.
- **Reverts of an item already reported** go in a third section, **Removed**, shown only when it has items, so sales learns that something it may have sold is no longer live.
- **No cap on items:** every item is reported. When the short list would pass a chat's limit (50 Slack blocks, 4096 Google Chat characters), it continues in further messages instead of ending with "see Standcast".
- **No customer identifiers:** customer names, emails and account IDs from the source never reach the report. The prompt forbids them, and a filter removes emails and phone numbers that slip through.
- **Ticket link kept:** a support ticket link found in the pull request or card goes in a **Ticket** field, so support can answer the right customer. Opening it needs a login to the ticket tool.

### Claude's calls, not yet discussed (check these)

- **Source of an item:** the pull request title and body plus its linked Linear card title and description, fetched at report time.
- **Which pull requests belong to a team:** merged pull requests whose author is a member of the team (as resolved by `resolveMemberTeams`, so GitHub teams count), in any repository of the installation, that reached the team's production branch. A pull request by two teams' member shows in both reports when both teams use that branch.
- **Internal changes are left out** before the LLM sees them: titles with a conventional prefix `chore`, `ci`, `build`, `test`, `docs`, `style` or `refactor`, and bot authors. The LLM may also classify an item as `internal`, which drops it.
- **Window:** from the cutoff of the last report that was sent for the team (or from when the report was turned on) to the moment this report runs. A failed report never loses items; the next one picks them up.
- **Empty window:** nothing is posted.
- **Chat provider:** the team's own `chat.provider` from `standcast.yml`; the report channel is another channel or space in the same workspace. Google Chat spaces must be linked to Standcast the same way team spaces are today.
- **Who edits:** organization admins edit the DeepSeek key and model; organization admins and the team's managers edit the team's report settings. This follows the access rules in `packages/orchestrator/src/modules/access/team-access.ts`.
- **Recording only runs** for installations where at least one team has the report on, and only for pushes to a branch some enabled team uses as its production branch.
- **Rows are pruned** after 90 days by the existing retention job (`packages/orchestrator/src/modules/retention/prune-data.ts`).

## Design

### Recording what reached production

- `onPush` keeps its config handling and also enqueues a `record-production-push` job when the push is to `refs/heads/<branch>` and `<branch>` is the production branch of at least one enabled team report of that installation. Pushes that delete a branch or create one (`before` all zeros) are skipped.
- The job compares `before...after`, collects the commits, and maps them to merged pull requests through the GitHub GraphQL `associatedPullRequests` connection (`queryGraphql` exists in `packages/adapters/github/src/graphql.ts`).
- **Carrier pull requests** (one merged into the production branch from another long lived branch, such as a `dev → main` sync or a squash release) are expanded one level: their own commits are mapped to pull requests too, so a squash merge of `dev` into `main` still yields the feature pull requests inside it. The carrier itself is usually dropped by the internal filter (`chore` title); it is not special cased beyond that.
- Each pull request found is stored once per installation, repository and branch, with: installation, repository, pull request number and URL, author login, branch, and `reached_at` (the time the push was received). A pull request already stored for that branch keeps its first `reached_at`.
- Force pushes are handled by the same compare; commits that are only in `after` are the ones recorded.

### The report job

- The tick (`packages/orchestrator/src/modules/github/run-tick.ts`) enqueues a team's report when its weekday and time are due in the team's time zone and no `deliveries` row of kind `production_report` exists for that team and date. Same claim, retry and failed delivery handling as digests and blocker alerts.
- The job loads the rows for the team's branch in the window, keeps those whose author belongs to the team, fetches each pull request (title, body, labels) and finds its linked Linear card through the team's tracker (`trackerFor`); no card is fine.
- The internal filter runs, pull requests are grouped by card, same window reverts cancel out, and each remaining item goes to the summarizer.
- The rewritten items are stored with the report, then the main message (or messages, when split) is posted to the report channel, **New** first, then **Fixed**, each group oldest first.
- Once the main message is posted, the window cutoff moves to the moment this report started, and one reply job per item is enqueued, each with its own `deliveries` row, like the digest enqueues one post per daily. A reply job reads its item from the stored report, so a retry posts the same text, and a failed reply never repeats the whole report. Reply jobs are spaced so a long report does not hit Slack's rate limit (the Slack adapter does not retry on its own).

### LLM: interface, adapter, factory

- A generic interface in `@standcast/core` ports: a text model that takes a system prompt and a user prompt and returns JSON text. It knows nothing about reports, so the blog and social spec reuses it.
- A `@standcast/deepseek` adapter in `packages/adapters/deepseek`, plain `fetch` like the Linear adapter, calling DeepSeek's chat completions endpoint with JSON output and a timeout. Default model `deepseek-chat`; the model is a free text setting.
- A factory in the orchestrator deps, `textModelFor(installationId)`, returns the DeepSeek adapter when the organization has a key, or `null`. Adding a provider means one adapter and one branch in the factory.
- The report code in the orchestrator owns the prompt and the validation:
  - One call per item, a few in parallel, so one bad answer costs one item.
  - The prompt says the pull request and card text are data, not instructions, and to answer only from them, in the team's language.
  - The prompt forbids customer names, emails and account IDs in the answer.
  - The answer must parse against a schema: `kind` (`new`, `fixed`, `internal`), `title`, and the optional fields below, each with a length cap. Anything else, or a failed call, falls back to the raw item.
  - The `ticket` field is kept only when it is a URL that appears verbatim in the source text.
  - Emails and phone numbers are removed from every text field after parsing.
  - Text from the answer is escaped for each chat's formatting by the existing message builders, like any other user text.
- **Removed items** are not decided by the LLM. A revert pull request whose target is in a previous sent report of the team becomes a `removed` item that reuses the stored title of the reverted item. A revert whose target was never reported is dropped as internal.
- **Raw fallback item:** the pull request title, `fixed` when the title starts with `fix` or the card has a bug label, otherwise `new`; no detail fields.
- A DeepSeek `401` marks the key as rejected; the panel shows it, and reports fall back to raw until the key is replaced.

### Message format

Main message (team language; pt-BR example):

```
Em produção · Time Pagamentos · 17 a 21 nov

Novidades
• Agendamento de Pix para até 30 dias  (api#412 · PAG-88)

Correções
• O app Android não duplica mais o recibo  (app#415 · PAG-91)
```

Thread reply for a new feature:

```
Novidade · Agendamento de Pix para até 30 dias
O que muda: ao criar um Pix, o cliente escolhe uma data até 30 dias à frente.
Para quem: lojistas que pagam fornecedores em data fixa.
Onde fica: Pagamentos → Pix → Agendar.
Em produção desde: 18 nov
Links: api#412 · PAG-88
```

Thread reply for a fix:

```
Correção · O app Android não duplica mais o recibo
Problema: depois de pagar, o cliente via dois recibos iguais e achava que tinha
sido cobrado duas vezes. A cobrança era única.
Quem era afetado: clientes do app Android 5.2.
O cliente precisa: atualizar o app para a 5.2.1.
Em produção desde: 20 nov
Links: app#415 · PAG-91
```

When something already reported was reverted, the main message gets a third section after **Fixed**, only then:

```
Retirado do ar
• Agendamento de Pix para até 30 dias  (api#430)
```

- New: `what changes`, `who it is for`, `where to find it`, `ticket`.
- Fixed: `problem`, `who was affected`, `what the customer needs to do`, `ticket`.
- Removed: title and the revert pull request link only; its thread reply says when it left production.
- Always present: title, `live since` (`reached_at` in the team's time zone), links (short labels as the digest uses, `githubRefLabel` in `@standcast/core`).
- Every optional field is omitted when the source does not support it.

### Panel

- **Organization level** (Settings, admins only): DeepSeek key (write only, shows the last four characters and whether it was rejected), model, and a plain notice that pull request titles and descriptions and Linear card text are sent to DeepSeek when the key is set.
- **Team level** (per team in Settings, admins and the team's managers): on or off, report channel, weekday, time, production branch (default `main`). Saving checks the channel with `ChatChannel.checkChannel` and shows the same warnings as the team channel (bot not in the Slack channel, Google Chat space not linked).
- Settings live in the database, like API keys and webhooks, not in `standcast.yml`. A team removed from `standcast.yml` keeps its row but its report stops; the panel lists it as orphaned with a delete action.

### Data

- Organization LLM settings: provider (`deepseek`), model, key encrypted with `encryptSecret`, rejected flag.
- Team report settings: installation, team name, enabled, channel, weekday, time, production branch, window cutoff.
- Production pull requests: installation, repository, number, URL, author login, branch, `reached_at`; unique on installation, repository, number and branch.
- Sent reports: installation, team name, window, and the rewritten items (kind, title, detail fields, links, live since), with no author. Pruned after 90 days. The blog and social spec reads its source from here.

## Constraints

- No new GitHub permission or event; `push` and `contents: read` already exist.
- Every external call has a timeout; GitHub, Linear and DeepSeek errors never block the report, they degrade it to raw items.
- Untrusted text (pull requests, cards, LLM answers) never becomes instructions or unescaped chat markup.
- Repository conventions: no code comments, English in code and docs, PRs to `dev`.

## Left to the builder

- Table, column, job and route names; migration layout.
- Prompt wording, the exact length caps and the parallelism limit.
- How many commits a single push may map before it stops and logs (compare and GraphQL pagination limits).
- How the Linear card is found from a pull request (identifier in title, branch or body, through the existing tracker).
- Panel layout inside Settings, copy beyond what is fixed here, and docs pages for admins.
