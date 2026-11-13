import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { TeamDigest, TeamHistory, TeamShipped } from '@standcast/orchestrator';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { renderToStaticMarkup } from 'react-dom/server';
import type { OrgContext, Session } from '../../api/client';
import {
  createQueryClient,
  orgContextQuery,
  teamDigestQuery,
  teamHistoryQuery,
  teamSearchQuery,
  teamShippedQuery,
  teamsSummaryQuery,
} from '../../api/queries';
import { applyLang } from '../../i18n';
import { createAppRouter } from '../../router';

const originalFetch = globalThis.fetch;

const session: Session = {
  login: 'ana',
  avatarUrl: 'https://github.com/ana.png?size=80',
  csrf: 'csrf-1',
  installations: [{ id: 11, owner: 'acme' }],
};
const context: OrgContext = { admin: false, managerOf: [], memberOf: ['backend'] };

const history: TeamHistory = {
  team: 'backend',
  provider: 'slack',
  days: [
    {
      date: '2026-10-27',
      status: 'sent',
      sentAt: '2026-10-27T13:00:00.000Z',
      dailies: 2,
      blockers: 1,
      chatUrl: 'https://slack.com/app_redirect?team=T1&channel=C1',
    },
    { date: '2026-10-26', status: 'failed', sentAt: null, dailies: 1, blockers: 0, chatUrl: null },
  ],
};

const digest: TeamDigest = {
  date: '2026-10-27',
  status: 'sent',
  sentAt: '2026-10-27T13:00:00.000Z',
  provider: 'slack',
  chatUrl: 'https://slack.com/app_redirect?team=T1&channel=C1',
  blockers: [{ author: 'alice', text: 'Waiting on the Partner contract', ref: null }],
  shipped: [
    {
      author: 'alice',
      text: 'Cache for opening hours',
      ref: { kind: 'pull_request', url: 'https://github.com/acme/api/pull/8366' },
    },
  ],
  today: [{ author: 'bob', items: [{ text: 'Batch invoices', ref: null }] }],
};

const shipped: TeamShipped = {
  from: '2026-10-21',
  to: '2026-10-27',
  days: [{ date: '2026-10-27', items: digest.shipped }],
};

async function renderAt(path: string) {
  globalThis.fetch = mock(async (input: RequestInfo | URL) =>
    String(input).endsWith('/v1/app/session')
      ? Response.json(session)
      : Response.json({ error: { code: 'not_found', message: 'no' } }, { status: 404 }),
  ) as unknown as typeof fetch;
  const queryClient = createQueryClient();
  queryClient.setQueryData(orgContextQuery(11).queryKey, context);
  queryClient.setQueryData(teamsSummaryQuery(11).queryKey, [
    { team: 'backend', sent: 1, total: 2 },
  ]);
  queryClient.setQueryData(teamHistoryQuery(11, 'backend').queryKey, history);
  queryClient.setQueryData(teamDigestQuery(11, 'backend', '2026-10-27').queryKey, digest);
  queryClient.setQueryData(teamSearchQuery(11, 'backend', 'partner').queryKey, {
    results: [
      {
        date: '2026-10-27',
        section: 'blockers',
        author: 'alice',
        text: 'Waiting on the Partner contract',
        ref: null,
      },
    ],
  });
  queryClient.setQueryData(teamShippedQuery(11, 'backend').queryKey, shipped);
  const router = createAppRouter(queryClient, {
    history: createMemoryHistory({ initialEntries: [path] }),
    isServer: false,
    origin: 'http://localhost',
    scrollRestoration: false,
  });
  await router.load();
  const html = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { html, router };
}

beforeEach(() => applyLang('pt-BR'));
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('history page', () => {
  test('without a team it opens the first team the person reads', async () => {
    const { router } = await renderAt('/orgs/11/history');
    expect(router.state.location.search).toMatchObject({ team: 'backend' });
  });

  test('lists past days and shows the latest digest with the chat link', async () => {
    const { html } = await renderAt('/orgs/11/history?team=backend');
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('Waiting on the Partner contract');
    expect(html).toContain('Cache for opening hours');
    expect(html).toContain('Batch invoices');
    expect(html).toContain('Abrir no Slack');
    expect(html).toContain('href="https://slack.com/app_redirect?team=T1&amp;channel=C1"');
    expect(html).not.toContain('Não enviaram');
    expect(html).not.toContain('em breve');
  });

  test('search shows matches with their section', async () => {
    const { html } = await renderAt('/orgs/11/history?team=backend&tab=search&q=partner');
    expect(html).toContain('Waiting on the Partner contract');
    expect(html).toContain('Impedimento');
    expect(html).toContain('name="q"');
  });

  test('shipped offers copy and exports', async () => {
    const { html } = await renderAt('/orgs/11/history?team=backend&tab=shipped');
    expect(html).toContain('Cache for opening hours');
    expect(html).toContain('Copiar como markdown');
    expect(html).toContain('Exportar Markdown');
    expect(html).toContain('Exportar CSV');
  });
});
