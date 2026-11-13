import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { renderToStaticMarkup } from 'react-dom/server';
import { type Session, signInUrl } from './api/client';
import { createQueryClient, sessionQuery } from './api/queries';
import { applyLang } from './i18n';
import { createAppRouter } from './router';

function session(ids: number[]): Session {
  return {
    login: 'ana',
    avatarUrl: 'https://github.com/ana.png',
    csrf: 'csrf-1',
    installations: ids.map((id) => ({ id, owner: `org-${id}` })),
  };
}

function stubWindow(): string[] {
  const navigated: string[] = [];
  const location = {
    pathname: '/setup',
    search: '',
    assign: (url: string) => navigated.push(url),
    replace: (url: string) => navigated.push(url),
  };
  Object.defineProperty(location, 'href', {
    configurable: true,
    get: () => 'http://localhost/setup',
    set: (url: string) => navigated.push(url),
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location,
      sessionStorage: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
        clear: () => undefined,
        key: () => null,
        length: 0,
      },
    },
  });
  return navigated;
}

async function open(path: string, ids: number[]) {
  const navigated = stubWindow();
  const queryClient = createQueryClient();
  queryClient.setQueryData(sessionQuery.queryKey, session(ids));
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
  return { html, router, navigated };
}

describe('setup route', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

  beforeEach(() => applyLang('en'));

  afterEach(() => {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  });

  test('a listed installation opens Configuração', async () => {
    const { router } = await open('/setup?installation_id=42', [42]);
    expect(router.state.location.href).toBe('/orgs/42/settings');
  });

  test('a listed installation drops resynced from the next URL', async () => {
    const { router } = await open('/setup?installation_id=42&resynced=1', [42]);
    expect(router.state.location.href).toBe('/orgs/42/settings');
  });

  test('a missing installation signs in once to resync', async () => {
    const { navigated, router } = await open('/setup?installation_id=777', [42]);
    expect(navigated).toEqual([signInUrl('/setup?installation_id=777&resynced=1')]);
    expect(router.state.location.pathname).not.toBe('/');
    expect(router.state.location.href).not.toContain('/orgs/42');
  });

  test('after the resync a missing installation stays on a pending page', async () => {
    const { html, navigated, router } = await open('/setup?installation_id=777&resynced=1', [42]);
    expect(navigated).toEqual([]);
    expect(router.state.location.pathname).toBe('/setup');
    expect(html).toContain('This installation is still being processed');
    expect(html).toContain('href="/setup?installation_id=777&amp;resynced=1"');
    applyLang('pt-BR');
    const pt = await open('/setup?installation_id=777&resynced=1', [42]);
    expect(pt.navigated).toEqual([]);
    expect(pt.html).toContain('Esta instalação ainda está sendo processada');
    expect(pt.html).toContain('Atualizar a página');
  });
});
