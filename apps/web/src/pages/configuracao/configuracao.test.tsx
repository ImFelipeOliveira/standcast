import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { SetupStatus } from '@standcast/orchestrator';
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { apiUrl, forgetSession, type OrgContext } from '../../api/client';
import { type CreatedApiKey, useCreateApiKey } from '../../api/mutations';
import { createQueryClient, orgContextQuery, setupStatusQuery } from '../../api/queries';
import { applyLang } from '../../i18n';
import { ApiKeys } from './ApiKeys';
import { ConfiguracaoPage } from './ConfiguracaoPage';

const originalFetch = globalThis.fetch;

type Notice = SetupStatus['teamNotices'][number];

const createdAt = new Date('2026-10-20T12:00:00Z');

function baseStatus(overrides: Partial<SetupStatus> = {}): SetupStatus {
  return {
    installationId: 11,
    owner: 'acme',
    installations: [{ id: 11, owner: 'acme' }],
    login: 'ana',
    admin: false,
    config: { status: 'configured' },
    accessWarning: null,
    configRepo: { exists: true, defaultBranch: 'main' },
    slack: { connected: true, workspace: 'acme-hq' },
    googleChat: { available: false, spaces: [] },
    linear: { connected: false },
    trackerNotices: [],
    teamNotices: [],
    teams: [
      {
        name: 'backend',
        channel: '#daily-backend',
        remindAt: '09:00',
        digestAt: '10:00',
        tracker: 'linear',
      },
      {
        name: 'plataforma',
        channel: '#daily-plataforma',
        remindAt: '09:30',
        digestAt: '10:30',
        tracker: null,
      },
    ],
    configFileUrl: 'https://github.com/acme/.github/blob/main/standcast.yml',
    teamFailures: [],
    personFailures: [],
    apiKeys: { manage: false },
    webhooks: { manage: false },
    supportEmail: 'support.standcast@usefachada.dev',
    ...overrides,
  };
}

function adminStatus(overrides: Partial<SetupStatus> = {}): SetupStatus {
  return baseStatus({
    admin: true,
    apiKeys: {
      manage: true,
      keys: [
        {
          id: 'key-1',
          name: 'BI interno',
          prefix: 'abc123',
          scopes: ['dailies:read', 'blockers:read'],
          createdAt,
          lastUsedAt: null,
          revokedAt: null,
        },
      ],
    },
    webhooks: {
      manage: true,
      endpoints: [
        {
          id: 'hook-1',
          url: 'https://hooks.acme.dev/standcast',
          events: ['daily.submitted', 'blocker.opened'],
          active: true,
          disabledReason: null,
          consecutiveFailures: 0,
          createdAt,
        },
      ],
      deliveries: [],
    },
    ...overrides,
  });
}

const memberContext: OrgContext = { admin: false, managerOf: [], memberOf: ['backend'] };
const adminContext: OrgContext = { admin: true, managerOf: [], memberOf: [] };

function wire<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function seeded(status: SetupStatus, context: OrgContext): QueryClient {
  const queryClient = createQueryClient();
  queryClient.setQueryData(setupStatusQuery(status.installationId).queryKey, wire(status));
  queryClient.setQueryData(orgContextQuery(status.installationId).queryKey, context);
  return queryClient;
}

function renderPage(status: SetupStatus, context: OrgContext = memberContext): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={seeded(status, context)}>
      <ConfiguracaoPage installationId={status.installationId} />
    </QueryClientProvider>,
  );
}

type CreateApiKey = ReturnType<typeof useCreateApiKey>['mutateAsync'];

function CreateHarness({ onReady }: { onReady: (create: CreateApiKey) => void }) {
  onReady(useCreateApiKey(11).mutateAsync);
  return null;
}

function teamCard(html: string, name: string): string {
  const cards = html.split('<article').slice(1);
  return cards.find((card) => card.includes(`>${name}<`)) ?? '';
}

beforeEach(() => {
  applyLang('pt-BR');
  forgetSession();
  globalThis.fetch = mock(async () =>
    Response.json({ error: { code: 'unexpected', message: 'no' } }, { status: 500 }),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('configuração', () => {
  test('member sees status but no keys or webhooks', () => {
    const html = renderPage(baseStatus());
    expect(html).toContain('Configuração');
    expect(html).toContain('Instalado em acme');
    expect(html).toContain('Conectado a acme-hq');
    expect(html).toContain('Arquivo standcast.yml');
    expect(html).toContain('Configurado');
    expect(html).toContain('href="https://github.com/acme/.github/blob/main/standcast.yml"');
    expect(html).toContain('Editar no GitHub');
    expect(html).toContain('#daily-backend');
    expect(html).toContain('lembrete 09:00 · consolidado 10:00');
    expect(html).toContain('Só um admin pode conectar ou reconectar o Linear.');
    expect(html).not.toContain('/connect/slack');
    expect(html).not.toContain('/connect/linear');
    expect(html).not.toContain('API keys');
    expect(html).not.toContain('Webhooks');
    expect(html).toContain('href="mailto:support.standcast@usefachada.dev"');
  });

  test('admin sees keys and webhooks', () => {
    const html = renderPage(adminStatus(), adminContext);
    expect(html).toContain('API keys');
    expect(html).toContain('BI interno');
    expect(html).toContain('sck_abc123');
    expect(html).toContain('Ler dailies, Ler impedimentos');
    expect(html).toContain('Revogar');
    expect(html).toContain('Nova chave');
    expect(html).toContain('Webhooks');
    expect(html).toContain('https://hooks.acme.dev/standcast');
    expect(html).toContain('Ativo');
    expect(html).toContain('Enviar evento de teste');
    expect(html).toContain('Desativar');
    expect(html).toContain('Novo endpoint');
    expect(html).toContain(`href="${apiUrl}/connect/slack?installation_id=11"`);
    expect(html).toContain('Reconectar Slack');
    expect(html).toContain(`href="${apiUrl}/connect/linear?installation_id=11"`);
    expect(html).toContain('Conectar o Linear');
    expect(html).not.toContain('Só um admin pode');
  });

  test('invalid config lists errors', () => {
    const html = renderPage(
      baseStatus({
        config: {
          status: 'invalid',
          lastValid: true,
          errors: [{ path: 'teams.0.remind_at', message: 'must be HH:MM' }],
        },
      }),
    );
    expect(html).toContain('O standcast.yml é inválido. Corrija os erros abaixo e faça o commit.');
    expect(html).toContain('Requer atenção');
    expect(html).toContain('O Standcast continua usando a última versão válida até você corrigir.');
    expect(html).toContain('Caminho');
    expect(html).toContain('teams.0.remind_at');
    expect(html).toContain('must be HH:MM');
    expect(html).toContain('min-w-[620px]');
  });

  test('unconfigured config links to create the repository', () => {
    const html = renderPage(
      baseStatus({
        config: { status: 'unconfigured', reason: 'no_repo' },
        configRepo: { exists: false },
        configFileUrl: null,
        teams: [],
      }),
    );
    expect(html).toContain('Ainda não configurado.');
    expect(html).toContain('O repositório .github não existe.');
    expect(html).toContain('href="https://github.com/new?name=.github&amp;visibility=private"');
    expect(html).toContain('Criar o repositório .github');
    expect(html).not.toContain('Editar no GitHub');
  });

  test('channel notice renders on its team', () => {
    const channelNotice: Notice = {
      team: 'plataforma',
      reference: '#daily-plataforma',
      kind: 'channel_not_found',
    };
    const html = renderPage(baseStatus({ teamNotices: [channelNotice] }));
    const notice =
      'Time plataforma: o canal #daily-plataforma do Slack não foi encontrado. Crie o canal ou, se ele for privado, convide o bot do Standcast com /invite @Standcast.';
    expect(teamCard(html, 'plataforma')).toContain(notice);
    expect(teamCard(html, 'plataforma')).toContain('border-warn-line');
    expect(teamCard(html, 'backend')).not.toContain(notice);
    expect(teamCard(html, 'backend')).not.toContain('border-warn-line');
  });

  test('secret is not persisted', async () => {
    const status = adminStatus();
    const created: CreatedApiKey = {
      key: {
        id: 'key-2',
        name: 'Notion sync',
        prefix: 'def456',
        scopes: ['digests:read'],
        createdAt,
        lastUsedAt: null,
        revokedAt: null,
      },
      secret: 'sck_def456_supersecret',
    };
    const calls: string[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.endsWith('/v1/app/session')) {
        return Response.json({ login: 'ana', avatarUrl: 'x', csrf: 'c1', installations: [] });
      }
      return Response.json(wire(created), { status: 201 });
    }) as unknown as typeof fetch;

    const queryClient = seeded(status, adminContext);
    let create: CreateApiKey | undefined;
    renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <CreateHarness
          onReady={(mutate) => {
            create = mutate;
          }}
        />
      </QueryClientProvider>,
    );
    const result = await create?.({ name: 'Notion sync', scopes: ['digests:read'] });
    expect(result?.secret).toBe('sck_def456_supersecret');
    expect(calls).toContain(`POST ${apiUrl}/v1/app/orgs/11/api-keys`);
    expect(queryClient.getQueryState(setupStatusQuery(11).queryKey)?.isInvalidated).toBe(true);
    const cached = JSON.stringify(
      queryClient
        .getQueryCache()
        .getAll()
        .map((q) => q.state.data),
    );
    expect(cached).not.toContain('supersecret');

    const apiKeys = status.apiKeys.manage ? status.apiKeys : { manage: true as const, keys: [] };
    const withSecret = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <ApiKeys
          installationId={11}
          apiKeys={wire(apiKeys)}
          created={result ?? null}
          onCreated={() => {}}
          onDismiss={() => {}}
        />
      </QueryClientProvider>,
    );
    expect(withSecret).toContain('sck_def456_supersecret');
    expect(withSecret).toContain('Copie agora. Ela não aparece de novo.');
    expect(withSecret).toContain('Copiar');

    const refreshed = adminStatus({
      apiKeys: { manage: true, keys: [...apiKeys.keys, created.key] },
    });
    const html = renderPage(refreshed, adminContext);
    expect(html).toContain('Notion sync');
    expect(html).toContain('sck_def456');
    expect(html).not.toContain('supersecret');
    expect(html).not.toContain('Copie agora. Ela não aparece de novo.');
  });

  test('failed delivery reason is translated', () => {
    const status = baseStatus({
      teamFailures: [
        {
          kind: 'digest',
          team: 'plataforma',
          date: '2026-11-02',
          at: new Date('2026-11-02T13:00:00Z'),
          error: 'channel_not_found: the channel was not found',
        },
      ],
      personFailures: [
        {
          kind: 'reminder',
          error: 'user_not_found: the Slack user was not found',
          count: 3,
          lastAt: new Date('2026-11-02T12:00:00Z'),
        },
      ],
    });
    const html = renderPage(status);
    expect(html).toContain('Últimas entregas com falha');
    expect(html).toContain('Consolidado');
    expect(html).toContain('channel_not_found');
    expect(html).toContain('O canal do Slack não foi encontrado.');
    expect(html).not.toContain('the channel was not found');
    expect(html).toContain('Lembrete');
    expect(html).toContain('A pessoa não foi encontrada no Slack.');
    expect(html).toContain('>3<');

    applyLang('en');
    const english = renderPage(status);
    expect(english).toContain('Latest failed deliveries');
    expect(english).toContain('Digest');
    expect(english).toContain('The Slack channel was not found.');
  });

  test('no failures shows the empty state', () => {
    const html = renderPage(baseStatus());
    expect(html).toContain('Nenhuma entrega com falha.');
  });
});
