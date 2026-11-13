import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { TeamDigest, TeamHistory, TeamShipped } from '@standcast/orchestrator';
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

async function renderAt(path: string, prepare?: (client: QueryClient) => Promise<void>) {
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
  await prepare?.(queryClient);
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

  test('without a team it keeps the requested tab and filters', async () => {
    const { router } = await renderAt(
      '/orgs/11/history?tab=search&q=webhook&from=2026-10-01&to=2026-10-20',
    );
    expect(router.state.location.search).toMatchObject({
      team: 'backend',
      tab: 'search',
      q: 'webhook',
      from: '2026-10-01',
      to: '2026-10-20',
    });
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

  test('digests load the requested range and keep it in the day links', async () => {
    const september: TeamHistory = {
      team: 'backend',
      provider: 'slack',
      days: [
        {
          date: '2026-09-04',
          status: 'sent',
          sentAt: null,
          dailies: 3,
          blockers: 0,
          chatUrl: null,
        },
        {
          date: '2026-09-03',
          status: 'sent',
          sentAt: null,
          dailies: 2,
          blockers: 0,
          chatUrl: null,
        },
      ],
    };
    const { html } = await renderAt(
      '/orgs/11/history?team=backend&from=2026-09-01&to=2026-09-07&date=2026-09-03',
      async (client) => {
        client.setQueryData(
          teamHistoryQuery(11, 'backend', '2026-09-01', '2026-09-07').queryKey,
          september,
        );
        client.setQueryData(teamDigestQuery(11, 'backend', '2026-09-03').queryKey, {
          ...digest,
          date: '2026-09-03',
          blockers: [{ author: 'alice', text: 'September blocker', ref: null }],
        });
      },
    );
    expect(html).toContain('September blocker');
    expect(html).toContain('from=2026-09-01');
    expect(html).toContain('to=2026-09-07');
  });

  test('a requested day outside the listed days still opens that day', async () => {
    const { html } = await renderAt(
      '/orgs/11/history?team=backend&date=2026-08-10',
      async (client) => {
        client.setQueryData(teamDigestQuery(11, 'backend', '2026-08-10').queryKey, {
          ...digest,
          date: '2026-08-10',
          blockers: [{ author: 'alice', text: 'August blocker', ref: null }],
        });
      },
    );
    expect(html).toContain('August blocker');
    expect(html).not.toContain('Waiting on the Partner contract');
  });

  test('search shows matches with their section', async () => {
    const { html } = await renderAt('/orgs/11/history?team=backend&tab=search&q=partner');
    expect(html).toContain('Waiting on the Partner contract');
    expect(html).toContain('Impedimento');
    expect(html).toContain('name="q"');
    expect(html).toContain('name="from"');
    expect(html).toContain('name="to"');
  });

  test('a rejected shipped range keeps the range form to fix it', async () => {
    const { html } = await renderAt(
      '/orgs/11/history?team=backend&tab=shipped&from=2026-10-28&to=2026-10-01',
      (client) => {
        client.setQueryDefaults(['org'], { retryOnMount: false });
        return client.prefetchQuery(teamShippedQuery(11, 'backend', '2026-10-28', '2026-10-01'));
      },
    );
    expect(html).toContain('Não foi possível');
    expect(html).toContain('name="from"');
    expect(html).toContain('value="2026-10-28"');
    expect(html).toContain('name="to"');
    expect(html).toContain('value="2026-10-01"');
  });

  test('shipped offers copy and exports', async () => {
    const { html } = await renderAt('/orgs/11/history?team=backend&tab=shipped');
    expect(html).toContain('Cache for opening hours');
    expect(html).toContain('Copiar como markdown');
    expect(html).toContain('Exportar Markdown');
    expect(html).toContain('Exportar CSV');
    expect(html).toContain('name="from"');
    expect(html).toContain('name="to"');
  });
});
