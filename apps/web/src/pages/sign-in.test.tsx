import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { renderToStaticMarkup } from 'react-dom/server';
import { type Session, SIGN_IN_MARKER, signInUrl } from '../api/client';
import { createQueryClient } from '../api/queries';
import { applyLang, translate } from '../i18n';
import { createAppRouter } from '../router';

const originalFetch = globalThis.fetch;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

const session: Session = {
  login: 'ana',
  avatarUrl: 'https://github.com/ana.png',
  csrf: 'csrf-1',
  installations: [{ id: 11, owner: 'acme' }],
};

let stored: Map<string, string>;

function stubWindow(): void {
  stored = new Map();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { pathname: '/sign-in', search: '', assign: () => undefined },
      sessionStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
        removeItem: (key: string) => stored.delete(key),
      },
    },
  });
}

function stubSession(status: 200 | 401): void {
  globalThis.fetch = mock(async () =>
    status === 200
      ? Response.json(session)
      : Response.json({ error: { code: 'unauthorized', message: 'sign in' } }, { status: 401 }),
  ) as unknown as typeof fetch;
}

async function renderAt(path: string, status: 200 | 401) {
  stubSession(status);
  const queryClient = createQueryClient();
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

beforeEach(() => {
  applyLang('pt-BR');
  stubWindow();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});

describe('sign-in page', () => {
  test('renders the GitHub link that starts sign-in with next', async () => {
    const { html } = await renderAt('/sign-in?next=%2Forgs%2F11%2Ftoday', 401);
    expect(html).toContain('Continuar com GitHub');
    expect(html).toContain(`href="${signInUrl('/orgs/11/today').replaceAll('&', '&amp;')}"`);
    expect(html).toContain('Termos');
    expect(html).not.toContain('role="alert"');
  });

  test('an unsafe next falls back to the root', async () => {
    const { html } = await renderAt('/sign-in?next=https%3A%2F%2Fevil.test', 401);
    expect(html).toContain(`href="${signInUrl('/').replaceAll('&', '&amp;')}"`);
  });

  test('a signed-in visit with an unsafe next goes to the root', async () => {
    const { router } = await renderAt('/sign-in?next=https%3A%2F%2Fevil.test', 200);
    expect(router.state.location.href).not.toContain('evil');
  });

  test('a signed-in visit goes to next', async () => {
    const { router } = await renderAt('/sign-in?next=%2Forgs%2F11%2Ftoday%3Fteam%3Dcore', 200);
    expect(router.state.location.pathname).toBe('/orgs/11/today');
  });

  for (const code of [
    'access_denied',
    'invalid_state',
    'unauthorized',
    'sign_in_did_not_stick',
    'generic',
  ] as const) {
    test(`error ${code} shows its toast with a retry`, async () => {
      const { html } = await renderAt(`/sign-in?error=${code}`, 401);
      expect(html).toContain('role="alert"');
      expect(html).toContain(translate('pt-BR', `signIn.error.${code}.title`));
      expect(html).toContain(translate('pt-BR', `signIn.error.${code}.body`));
      expect(html).toContain('Tentar de novo');
    });
  }

  test('an unknown error code shows no toast', async () => {
    const { html } = await renderAt('/sign-in?error=oops', 401);
    expect(html).not.toContain('role="alert"');
  });

  test('an error clears the sign-in marker', async () => {
    stored.set(SIGN_IN_MARKER, String(Date.now()));
    await renderAt('/sign-in?error=access_denied', 401);
    expect(stored.has(SIGN_IN_MARKER)).toBe(false);
  });

  test('signed_out shows the signed-out notice without retry', async () => {
    const { html } = await renderAt('/sign-in?signed_out=1', 401);
    expect(html).toContain('role="status"');
    expect(html).toContain('Você saiu do Standcast.');
    expect(html).not.toContain('Tentar de novo');
  });

  test('/signed-out redirects to the sign-in page', async () => {
    const { router } = await renderAt('/signed-out', 401);
    expect(router.state.location.href).toBe('/sign-in?signed_out=1');
  });

  test('English copy follows the language', async () => {
    applyLang('en');
    const { html } = await renderAt('/sign-in', 401);
    expect(html).toContain('Continue with GitHub');
    expect(html).toContain('Sign in to Standcast');
  });
});
