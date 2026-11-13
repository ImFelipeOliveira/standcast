import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { renderToStaticMarkup } from 'react-dom/server';
import type { OrgContext, Session } from '../../api/client';
import {
  configQuery,
  createQueryClient,
  orgContextQuery,
  setupStatusQuery,
} from '../../api/queries';
import { applyLang } from '../../i18n';
import { createAppRouter } from '../../router';
import { emptyTeam } from './config-yaml';

const originalFetch = globalThis.fetch;

const session: Session = {
  login: 'ana',
  avatarUrl: 'https://github.com/ana.png?size=80',
  csrf: 'csrf-1',
  installations: [{ id: 11, owner: 'acme' }],
};
const context: OrgContext = { admin: true, managerOf: [], memberOf: [] };

async function openConfig(prepare: (queryClient: ReturnType<typeof createQueryClient>) => unknown) {
  globalThis.fetch = mock(async (input: RequestInfo | URL) =>
    String(input).endsWith('/v1/app/session')
      ? Response.json(session)
      : Response.json({ error: { code: 'not_found', message: 'no' } }, { status: 404 }),
  ) as unknown as typeof fetch;
  const queryClient = createQueryClient();
  queryClient.setQueryData(orgContextQuery(11).queryKey, context);
  await prepare(queryClient);
  const router = createAppRouter(queryClient, {
    history: createMemoryHistory({ initialEntries: ['/orgs/11/settings/config'] }),
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
  return { html, queryClient };
}

beforeEach(() => applyLang('pt-BR'));
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('standcast.yml route', () => {
  test('opening the editor drops a cached standcast.yml so it starts from a fresh read', async () => {
    const { queryClient } = await openConfig((client) =>
      client.setQueryData(configQuery(11).queryKey, {
        config: { teams: [emptyTeam('old')], members: {} },
      }),
    );
    expect(queryClient.getQueryData(configQuery(11).queryKey)).toBeUndefined();
  });

  test('a failed setup status shows an error with a retry instead of loading forever', async () => {
    const { html } = await openConfig(async (client) => {
      client.setQueryDefaults(setupStatusQuery(11).queryKey, { retryOnMount: false });
      await client.prefetchQuery(setupStatusQuery(11));
    });
    expect(html).toContain('role="alert"');
    expect(html).toContain('Algo deu errado');
    expect(html).toContain('Tentar de novo');
  });
});
