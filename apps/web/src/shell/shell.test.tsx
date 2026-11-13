import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { TeamToday } from '@standcast/orchestrator';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { renderToStaticMarkup } from 'react-dom/server';
import type { OrgContext, Session } from '../api/client';
import { apiUrl } from '../api/client';
import {
  createQueryClient,
  orgContextQuery,
  sessionQuery,
  teamsSummaryQuery,
  teamTodayQuery,
} from '../api/queries';
import { applyLang } from '../i18n';
import { SummaryTiles } from '../pages/hoje/SummaryTiles';
import { createAppRouter } from '../router';
import { OrgSelect } from './OrgSelect';
import { signOut } from './sign-out';
import { SignOutError } from './UserMenu';

const originalFetch = globalThis.fetch;

const session: Session = {
  login: 'ana',
  avatarUrl: 'https://github.com/ana.png?size=80',
  csrf: 'csrf-1',
  installations: [
    { id: 11, owner: 'acme' },
    { id: 12, owner: 'Beta-Labs' },
    { id: 13, owner: 'zeta' },
  ],
};

const context: OrgContext = { admin: false, managerOf: ['backend'], memberOf: ['backend'] };
const backendToday: TeamToday = {
  team: { name: 'backend', timezone: 'UTC', remindAt: '09:00', digestAt: '10:00' },
  date: '2026-11-03',
  digest: { status: 'scheduled', sentAt: null },
  chat: { provider: 'slack', url: null },
  canRemind: false,
  canResolve: false,
  people: [
    { login: 'ana', status: 'sent', submittedAt: '2026-11-03T09:00:00.000Z', daily: null },
    { login: 'bruno', status: 'missing', submittedAt: null, daily: null },
  ],
  blockers: [],
  support: [],
  shipped: [],
};
const noTeams: OrgContext = { admin: true, managerOf: [], memberOf: [] };

function stubFetch(body: Session, orgContext: OrgContext = context): void {
  globalThis.fetch = mock(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/v1/app/session')) return Response.json(body);
    if (url.endsWith('/context')) return Response.json(orgContext);
    return Response.json({ error: { code: 'not_found', message: 'no' } }, { status: 404 });
  }) as unknown as typeof fetch;
}

async function renderAt(path: string, body: Session = session, orgContext: OrgContext = context) {
  stubFetch(body, orgContext);
  return renderWithCurrentFetch(path, orgContext);
}

async function renderWithCurrentFetch(path: string, orgContext: OrgContext = context) {
  const queryClient = createQueryClient();
  queryClient.setQueryData(orgContextQuery(11).queryKey, orgContext);
  queryClient.setQueryData(teamTodayQuery(11, 'backend').queryKey, backendToday);
  queryClient.setQueryData(teamsSummaryQuery(11).queryKey, [
    { team: 'backend', sent: 2, total: 3 },
  ]);
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
  return { html, router, queryClient };
}

function navLinks(html: string): string[] {
  const nav = html.slice(html.indexOf('<nav'), html.indexOf('</nav>'));
  return nav.match(/<a [^>]*>/g) ?? [];
}

beforeEach(() => applyLang('pt-BR'));

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('shell', () => {
  test('sidebar marks the active section', async () => {
    const { html } = await renderAt('/orgs/11/history');
    const links = navLinks(html);
    expect(links).toHaveLength(4);
    const current = links.filter((link) => link.includes('aria-current="page"'));
    expect(current).toHaveLength(1);
    expect(current[0]).toContain('href="/orgs/11/history"');
    expect(html).toContain('Histórico');
    expect(html).toContain('gestor · backend');
  });

  test('sidebar links keep the current org', async () => {
    const { html } = await renderAt('/orgs/11/today');
    const hrefs = navLinks(html).map((link) => link.match(/href="([^"]+)"/)?.[1]);
    expect(hrefs).toEqual([
      '/orgs/11/today',
      '/orgs/11/blockers',
      '/orgs/11/history',
      '/orgs/11/settings',
    ]);
  });

  test('old Portuguese URLs redirect and keep the query', async () => {
    const today = await renderAt('/orgs/11/hoje?team=backend');
    expect(today.router.state.location.href).toBe('/orgs/11/today?team=backend');
    const settings = await renderAt('/orgs/11/configuracao?connected=slack');
    expect(settings.router.state.location.href).toBe('/orgs/11/settings?connected=slack');
    const history = await renderAt('/orgs/11/historico');
    expect(history.router.state.location.pathname).toBe('/orgs/11/history');
  });

  test('today and settings render a single sticky page heading', async () => {
    for (const path of ['/orgs/11/today?team=backend', '/orgs/11/history']) {
      const { html } = await renderAt(path);
      expect(html.match(/<h1/g), path).toHaveLength(1);
      expect(html, path).toContain('data-scrolled="false"');
    }
  });

  test('phones get a menu button that controls the sidebar drawer', async () => {
    const { html } = await renderAt('/orgs/11/today?team=backend');
    const button = html.match(/<button[^>]*aria-controls="app-sidebar"[^>]*>/)?.[0] ?? '';
    expect(button).toContain('aria-expanded="false"');
    expect(button).toContain('desk:hidden');
    expect(button).toContain('aria-label="Abrir menu"');
    const aside = html.match(/<aside[^>]*id="app-sidebar"[^>]*>/)?.[0] ?? '';
    expect(aside).toContain('hidden');
    expect(aside).toContain('desk:flex');
  });

  test('loading and error states inside an org still offer the menu on phones', async () => {
    const { html } = await renderAt('/orgs/11/today?team=nope');
    expect(html).toContain('aria-controls="app-sidebar"');
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  test('the blockers tile keeps its card shape', () => {
    const html = renderToStaticMarkup(
      <SummaryTiles
        today={{
          ...backendToday,
          blockers: [
            {
              id: 'b1',
              author: 'bruno',
              text: 'waiting',
              ref: null,
              openedOn: '2026-10-30',
              ageDays: 4,
              recurring: true,
              routedTo: null,
              hint: null,
            },
          ],
        }}
      />,
    );
    expect(html).not.toContain('bg-warn-soft');
  });

  test('no installations', async () => {
    const { html } = await renderAt('/', { ...session, installations: [] });
    expect(html).toContain('href="https://github.com/apps/standcast/installations/new"');
    expect(html).toContain('Instale o Standcast na sua organização');
    expect(html).not.toContain('<nav');
  });

  test('index lands on hoje for the first team the person reads', async () => {
    const { router } = await renderAt('/');
    expect(router.state.location.pathname).toBe('/orgs/11/today');
    expect(router.state.location.search).toEqual({ team: 'backend' });
  });

  test('index lands on configuração when the person reads no team', async () => {
    const { router } = await renderAt('/', session, noTeams);
    expect(router.state.location.pathname).toBe('/orgs/11/settings');
  });

  test('sidebar switches teams with today sent and total', async () => {
    const { html } = await renderAt('/orgs/11/today?team=backend');
    const nav = html.slice(html.indexOf('<nav'), html.indexOf('</nav>'));
    const hojeLink = nav.slice(nav.indexOf('href="/orgs/11/today"'), nav.indexOf('</a>'));
    expect(hojeLink).toContain('Hoje');
    expect(hojeLink).not.toContain('em breve');
    expect(html).toContain('href="/orgs/11/today?team=backend"');
    expect(html).toContain('2/3');
    const teamLink = html.match(/<a [^>]*href="\/orgs\/11\/today\?team=backend"[^>]*>/)?.[0];
    expect(teamLink).toContain('aria-current="page"');
  });

  test('sidebar outside hoje lists teams without today counts', async () => {
    const { html } = await renderAt('/orgs/11/history');
    expect(html).toContain('href="/orgs/11/today?team=backend"');
    expect(html).not.toContain('2/3');
  });

  test('sidebar counts come from one summary request', async () => {
    const urls: string[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return Response.json([]);
    }) as unknown as typeof fetch;
    await createQueryClient().fetchQuery(teamsSummaryQuery(11));
    expect(urls).toEqual([`${apiUrl}/v1/app/orgs/11/teams/summary`]);
  });

  test('setup redirects to the installation from the query string', async () => {
    const { router } = await renderAt('/setup?installation_id=12');
    expect(router.state.location.pathname).toBe('/orgs/12/settings');
  });

  test('setup without an id goes home', async () => {
    const { router } = await renderAt('/setup');
    expect(router.state.location.pathname).toBe('/orgs/11/today');
  });

  test('unknown installation goes home', async () => {
    const { router } = await renderAt('/orgs/99/today');
    expect(router.state.location.pathname).toBe('/orgs/11/today');
  });

  test('invalid installation id goes home', async () => {
    const { router } = await renderAt('/orgs/abc/today');
    expect(router.state.location.pathname).toBe('/orgs/11/today');
  });

  test('org without a section opens hoje for the first team', async () => {
    const { router } = await renderAt('/orgs/12');
    expect(router.state.location.pathname).toBe('/orgs/12/today');
    expect(router.state.location.search).toEqual({ team: 'backend' });
  });

  test('org without a section opens configuração without teams', async () => {
    const { router } = await renderAt('/orgs/12', session, noTeams);
    expect(router.state.location.pathname).toBe('/orgs/12/settings');
  });

  test('org select lists installations by owner', () => {
    const html = renderToStaticMarkup(
      <OrgSelect installations={session.installations} current={12} onChange={() => {}} />,
    );
    const options = [...html.matchAll(/<option value="(\d+)"[^>]*>([^<]+)<\/option>/g)].map(
      (match) => [match[1], match[2]],
    );
    expect(options).toEqual([
      ['11', 'acme'],
      ['12', 'Beta-Labs'],
      ['13', 'zeta'],
    ]);
    expect(html).toMatch(/<option value="12" selected="">Beta-Labs<\/option>/);
    expect(html).toContain('Organização');
  });

  test('sign out goes to the sign-in page with the signed-out notice', async () => {
    const { router, queryClient } = await renderAt('/orgs/11/today');
    const calls: string[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${String(input)}`);
      if (String(input).endsWith('/v1/app/logout')) return new Response(null, { status: 204 });
      return Response.json(
        { error: { code: 'unauthorized', message: 'sign in' } },
        { status: 401 },
      );
    }) as unknown as typeof fetch;
    const ok = await signOut({
      queryClient,
      goToSignedOut: () => {
        void router.navigate({ to: '/sign-in', search: { signed_out: 1 }, replace: true });
      },
    });
    expect(ok).toBe(true);
    for (let i = 0; i < 50 && router.state.location.pathname !== '/sign-in'; i++) {
      await Bun.sleep(10);
    }
    expect(calls).toContain(`POST ${apiUrl}/v1/app/logout`);
    expect(router.state.location.href).toBe('/sign-in?signed_out=1');
    expect(queryClient.getQueryData(sessionQuery.queryKey)).toBeUndefined();
  });

  test('logout failure shows an error', async () => {
    const { router, queryClient } = await renderAt('/orgs/11/today');
    globalThis.fetch = mock(async (input: RequestInfo | URL) =>
      String(input).endsWith('/v1/app/logout')
        ? Response.json({ error: { code: 'internal', message: 'boom' } }, { status: 500 })
        : Response.json(session),
    ) as unknown as typeof fetch;
    let navigated = false;
    const ok = await signOut({
      queryClient,
      goToSignedOut: () => {
        navigated = true;
      },
    });
    expect(ok).toBe(false);
    expect(navigated).toBe(false);
    expect(router.state.location.pathname).toBe('/orgs/11/today');
    expect(queryClient.getQueryData(sessionQuery.queryKey)).toEqual(session);
    const html = renderToStaticMarkup(<SignOutError />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Não foi possível sair agora.');
  });
  test('logout with an expired session goes to the sign-in page without redirecting to GitHub', async () => {
    const { router, queryClient } = await renderAt('/orgs/11/today');
    const assigned: string[] = [];
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          pathname: '/orgs/11/today',
          search: '',
          assign: (url: string) => assigned.push(url),
        },
      },
    });
    globalThis.fetch = mock(async () =>
      Response.json({ error: { code: 'unauthorized', message: 'sign in' } }, { status: 401 }),
    ) as unknown as typeof fetch;
    let navigated = false;
    try {
      const ok = await signOut({
        queryClient,
        goToSignedOut: () => {
          navigated = true;
          void router.navigate({ to: '/sign-in', search: { signed_out: 1 }, replace: true });
        },
      });
      expect(ok).toBe(true);
    } finally {
      if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
      else Reflect.deleteProperty(globalThis, 'window');
    }
    expect(navigated).toBe(true);
    expect(assigned).toEqual([]);
    expect(queryClient.getQueryData(sessionQuery.queryKey)).toBeUndefined();
  });
});
