import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { SetupStatus } from '@standcast/orchestrator';
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApiError, apiUrl, forgetSession, type OrgContext } from '../../api/client';
import {
  type CreatedApiKey,
  useCreateApiKey,
  useLinkGoogleChatSpace,
  useUnlinkGoogleChatSpace,
} from '../../api/mutations';
import { createQueryClient, orgContextQuery, setupStatusQuery } from '../../api/queries';
import { applyLang, translate } from '../../i18n';
import { ApiKeys } from './ApiKeys';
import { ConfiguracaoPage } from './ConfiguracaoPage';
import { linkErrorMessage } from './labels';

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

function renderPage(
  status: SetupStatus,
  context: OrgContext = memberContext,
  connected?: 'slack' | 'linear',
): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={seeded(status, context)}>
      <ConfiguracaoPage installationId={status.installationId} connected={connected} />
    </QueryClientProvider>,
  );
}

type CreateApiKey = ReturnType<typeof useCreateApiKey>['mutateAsync'];

function CreateHarness({ onReady }: { onReady: (create: CreateApiKey) => void }) {
  onReady(useCreateApiKey(11).mutateAsync);
  return null;
}

type LinkSpace = ReturnType<typeof useLinkGoogleChatSpace>['mutateAsync'];
type UnlinkSpace = ReturnType<typeof useUnlinkGoogleChatSpace>['mutateAsync'];

function GoogleChatHarness({
  onReady,
}: {
  onReady: (link: LinkSpace, unlink: UnlinkSpace) => void;
}) {
  onReady(useLinkGoogleChatSpace(11).mutateAsync, useUnlinkGoogleChatSpace(11).mutateAsync);
  return null;
}

function googleChatCard(html: string): string {
  const cards = html.split('<article').slice(1);
  return cards.find((card) => card.includes('>Google Chat<')) ?? '';
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
  test('connected=slack shows a notice in both languages and no secret', () => {
    applyLang('en');
    const en = renderPage(baseStatus(), memberContext, 'slack');
    expect(en).toContain('Slack is connected.');
    expect(en).not.toContain('Linear is connected.');
    expect(en).not.toContain('code=');
    applyLang('pt-BR');
    expect(renderPage(baseStatus(), memberContext, 'slack')).toContain('O Slack está conectado.');
  });

  test('connected=linear shows a notice in both languages and no secret', () => {
    applyLang('en');
    const en = renderPage(baseStatus(), memberContext, 'linear');
    expect(en).toContain('Linear is connected.');
    expect(en).not.toContain('Slack is connected.');
    expect(en).not.toContain('code=');
    applyLang('pt-BR');
    expect(renderPage(baseStatus(), memberContext, 'linear')).toContain('O Linear está conectado.');
  });

  test('no connected param shows neither notice', () => {
    const html = renderPage(baseStatus());
    expect(html).not.toContain('Slack is connected.');
    expect(html).not.toContain('O Slack está conectado.');
    expect(html).not.toContain('Linear is connected.');
    expect(html).not.toContain('O Linear está conectado.');
  });

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
    expect(html).toContain('O canal ou espaço do chat não foi encontrado.');
    expect(html).not.toContain('the channel was not found');
    expect(html).toContain('Lembrete');
    expect(html).toContain('A pessoa não foi encontrada no chat.');
    expect(html).toContain('>3<');

    applyLang('en');
    const english = renderPage(status);
    expect(english).toContain('Latest failed deliveries');
    expect(english).toContain('Digest');
    expect(english).toContain('The chat channel or space was not found.');
  });

  test('no failures shows the empty state', () => {
    const html = renderPage(baseStatus());
    expect(html).toContain('Nenhuma entrega com falha.');
  });

  test('google chat card shows bound spaces', () => {
    const googleChat = {
      available: true,
      spaces: [
        { name: 'spaces/AAAA', displayName: 'Engenharia' },
        { name: 'spaces/BBBB', displayName: 'Produto' },
      ],
    };
    const admin = googleChatCard(renderPage(adminStatus({ googleChat }), adminContext));
    expect(admin).toContain('Conectado');
    expect(admin).toContain('Espaços vinculados');
    expect(admin).toContain('Engenharia');
    expect(admin).toContain('spaces/AAAA');
    expect(admin).toContain('Produto');
    expect(admin).toContain('spaces/BBBB');
    expect(admin.match(/>Copiar</g)?.length).toBe(2);
    expect(admin.match(/>Desvincular</g)?.length).toBe(2);
    expect(admin).toContain('Código de vínculo');
    expect(admin).toContain(
      'Adicione o app do Standcast a um espaço do Google Chat; ele publica um código. Cole o código aqui.',
    );
    expect(admin).toContain('Vincular espaço');
    expect(admin).not.toContain('Só um admin');

    const member = googleChatCard(renderPage(baseStatus({ googleChat })));
    expect(member).toContain('Engenharia');
    expect(member).toContain('spaces/AAAA');
    expect(member).toContain('>Copiar<');
    expect(member).not.toContain('Desvincular');
    expect(member).not.toContain('<form');
    expect(member).toContain('Só um admin pode vincular ou desvincular um espaço do Google Chat.');

    const empty = googleChatCard(
      renderPage(adminStatus({ googleChat: { available: true, spaces: [] } }), adminContext),
    );
    expect(empty).toContain('Nenhum espaço vinculado ainda.');
    expect(empty).toContain('Opcional');
    expect(empty).toContain('<form');
  });

  test('unavailable server shows the notice', () => {
    const html = googleChatCard(renderPage(adminStatus(), adminContext));
    expect(html).toContain('Indisponível');
    expect(html).toContain('O Google Chat não está disponível neste servidor.');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('Vincular espaço');

    applyLang('en');
    const english = googleChatCard(renderPage(adminStatus(), adminContext));
    expect(english).toContain('Google Chat is not available on this server.');
  });

  test('a linked google chat space counts as the chat step', () => {
    const html = renderPage(
      baseStatus({
        slack: { connected: false },
        googleChat: { available: true, spaces: [{ name: 'spaces/AAAA', displayName: 'Eng' }] },
        teams: [],
      }),
    );
    expect(html).toContain('3 de 3');
  });

  test('invalid code message', async () => {
    const calls: string[] = [];
    const bodies: string[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.endsWith('/v1/app/session')) {
        return Response.json({ login: 'ana', avatarUrl: 'x', csrf: 'c1', installations: [] });
      }
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      bodies.push(String(init?.body));
      return Response.json(
        { error: { code: 'invalid_code', message: 'invalid code' } },
        { status: 422 },
      );
    }) as unknown as typeof fetch;

    const queryClient = seeded(adminStatus(), adminContext);
    let link: LinkSpace | undefined;
    let unlink: UnlinkSpace | undefined;
    renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <GoogleChatHarness
          onReady={(l, u) => {
            link = l;
            unlink = u;
          }}
        />
      </QueryClientProvider>,
    );
    const failure = await link?.('ABCD2345').catch((error: unknown) => error);
    expect(calls).toContain(`POST ${apiUrl}/v1/app/orgs/11/google-chat/spaces`);
    expect(bodies).toEqual([JSON.stringify({ code: 'ABCD2345' })]);
    const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string>) =>
      translate('pt-BR', key, vars);
    expect(linkErrorMessage(t, failure)).toBe(
      'Este código não é válido. Ele pode ter expirado ou já ter sido usado. Adicione o app ao espaço de novo para receber outro.',
    );

    await unlink?.('spaces/AAAA');
    expect(calls).toContain(`DELETE ${apiUrl}/v1/app/orgs/11/google-chat/spaces/spaces%2FAAAA`);
    expect(queryClient.getQueryState(setupStatusQuery(11).queryKey)?.isInvalidated).toBe(true);
  });

  test('link errors have their own messages', () => {
    const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string>) =>
      translate('en', key, vars);
    expect(linkErrorMessage(t, new ApiError(409, 'space_already_linked', 'x'))).toBe(
      'This space is already linked to another organization.',
    );
    expect(linkErrorMessage(t, new ApiError(409, 'too_many_spaces', 'x'))).toBe(
      'This organization already has 20 linked spaces, the maximum. Unlink one first.',
    );
    expect(linkErrorMessage(t, new ApiError(429, 'rate_limited', 'x'))).toBe(
      'Too many attempts. Wait a minute and try again.',
    );
    expect(linkErrorMessage(t, new ApiError(403, 'forbidden', 'x'))).toBe(
      'Only an admin can link or unlink a Google Chat space.',
    );
    expect(linkErrorMessage(t, new ApiError(500, 'internal_error', 'x'))).toBe(
      'Could not finish right now. Try again in a moment.',
    );
  });

  test('channel notice copy per provider', () => {
    const html = renderPage(
      baseStatus({
        teams: [
          {
            name: 'backend',
            channel: '#daily-backend',
            remindAt: '09:00',
            digestAt: '10:00',
            tracker: null,
          },
          {
            name: 'plataforma',
            channel: 'spaces/PLAT',
            remindAt: '09:30',
            digestAt: '10:30',
            tracker: null,
          },
        ],
        teamNotices: [
          { team: 'backend', reference: '#daily-backend', kind: 'channel_not_member' },
          { team: 'plataforma', reference: 'spaces/PLAT', kind: 'space_not_member' },
        ],
      }),
    );
    expect(teamCard(html, 'backend')).toContain('/invite @Standcast');
    const google = teamCard(html, 'plataforma');
    expect(google).toContain(
      'Time plataforma: o app do Standcast não está no espaço spaces/PLAT do Google Chat. Adicione o app do Standcast ao espaço.',
    );
    expect(google).not.toContain('/invite');

    applyLang('en');
    const english = renderPage(
      baseStatus({
        teamNotices: [{ team: 'plataforma', reference: 'spaces/PLAT', kind: 'space_not_found' }],
      }),
    );
    expect(teamCard(english, 'plataforma')).toContain(
      'Team plataforma: the Google Chat space spaces/PLAT was not found. Check the space name, and add the Standcast app to the space.',
    );
  });

  test('google chat failure reasons are translated', () => {
    const html = renderPage(
      baseStatus({
        teamFailures: [
          {
            kind: 'digest',
            team: 'plataforma',
            date: '2026-11-06',
            at: new Date('2026-11-06T13:00:00Z'),
            error: 'space_not_linked: the space is not linked to this organization',
          },
        ],
        personFailures: [
          {
            kind: 'reminder',
            error: 'no_dm_space: no direct message space',
            count: 1,
            lastAt: new Date('2026-11-06T12:00:00Z'),
          },
          {
            kind: 'blocker_route',
            error: 'timeout: Google Chat did not answer in time',
            count: 1,
            lastAt: new Date('2026-11-06T11:00:00Z'),
          },
        ],
      }),
    );
    expect(html).toContain('O espaço do Google Chat não está vinculado a esta organização.');
    expect(html).toContain('O chat não respondeu a tempo.');
    expect(html).not.toContain('Slack não respondeu');
    expect(html).toContain(
      'A pessoa ainda não mandou mensagem para o app do Standcast no Google Chat.',
    );
  });
});
