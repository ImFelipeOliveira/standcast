import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Session } from '../../api/client';
import { createQueryClient, sessionQuery } from '../../api/queries';
import { applyLang } from '../../i18n';
import { createAppRouter } from '../../router';
import { sectionOf } from '../../shell/sections';

function session(ids: number[]): Session {
  return {
    login: 'ana',
    avatarUrl: 'https://github.com/ana.png',
    csrf: 'csrf-1',
    installations: ids.map((id) => ({ id, owner: `org-${id}` })),
  };
}

function stubWindow(): void {
  const storage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0,
  };
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { pathname: '/link/google-chat', search: '?token=abc', assign: () => undefined },
      sessionStorage: storage,
      localStorage: storage,
      matchMedia: () => ({ matches: true, addEventListener: () => undefined }),
    },
  });
}

async function open(ids: number[]) {
  stubWindow();
  const queryClient = createQueryClient();
  queryClient.setQueryData(sessionQuery.queryKey, session(ids));
  const router = createAppRouter(queryClient, {
    history: createMemoryHistory({ initialEntries: ['/link/google-chat?token=abc'] }),
    isServer: false,
    origin: 'http://localhost',
    scrollRestoration: false,
  });
  await router.load();
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('google chat link route', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

  beforeEach(() => applyLang('en'));

  afterEach(() => {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  });

  test('a signed-in member sees the link page inside the panel, with the sidebar', async () => {
    const html = await open([42]);
    expect(html).toContain('aria-label="Main"');
    expect(html).toContain('Link Google Chat');
  });

  test('without an organization the page keeps the logo and theme toggle', async () => {
    const html = await open([]);
    expect(html).not.toContain('aria-label="Main"');
    expect(html).toContain('Link Google Chat');
    expect(html).toContain('Standcast');
  });

  test('the link page belongs to the account section', () => {
    expect(sectionOf('/link/google-chat')).toBe('account');
  });
});
