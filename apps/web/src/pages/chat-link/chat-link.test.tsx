import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApiError, apiUrl, forgetSession } from '../../api/client';
import { completeChatLinkRequest } from '../../api/mutations';
import {
  type ChatLinkPreviewView,
  chatLinkQuery,
  createQueryClient,
  sessionQuery,
} from '../../api/queries';
import { applyLang, translate } from '../../i18n';
import { createAppRouter } from '../../router';
import { ChatLinkCard } from './ChatLinkPage';

const originalFetch = globalThis.fetch;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

type Call = { url: string; init: RequestInit };

function stubFetch(respond: (call: Call) => Response): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return respond(call);
  }) as unknown as typeof fetch;
  return calls;
}

function stubWindow(pathname: string, search: string): string[] {
  const assigned: string[] = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { pathname, search, assign: (url: string) => assigned.push(url) },
      sessionStorage: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
      },
    },
  });
  return assigned;
}

const confirm: ChatLinkPreviewView = {
  status: 'confirm',
  login: 'ana',
  org: 'acme',
  account: 'ana@acme.com',
  replaces: false,
};

async function renderAt(
  path: string,
  prepare: (queryClient: ReturnType<typeof createQueryClient>) => unknown,
) {
  const queryClient = createQueryClient();
  queryClient.setQueryData(sessionQuery.queryKey, {
    login: 'ana',
    avatarUrl: 'https://github.com/ana.png',
    csrf: 'csrf-1',
    installations: [],
  });
  await prepare(queryClient);
  const router = createAppRouter(queryClient, {
    history: createMemoryHistory({ initialEntries: [path] }),
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

const showing = (view: ChatLinkPreviewView) =>
  renderAt('/link/google-chat?token=abc', (queryClient) =>
    queryClient.setQueryData(chatLinkQuery('abc').queryKey, view),
  );

const params = { login: 'ana', org: 'acme' };

async function card(props: ComponentProps<typeof ChatLinkCard>) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <ChatLinkCard {...props} /> }),
    history: createMemoryHistory(),
    isServer: false,
    origin: 'http://localhost',
  });
  await router.load();
  return renderToStaticMarkup(<RouterProvider router={router} />);
}

beforeEach(() => {
  applyLang('en');
  forgetSession();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});

describe('Google Chat link page', () => {
  test('the confirm view names the account, login and org with Link and Cancel', async () => {
    const html = await showing(confirm);
    expect(html).toContain('<main');
    expect(html).toMatch(/<h1[^>]*>Link Google Chat<\/h1>/);
    expect(html).toContain(
      translate('en', 'chatLink.confirm', { ...params, account: 'ana@acme.com' }),
    );
    expect(html).not.toContain(translate('en', 'chatLink.replaces', params));
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Link<\/button>/);
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>Cancel<\/a>/);
    expect(html).not.toContain('abc');
  });

  test('the confirm view warns when it replaces the current link', async () => {
    const html = await showing({ ...confirm, replaces: true });
    expect(html).toContain(translate('en', 'chatLink.replaces', params));
  });

  test('each failure status from the preview shows its text', async () => {
    const keys = {
      expired: 'chatLink.expired',
      not_member: 'chatLink.notMember',
      not_connected: 'chatLink.notConnected',
      mapped: 'chatLink.mapped',
    } as const;
    for (const [status, key] of Object.entries(keys)) {
      const html = await showing({ status: status as keyof typeof keys, ...params });
      expect(html).toContain(translate('en', key, params).replace("'", '&#x27;'));
      expect(html).not.toMatch(/>Link<\/button>/);
    }
  });

  test('the result of the link shows the linked text or the failure text', async () => {
    applyLang('pt-BR');
    const linked = await card({
      view: { status: 'linked', ...params },
      pending: false,
      onLink() {},
    });
    expect(linked).toContain(translate('pt-BR', 'chatLink.linked', params));
    const mapped = await card({
      view: { status: 'mapped', ...params },
      pending: false,
      onLink() {},
    });
    expect(mapped).toContain(translate('pt-BR', 'chatLink.mapped', params));
  });

  test('the Link button is disabled while the link is pending', async () => {
    const html = await card({ view: confirm, pending: true, onLink() {} });
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Link<\/button>/);
  });

  test('the preview reads the token from the query and does not post', async () => {
    stubWindow('/link/google-chat', '?token=a%2Bb');
    const calls = stubFetch(() => Response.json(confirm));
    const view = await createQueryClient().fetchQuery(chatLinkQuery('a+b'));
    expect(view).toEqual(confirm);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${apiUrl}/v1/app/google-chat/link?token=a%2Bb`);
    expect(calls[0]?.init.method).toBe('GET');
  });

  test('Link posts the token with the csrf header and returns the result', async () => {
    stubWindow('/link/google-chat', '?token=abc');
    const calls = stubFetch(({ url }) =>
      url.endsWith('/v1/app/session')
        ? Response.json({ login: 'ana', avatarUrl: 'x', csrf: 'csrf-link', installations: [] })
        : Response.json({ status: 'linked', ...params }),
    );
    expect(await completeChatLinkRequest('abc')).toEqual({ status: 'linked', ...params });
    const post = calls.find((call) => call.init.method === 'POST');
    expect(post?.url).toBe(`${apiUrl}/v1/app/google-chat/link`);
    expect(post?.init.body).toBe(JSON.stringify({ token: 'abc' }));
    const headers = post?.init.headers as Record<string, string>;
    expect(headers['X-Standcast-CSRF']).toBe('csrf-link');
  });

  test('a 401 on the preview sends to sign-in and comes back to the link', async () => {
    const assigned = stubWindow('/link/google-chat', '?token=abc');
    stubFetch(() =>
      Response.json({ error: { code: 'unauthorized', message: 'no' } }, { status: 401 }),
    );
    const failure = await createQueryClient()
      .fetchQuery(chatLinkQuery('abc'))
      .catch((error) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(assigned).toEqual(['/sign-in?next=%2Flink%2Fgoogle-chat%3Ftoken%3Dabc']);
  });

  test('a failed preview shows the error state with a retry', async () => {
    stubWindow('/link/google-chat', '?token=abc');
    stubFetch(() =>
      Response.json({ error: { code: 'internal', message: 'boom' } }, { status: 500 }),
    );
    const html = await renderAt('/link/google-chat?token=abc', (queryClient) => {
      queryClient.setQueryDefaults(chatLinkQuery('abc').queryKey, {
        retry: false,
        retryOnMount: false,
      });
      return queryClient.prefetchQuery(chatLinkQuery('abc'));
    });
    expect(html).toContain(translate('en', 'error.title'));
    expect(html).toContain(translate('en', 'error.retry'));
    expect(html).not.toContain('boom');
  });
});
