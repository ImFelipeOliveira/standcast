import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { OrgBlockers } from '@standcast/orchestrator';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { renderToStaticMarkup } from 'react-dom/server';
import type { OrgContext, Session } from '../../api/client';
import {
  createQueryClient,
  orgBlockersQuery,
  orgContextQuery,
  teamsSummaryQuery,
} from '../../api/queries';
import { applyLang } from '../../i18n';
import { createAppRouter } from '../../router';
import { withKept } from './BlockersPage';

const originalFetch = globalThis.fetch;

const session: Session = {
  login: 'ana',
  avatarUrl: 'https://github.com/ana.png?size=80',
  csrf: 'csrf-1',
  installations: [{ id: 11, owner: 'acme' }],
};
const context: OrgContext = { admin: false, managerOf: ['backend'], memberOf: ['backend'] };

const blockers: OrgBlockers = {
  open: [
    {
      id: 'b1',
      author: 'bruno',
      text: 'Deploy waits on the database change',
      ref: null,
      openedOn: '2026-10-30',
      ageDays: 3,
      recurring: true,
      routedTo: null,
      hint: null,
      teams: ['backend', 'mobile'],
      canResolve: true,
      timezone: 'America/Sao_Paulo',
      today: '2026-11-02',
    },
    {
      id: 'b2',
      author: 'carla',
      text: 'Waiting on the Partner contract',
      ref: null,
      openedOn: '2026-11-02',
      ageDays: 0,
      recurring: false,
      routedTo: null,
      hint: null,
      teams: ['backend'],
      canResolve: false,
      timezone: 'America/Sao_Paulo',
      today: '2026-11-02',
    },
  ],
  resolved: [
    {
      id: 'b3',
      teams: ['backend'],
      author: 'ana',
      text: 'Cache review pending',
      ref: null,
      resolvedOn: '2026-10-28',
      resolvedBy: 'ana',
      canResolve: true,
    },
  ],
};

async function renderAt(path: string, data: OrgBlockers = blockers) {
  globalThis.fetch = mock(async (input: RequestInfo | URL) =>
    String(input).endsWith('/v1/app/session')
      ? Response.json(session)
      : Response.json({ error: { code: 'not_found', message: 'no' } }, { status: 404 }),
  ) as unknown as typeof fetch;
  const queryClient = createQueryClient();
  queryClient.setQueryData(orgContextQuery(11).queryKey, context);
  queryClient.setQueryData(teamsSummaryQuery(11).queryKey, [
    { team: 'backend', sent: 1, total: 3 },
    { team: 'mobile', sent: 0, total: 2 },
    { team: 'platform', sent: 2, total: 2 },
  ]);
  queryClient.setQueryData(orgBlockersQuery(11, 'backend').queryKey, data);
  queryClient.setQueryData(orgBlockersQuery(11).queryKey, data);
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

describe('blockers page', () => {
  test('lists open blockers oldest first with their teams', async () => {
    const { html } = await renderAt('/orgs/11/blockers');
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('Impedimentos');
    const first = html.indexOf('Deploy waits on the database change');
    const second = html.indexOf('Waiting on the Partner contract');
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(html).toContain('mobile');
    expect(html).not.toContain('Cache review pending');
  });

  test('offers resolve only where the person can resolve', async () => {
    const { html } = await renderAt('/orgs/11/blockers');
    expect(html.match(/Marcar como resolvido/g)).toHaveLength(1);
  });

  test('the resolved tab lists who resolved and when', async () => {
    const { html } = await renderAt('/orgs/11/blockers?state=resolved');
    expect(html).toContain('Cache review pending');
    expect(html).toContain('@ana');
    expect(html).not.toContain('Deploy waits on the database change');
  });

  test('empty lists explain themselves', async () => {
    const { html } = await renderAt('/orgs/11/blockers', { open: [], resolved: [] });
    expect(html).toContain('Nenhum impedimento aberto.');
  });

  test('only the selected tab is the current page', async () => {
    for (const path of ['/orgs/11/blockers', '/orgs/11/blockers?state=resolved']) {
      const { html } = await renderAt(path);
      const tabs = html.slice(
        html.indexOf('aria-label="Estado"'),
        html.indexOf('</nav>', html.indexOf('aria-label="Estado"')),
      );
      expect(tabs.match(/aria-current="page"/g), path).toHaveLength(1);
    }
  });

  test('the team filter lists every readable team even when filtered', async () => {
    const { html } = await renderAt('/orgs/11/blockers?team=backend');
    for (const team of ['backend', 'mobile', 'platform']) {
      expect(html).toContain(`<option value="${team}"`);
    }
  });

  test('resolved blockers can be reopened where allowed', async () => {
    const { html } = await renderAt('/orgs/11/blockers?state=resolved');
    expect(html).toContain('Reabrir');
  });

  test('the sidebar links to the blockers page', async () => {
    const { html } = await renderAt('/orgs/11/blockers');
    expect(html).toContain('href="/orgs/11/blockers"');
  });
});

describe('withKept', () => {
  test('a blocker resolved here stays listed as resolved after the refetch drops it', () => {
    const [first, second] = blockers.open as [
      OrgBlockers['open'][number],
      OrgBlockers['open'][number],
    ];
    const kept = new Map([[first.id, first]]);
    expect(withKept([second], kept).map((entry) => [entry.blocker.id, entry.resolved])).toEqual([
      ['b1', true],
      ['b2', false],
    ]);
    expect(withKept([first, second], new Map()).every((entry) => !entry.resolved)).toBe(true);
  });
});
