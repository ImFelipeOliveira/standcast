import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { TeamToday } from '@standcast/orchestrator';
import { QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApiError, apiUrl, forgetSession, type Session } from '../../api/client';
import { createQueryClient, sessionQuery, teamTodayQuery } from '../../api/queries';
import { applyLang, translate } from '../../i18n';
import { errorMessage } from '../configuracao/labels';
import { Dailies } from './DailyCard';
import { keyed } from './format';
import { HojePage, listBlockers, withPending } from './HojePage';
import { NeedsYou } from './NeedsYou';
import { refLabel } from './refLabel';

const originalFetch = globalThis.fetch;

const session: Session = {
  login: 'carla',
  avatarUrl: 'https://github.com/carla.png?size=80',
  csrf: 'csrf-1',
  installations: [{ id: 11, owner: 'acme' }],
};

function fixture(overrides: Partial<TeamToday> = {}): TeamToday {
  return {
    team: {
      name: 'backend',
      timezone: 'America/Sao_Paulo',
      remindAt: '09:00',
      digestAt: '10:00',
    },
    date: '2026-11-03',
    digest: { status: 'scheduled', sentAt: null, everSent: true },
    chat: { provider: 'slack', url: null },
    canRemind: true,
    canResolve: true,
    people: [
      {
        login: 'ana',
        status: 'sent',
        submittedAt: '2026-11-03T12:12:00.000Z',
        daily: {
          yesterday: [
            {
              text: 'Novo visual do Partner',
              ref: { kind: 'pull_request', url: 'https://github.com/acme/partner/pull/7188' },
            },
          ],
          today: [
            {
              text: 'Dashboard do dono',
              ref: { kind: 'card', url: 'https://linear.app/acme/issue/par-223/dashboard' },
            },
          ],
          blockers: [],
          support: [],
        },
      },
      {
        login: 'guilherme',
        status: 'sent',
        submittedAt: '2026-11-03T12:05:00.000Z',
        daily: {
          yesterday: [],
          today: [{ text: 'Unidade sem entrega' }],
          blockers: [{ text: 'Deploy da API travado' }],
          support: [
            {
              text: 'Revisão do Next 15 no site',
              ref: { kind: 'pull_request', url: 'https://github.com/acme/cliente-web/pull/2914' },
            },
          ],
        },
      },
      { login: 'diego', status: 'missing', submittedAt: null, daily: null },
    ],
    blockers: [
      {
        id: 'b-1',
        author: 'guilherme',
        text: 'Deploy da API travado',
        ref: { kind: 'pull_request', url: 'https://github.com/acme/api/pull/8379' },
        openedOn: '2026-10-31',
        ageDays: 3,
        recurring: true,
        routedTo: { logins: ['bruno'], reason: 'pull_request' },
        hint: null,
      },
      {
        id: 'b-2',
        author: 'carla',
        text: 'Esperando o contrato do webhook',
        ref: { kind: 'pull_request', url: 'https://github.com/acme/partner/pull/7191' },
        openedOn: '2026-11-03',
        ageDays: 0,
        recurring: false,
        routedTo: null,
        hint: { kind: 'pr_merged', at: '2026-11-03T14:40:00Z', on: '2026-11-03' },
      },
    ],
    support: [
      {
        author: 'guilherme',
        text: 'Revisão do Next 15 no site',
        ref: { kind: 'pull_request', url: 'https://github.com/acme/cliente-web/pull/2914' },
        since: '2026-10-26',
      },
    ],
    shipped: [
      {
        author: 'ana',
        text: 'Novo visual do Partner',
        ref: { kind: 'pull_request', url: 'https://github.com/acme/partner/pull/7188' },
      },
    ],
    ...overrides,
  };
}

function renderPage(today: TeamToday, login = 'carla'): string {
  const queryClient = createQueryClient();
  queryClient.setQueryData(sessionQuery.queryKey, { ...session, login });
  queryClient.setQueryData(teamTodayQuery(11, today.team.name).queryKey, today);
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <HojePage installationId={11} team={today.team.name} />
    </QueryClientProvider>,
  );
}

function blockerCard(html: string, text: string): string {
  return (
    html
      .split('<article')
      .slice(1)
      .find((card) => card.includes(text)) ?? ''
  );
}

beforeEach(() => {
  applyLang('pt-BR');
  forgetSession();
  globalThis.fetch = mock(async () =>
    Response.json({ error: { code: 'unexpected', message: 'no' } }, { status: 500 }),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('hoje', () => {
  test('renders blockers with age and hint', () => {
    const html = renderPage(fixture());
    expect(html).toContain('Precisa de você');
    expect(html).toContain('backend · America/Sao_Paulo');
    expect(html).toContain('Terça-feira, 3 de novembro');
    expect(html).toContain('Dailies de hoje');
    expect(html).toContain('de 3');
    expect(html).toContain('1 travado há mais de 2 dias');
    const stuck = blockerCard(html, 'Deploy da API travado');
    expect(stuck).toContain('Impedimento');
    expect(stuck).toContain('Travado há 3 dias');
    expect(stuck).toContain('Recorrente');
    expect(stuck).toContain('>api#8379<');
    expect(stuck).toContain('href="https://github.com/acme/api/pull/8379"');
    expect(stuck).toContain('Encaminhado para @bruno · revisor do PR');
    expect(stuck).toContain('@guilherme');
    expect(stuck).toContain('Ver daily');
    expect(stuck).toContain('Marcar como resolvido');
    const fresh = blockerCard(html, 'Esperando o contrato do webhook');
    expect(fresh).toContain('Desde hoje');
    expect(fresh).toContain('Provavelmente resolvido: PR mergeado às 11:40');
    expect(fresh).not.toContain('Recorrente');
    expect(fresh).not.toContain('Ver daily');
  });

  test('a response without the chat field still renders', () => {
    const { chat: _chat, ...older } = fixture();
    expect(renderPage(older as TeamToday)).toContain('Precisa de você');
  });

  test('the chat button names the provider and shows only with a link', () => {
    expect(renderPage(fixture())).not.toContain('Abrir no Slack');
    const slack = renderPage(
      fixture({
        chat: { provider: 'slack', url: 'https://slack.com/app_redirect?team=T1&channel=C1' },
      }),
    );
    expect(slack).toContain('Abrir no Slack');
    expect(slack).toContain('href="https://slack.com/app_redirect?team=T1&amp;channel=C1"');
    const google = renderPage(
      fixture({ chat: { provider: 'google-chat', url: 'https://chat.google.com/room/A/B' } }),
    );
    expect(google).toContain('Abrir no Google Chat');
  });

  test('support cards render', () => {
    const html = renderPage(fixture());
    const card = blockerCard(html, 'Pedido de apoio');
    expect(card).toContain('Revisão do Next 15 no site');
    expect(card).toContain('Pedido desde 26/10');
    expect(card).toContain('>cliente-web#2914<');
    expect(card).toContain('@guilherme');
    expect(card).not.toContain('Marcar como resolvido');
    expect(html).toContain('Pedidos de apoio');
  });

  test('filter shows only missing', () => {
    const today = fixture();
    const html = renderToStaticMarkup(
      <Dailies
        today={today}
        filter="missing"
        onFilter={() => {}}
        reminders={{}}
        onRemind={() => {}}
        onView={() => {}}
      />,
    );
    expect(html).toContain('@diego');
    expect(html).toContain('Ainda não enviou a daily de hoje.');
    expect(html).not.toContain('@ana');
    expect(html).not.toContain('@guilherme');
    expect(html).toMatch(/aria-pressed="true"[^>]*>Faltam</);
    const all = renderToStaticMarkup(
      <Dailies
        today={today}
        filter="all"
        onFilter={() => {}}
        reminders={{}}
        onRemind={() => {}}
        onView={() => {}}
      />,
    );
    expect(all).toContain('@ana');
    expect(all).toContain('@diego');
    expect(all).toContain('>PAR-223<');
    const sent = renderToStaticMarkup(
      <Dailies
        today={today}
        filter="sent"
        onFilter={() => {}}
        reminders={{}}
        onRemind={() => {}}
        onView={() => {}}
      />,
    );
    expect(sent).toContain('@ana');
    expect(sent).not.toContain('@diego');
  });

  test('a reopened blocker stays listed until the refetch brings it back', () => {
    const [stuck, fresh] = fixture().blockers;
    if (!stuck || !fresh) throw new Error('fixture');
    const afterResolve = listBlockers([fresh], { [stuck.id]: stuck }, {});
    expect(afterResolve.open.map((b) => b.id)).toEqual([fresh.id]);
    expect(afterResolve.listed).toEqual([
      { blocker: stuck, resolved: true },
      { blocker: fresh, resolved: false },
    ]);
    const beforeRefetch = listBlockers([fresh], {}, { [stuck.id]: stuck });
    expect(beforeRefetch.open.map((b) => b.id).sort()).toEqual([stuck.id, fresh.id].sort());
    expect(beforeRefetch.listed).toEqual([
      { blocker: stuck, resolved: false },
      { blocker: fresh, resolved: false },
    ]);
    const afterRefetch = listBlockers([stuck, fresh], {}, { [stuck.id]: stuck });
    expect(afterRefetch.listed.map((item) => item.blocker.id)).toEqual([stuck.id, fresh.id]);
  });

  test('two concurrent resolves keep both buttons disabled until each settles', async () => {
    const today = fixture();
    let pending: ReadonlySet<string> = new Set();
    const setPending = (update: (current: ReadonlySet<string>) => ReadonlySet<string>) => {
      pending = update(pending);
    };
    const gates = new Map<string, () => void>();
    const start = (id: string) =>
      withPending(setPending, id, () => new Promise<void>((done) => gates.set(id, done)));
    const disabled = () => {
      const html = renderToStaticMarkup(
        <NeedsYou
          today={today}
          blockers={today.blockers.map((blocker) => ({ blocker, resolved: false }))}
          canResolve={() => true}
          pendingIds={pending}
          problem={null}
          onResolve={() => {}}
          onReopen={() => {}}
          onView={() => {}}
          hasDaily={() => true}
        />,
      );
      return today.blockers.map((b) => /<button[^>]* disabled=""/.test(blockerCard(html, b.text)));
    };
    const first = start('b-1');
    const second = start('b-2');
    expect(disabled()).toEqual([true, true]);
    gates.get('b-2')?.();
    await second;
    expect(disabled()).toEqual([true, false]);
    gates.get('b-1')?.();
    await first;
    expect(disabled()).toEqual([false, false]);
  });

  test('a failed action still clears only its own pending id', async () => {
    let pending: ReadonlySet<string> = new Set(['other']);
    const setPending = (update: (current: ReadonlySet<string>) => ReadonlySet<string>) => {
      pending = update(pending);
    };
    await expect(
      withPending(setPending, 'b-1', () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
    expect([...pending]).toEqual(['other']);
  });

  test('keys stay unique for repeated items', () => {
    const items = [{ text: 'a' }, { text: 'a' }, { text: 'b' }];
    expect(keyed(items, (item) => item.text).map((entry) => entry.key)).toEqual(['a', 'a#1', 'b']);
  });

  test('the remind result region is always present', () => {
    const today = fixture();
    const render = (reminders: Record<string, 'queued'>) =>
      renderToStaticMarkup(
        <Dailies
          today={today}
          filter="missing"
          onFilter={() => {}}
          reminders={reminders}
          onRemind={() => {}}
          onView={() => {}}
        />,
      );
    expect(render({})).toMatch(/<span role="status"[^>]*><\/span>/);
    expect(render({ diego: 'queued' })).toMatch(
      /<span role="status"[^>]*>Lembrete pedido\.<\/span>/,
    );
  });

  test('a hint from an earlier day shows its date', () => {
    const base = fixture();
    const html = renderPage(
      fixture({
        blockers: base.blockers.map((b) =>
          b.id === 'b-1'
            ? { ...b, hint: { kind: 'pr_merged', at: '2026-11-02T14:40:00Z', on: '2026-11-02' } }
            : b,
        ),
      }),
    );
    expect(blockerCard(html, 'Deploy da API travado')).toContain(
      'Provavelmente resolvido: PR mergeado em 02/11 às 11:40',
    );
    expect(blockerCard(html, 'Esperando o contrato do webhook')).toContain(
      'Provavelmente resolvido: PR mergeado às 11:40',
    );
  });

  test('remind button hidden when canRemind is false', () => {
    expect(renderPage(fixture())).toContain('Lembrar agora');
    expect(renderPage(fixture({ canRemind: false }))).not.toContain('Lembrar agora');
  });

  test('resolve button hidden for plain members', () => {
    const html = renderPage(fixture({ canResolve: false, canRemind: false }), 'ana');
    expect(html).not.toContain('Marcar como resolvido');
    const own = renderPage(fixture({ canResolve: false, canRemind: false }), 'carla');
    expect(blockerCard(own, 'Esperando o contrato do webhook')).toContain('Marcar como resolvido');
    expect(blockerCard(own, 'Deploy da API travado')).not.toContain('Marcar como resolvido');
  });

  test('no history of who did not send', async () => {
    const html = renderPage(fixture());
    expect(html).toContain('Quem já enviou hoje');
    expect(html).toContain('@diego · falta');
    expect(html).toContain('Só de hoje. O app não mostra histórico de quem não enviou.');
    const urls: string[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return Response.json(fixture());
    }) as unknown as typeof fetch;
    await createQueryClient().fetchQuery(teamTodayQuery(11, 'back end'));
    expect(urls).toEqual([`${apiUrl}/v1/app/orgs/11/teams/back%20end/today`]);
  });

  test('refLabel forms', () => {
    expect(refLabel({ kind: 'pull_request', url: 'https://github.com/acme/api/pull/123' })).toBe(
      'api#123',
    );
    expect(refLabel({ kind: 'issue', url: 'https://github.com/acme/api/issues/9#c1' })).toBe(
      'api#9',
    );
    expect(
      refLabel({
        kind: 'commit',
        url: 'https://github.com/acme/api/commit/abc1234def5678abc1234def5678abc1234def56',
      }),
    ).toBe('api@abc1234');
    expect(refLabel({ kind: 'card', url: 'https://linear.app/acme/issue/fel-12/title' })).toBe(
      'FEL-12',
    );
    expect(refLabel({ kind: 'card', url: 'https://example.com/x', title: 'Card X' })).toBe(
      'Card X',
    );
    expect(refLabel({ kind: 'card', url: 'https://example.com/x' })).toBe('https://example.com/x');
  });

  test('errors stay in one language', () => {
    const t = (key: Parameters<typeof translate>[1]) => translate('pt-BR', key);
    const message = errorMessage(t, new ApiError(422, 'invalid_request', 'invalid request'));
    expect(message).not.toContain('invalid request');
    expect(message).toBe(translate('pt-BR', 'error.invalidRequest'));
  });
});
