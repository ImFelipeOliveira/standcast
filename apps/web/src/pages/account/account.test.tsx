import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { renderToStaticMarkup } from 'react-dom/server';
import type { OrgContext, Session } from '../../api/client';
import { apiUrl } from '../../api/client';
import { createQueryClient, orgContextQuery, sessionQuery } from '../../api/queries';
import { applyLang } from '../../i18n';
import { createAppRouter } from '../../router';
import { sectionOf } from '../../shell/sections';
import { signOut } from '../../shell/sign-out';

const originalFetch = globalThis.fetch;

const session: Session = {
  login: 'ana',
  avatarUrl: 'https://github.com/ana.png?size=80',
  csrf: 'csrf-1',
  installations: [
    { id: 11, owner: 'acme' },
    { id: 12, owner: 'beta' },
  ],
};

const contexts: Record<number, OrgContext> = {
  11: { admin: false, managerOf: ['backend'], memberOf: ['backend'] },
  12: { admin: true, managerOf: [], memberOf: [] },
};

async function renderAt(path: string, body: Session = session) {
  globalThis.fetch = mock(async (input: RequestInfo | URL) =>
    String(input).endsWith('/v1/app/session')
      ? Response.json(body)
      : Response.json({ error: { code: 'not_found', message: 'no' } }, { status: 404 }),
  ) as unknown as typeof fetch;
  const queryClient = createQueryClient();
  for (const [id, context] of Object.entries(contexts)) {
    queryClient.setQueryData(orgContextQuery(Number(id)).queryKey, context);
  }
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

function radios(html: string): string[] {
  return html.match(/<input[^>]*type="radio"[^>]*>/g) ?? [];
}

beforeEach(() => applyLang('pt-BR'));
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('account page', () => {
  test('renders inside the shell with one sticky heading and no current nav item', async () => {
    const { html } = await renderAt('/orgs/11/account');
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>Conta<\/h1>/);
    expect(html).toContain('id="app-sidebar"');
    const nav = html.slice(html.indexOf('<nav'), html.indexOf('</nav>'));
    expect(nav).not.toContain('aria-current="page"');
  });

  test('profile shows the GitHub avatar, login, role per org and a link to edit on GitHub', async () => {
    const { html } = await renderAt('/orgs/11/account');
    expect(html).toContain('src="https://github.com/ana.png?size=80"');
    expect(html).toContain('@ana');
    expect(html).toContain('href="https://github.com/settings/profile"');
    expect(html).toContain('Editar no GitHub');
    expect(html).toContain('acme');
    expect(html).toContain('gestor · backend');
    expect(html).toContain('beta');
    expect(html).toMatch(/beta<\/[^>]+>(<[^>]+>)*admin/);
  });

  test('language and theme are radio groups that follow the browser by default', async () => {
    const { html } = await renderAt('/orgs/11/account');
    const all = radios(html);
    expect(all).toHaveLength(6);
    expect(html).toContain('Português');
    expect(html).toContain('English');
    expect(html).toContain('Seguir o navegador');
    expect(html).toContain('Claro');
    expect(html).toContain('Escuro');
    expect(html).toContain('Sistema');
    const checked = all.filter((input) => input.includes('checked'));
    expect(checked).toHaveLength(2);
    expect(checked.some((input) => input.includes('value="browser"'))).toBe(true);
    expect(checked.some((input) => input.includes('value="system"'))).toBe(true);
    expect(html.match(/<fieldset/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('<legend');
  });

  test('sessions explain that the CLI and plugin stay connected', async () => {
    const { html } = await renderAt('/orgs/11/account');
    expect(html).toContain('Sair de todas as sessões do painel');
    expect(html).toContain('A CLI e o plugin continuam conectados');
  });

  test('/account opens the first org account page', async () => {
    const { router } = await renderAt('/account');
    expect(router.state.location.pathname).toBe('/orgs/11/account');
  });

  test('/account without orgs renders the page without the shell', async () => {
    const { html, router } = await renderAt('/account', { ...session, installations: [] });
    expect(router.state.location.pathname).toBe('/account');
    expect(html).toMatch(/<h1[^>]*>Conta<\/h1>/);
    expect(html).not.toContain('id="app-sidebar"');
    expect(html).not.toContain('Abrir menu');
    expect(html).toContain('Seguir o navegador');
  });

  test('switching org keeps the account page', () => {
    expect(sectionOf('/orgs/11/account')).toBe('account');
    expect(sectionOf('/orgs/11/settings/people')).toBe('settings');
  });

  test('signing out everywhere revokes every panel session and goes to the sign-in page', async () => {
    const { router, queryClient } = await renderAt('/orgs/11/account');
    const calls: string[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${String(input)}`);
      if (String(input).endsWith('/v1/app/sessions/revoke-all')) {
        return new Response(null, { status: 204 });
      }
      return Response.json(session);
    }) as unknown as typeof fetch;
    const ok = await signOut({
      queryClient,
      everywhere: true,
      goToSignedOut: () => {
        void router.navigate({ to: '/sign-in', search: { signed_out: 1 }, replace: true });
      },
    });
    expect(ok).toBe(true);
    for (let i = 0; i < 50 && router.state.location.pathname !== '/sign-in'; i++) {
      await Bun.sleep(10);
    }
    expect(calls).toContain(`POST ${apiUrl}/v1/app/sessions/revoke-all`);
    expect(calls).not.toContain(`POST ${apiUrl}/v1/app/logout`);
    expect(router.state.location.href).toBe('/sign-in?signed_out=1');
    expect(queryClient.getQueryData(sessionQuery.queryKey)).toBeUndefined();
  });

  test('a failed sign out everywhere stays on the page', async () => {
    const { router, queryClient } = await renderAt('/orgs/11/account');
    globalThis.fetch = mock(async (input: RequestInfo | URL) =>
      String(input).endsWith('/v1/app/sessions/revoke-all')
        ? Response.json({ error: { code: 'internal', message: 'boom' } }, { status: 500 })
        : Response.json(session),
    ) as unknown as typeof fetch;
    let navigated = false;
    const ok = await signOut({
      queryClient,
      everywhere: true,
      goToSignedOut: () => {
        navigated = true;
      },
    });
    expect(ok).toBe(false);
    expect(navigated).toBe(false);
    expect(router.state.location.pathname).toBe('/orgs/11/account');
  });

  test('an expired session never counts as signed out everywhere and asks to sign in again', async () => {
    const { queryClient } = await renderAt('/orgs/11/account');
    const assigned: string[] = [];
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          pathname: '/orgs/11/account',
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
        everywhere: true,
        goToSignedOut: () => {
          navigated = true;
        },
      });
      expect(ok).toBe(false);
    } finally {
      if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
      else Reflect.deleteProperty(globalThis, 'window');
    }
    expect(navigated).toBe(false);
    expect(assigned).toEqual(['/sign-in?next=%2Forgs%2F11%2Faccount']);
  });
});
