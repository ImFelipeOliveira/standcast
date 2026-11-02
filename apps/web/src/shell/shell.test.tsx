import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { renderToStaticMarkup } from 'react-dom/server';
import type { OrgContext, Session } from '../api/client';
import { apiUrl } from '../api/client';
import { createQueryClient, orgContextQuery, sessionQuery } from '../api/queries';
import { applyLang } from '../i18n';
import { SignInStuck } from '../pages/RouteStates';
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

function stubFetch(body: Session): void {
  globalThis.fetch = mock(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/v1/app/session')) return Response.json(body);
    if (url.endsWith('/context')) return Response.json(context);
    return Response.json({ error: { code: 'not_found', message: 'no' } }, { status: 404 });
  }) as unknown as typeof fetch;
}

async function renderAt(path: string, body: Session = session) {
  stubFetch(body);
  return renderWithCurrentFetch(path);
}

async function renderWithCurrentFetch(path: string) {
  const queryClient = createQueryClient();
  queryClient.setQueryData(orgContextQuery(11).queryKey, context);
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
    const { html } = await renderAt('/orgs/11/historico');
    const links = navLinks(html);
    expect(links).toHaveLength(3);
    const current = links.filter((link) => link.includes('aria-current="page"'));
    expect(current).toHaveLength(1);
    expect(current[0]).toContain('href="/orgs/11/historico"');
    expect(html).toContain('Histórico');
    expect(html).toContain('em breve');
    expect(html).toContain('gestor · backend');
  });

  test('sidebar links keep the current org', async () => {
    const { html } = await renderAt('/orgs/11/hoje');
    const hrefs = navLinks(html).map((link) => link.match(/href="([^"]+)"/)?.[1]);
    expect(hrefs).toEqual(['/orgs/11/hoje', '/orgs/11/historico', '/orgs/11/configuracao']);
  });

  test('no installations', async () => {
    const { html } = await renderAt('/', { ...session, installations: [] });
    expect(html).toContain('href="https://github.com/apps/standcast/installations/new"');
    expect(html).toContain('Instale o Standcast na sua organização');
    expect(html).not.toContain('<nav');
  });

  test('index redirects to the first installation', async () => {
    const { router } = await renderAt('/');
    expect(router.state.location.pathname).toBe('/orgs/11/configuracao');
  });

  test('setup redirects to the installation from the query string', async () => {
    const { router } = await renderAt('/setup?installation_id=12');
    expect(router.state.location.pathname).toBe('/orgs/12/configuracao');
  });

  test('setup without an id goes home', async () => {
    const { router } = await renderAt('/setup');
    expect(router.state.location.pathname).toBe('/orgs/11/configuracao');
  });

  test('unknown installation goes home', async () => {
    const { router } = await renderAt('/orgs/99/hoje');
    expect(router.state.location.pathname).toBe('/orgs/11/configuracao');
  });

  test('invalid installation id goes home', async () => {
    const { router } = await renderAt('/orgs/abc/hoje');
    expect(router.state.location.pathname).toBe('/orgs/11/configuracao');
  });

  test('org without a section opens configuração', async () => {
    const { router } = await renderAt('/orgs/12');
    expect(router.state.location.pathname).toBe('/orgs/12/configuracao');
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

  test('signed-out page makes no api calls', async () => {
    const fetchMock = mock(async () => Response.json(session));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { html, router } = await renderWithCurrentFetch('/signed-out');
    expect(router.state.location.pathname).toBe('/signed-out');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(html).toContain('Você saiu do Standcast.');
    expect(html).toContain(
      `href="${apiUrl}/auth/github/login?target=app&amp;next=${encodeURIComponent('/')}"`,
    );
    expect(html).toContain('Entrar de novo');
  });

  test('sign out goes to the signed-out page', async () => {
    const { router, queryClient } = await renderAt('/orgs/11/hoje');
    const calls: string[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${String(input)}`);
      if (String(input).endsWith('/v1/app/logout')) return new Response(null, { status: 204 });
      return Response.json(session);
    }) as unknown as typeof fetch;
    const ok = await signOut({
      queryClient,
      goToSignedOut: () => {
        void router.navigate({ to: '/signed-out', replace: true });
      },
    });
    expect(ok).toBe(true);
    for (let i = 0; i < 50 && router.state.location.pathname !== '/signed-out'; i++) {
      await Bun.sleep(10);
    }
    expect(calls).toContain(`POST ${apiUrl}/v1/app/logout`);
    expect(router.state.location.pathname).toBe('/signed-out');
    expect(queryClient.getQueryData(sessionQuery.queryKey)).toBeUndefined();
  });

  test('logout failure shows an error', async () => {
    const { router, queryClient } = await renderAt('/orgs/11/hoje');
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
    expect(router.state.location.pathname).toBe('/orgs/11/hoje');
    expect(queryClient.getQueryData(sessionQuery.queryKey)).toEqual(session);
    const html = renderToStaticMarkup(<SignOutError />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Não foi possível sair agora.');
  });
  test('logout with an expired session goes to the signed-out page without signing in', async () => {
    const { router, queryClient } = await renderAt('/orgs/11/hoje');
    const assigned: string[] = [];
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          pathname: '/orgs/11/hoje',
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
          void router.navigate({ to: '/signed-out', replace: true });
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

  test('sign-in that did not stick explains and offers to try again', () => {
    const html = renderToStaticMarkup(<SignInStuck />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('O login não se manteve');
    expect(html).toContain('Tentar de novo');
  });
});
