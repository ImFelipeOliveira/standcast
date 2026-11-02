import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { renderToStaticMarkup } from 'react-dom/server';
import type { OrgContext, Session } from '../api/client';
import { createQueryClient, orgContextQuery } from '../api/queries';
import { applyLang } from '../i18n';
import { createAppRouter } from '../router';
import { OrgSelect } from './OrgSelect';

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
  return { html, router };
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
});
