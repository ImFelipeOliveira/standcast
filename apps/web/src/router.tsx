import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  type RouterHistory,
  redirect,
} from '@tanstack/react-router';
import { signInUrl } from './api/client';
import { orgContextQuery, sessionQuery } from './api/queries';
import { ComingSoon } from './pages/ComingSoon';
import { ConfiguracaoPage } from './pages/configuracao/ConfiguracaoPage';
import { HojePage } from './pages/hoje/HojePage';
import { NoInstallations } from './pages/NoInstallations';
import { Loading, NotFound, RouteError } from './pages/RouteStates';
import { SetupPending } from './pages/SetupPending';
import { SignedOut } from './pages/SignedOut';
import { AppShell } from './shell/AppShell';
import { teamsOf } from './shell/roles';

type RouterContext = { queryClient: QueryClient };

function parseInstallationId(value: unknown): number | null {
  const id = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function firstTeam(queryClient: QueryClient, installationId: number): Promise<string | null> {
  try {
    const context = await queryClient.ensureQueryData(orgContextQuery(installationId));
    return teamsOf(context)[0] ?? null;
  } catch {
    return null;
  }
}

async function landing(queryClient: QueryClient, installationId: number): Promise<never> {
  const team = await firstTeam(queryClient, installationId);
  if (team) {
    throw redirect({
      to: '/orgs/$installationId/hoje',
      params: { installationId },
      search: { team },
      replace: true,
    });
  }
  throw redirect({
    to: '/orgs/$installationId/configuracao',
    params: { installationId },
    replace: true,
  });
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: NotFound,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery);
    const first = session.installations[0];
    if (first) await landing(context.queryClient, first.id);
  },
  component: NoInstallations,
});

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  validateSearch: (
    search: Record<string, unknown>,
  ): { installation_id?: number; resynced?: '1' } => {
    const id = parseInstallationId(search.installation_id);
    const resynced = search.resynced === '1' || search.resynced === 1 ? '1' : undefined;
    return {
      ...(id === null ? {} : { installation_id: id }),
      ...(resynced ? { resynced } : {}),
    };
  },
  beforeLoad: async ({ context, search }) => {
    if (search.installation_id === undefined) throw redirect({ to: '/', replace: true });
    const session = await context.queryClient.ensureQueryData(sessionQuery);
    if (session.installations.some((installation) => installation.id === search.installation_id)) {
      throw redirect({
        to: '/orgs/$installationId/configuracao',
        params: { installationId: search.installation_id },
        replace: true,
      });
    }
    if (search.resynced !== '1') {
      throw redirect({
        href: signInUrl(`/setup?installation_id=${search.installation_id}&resynced=1`),
        reloadDocument: true,
      });
    }
  },
  component: function SetupHold() {
    const { installation_id: installationId } = setupRoute.useSearch();
    if (installationId === undefined) return null;
    return <SetupPending installationId={installationId} />;
  },
});

const signedOutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/signed-out',
  component: SignedOut,
});

const orgRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/orgs/$installationId',
  params: {
    parse: ({ installationId }) => ({ installationId: parseInstallationId(installationId) ?? 0 }),
    stringify: ({ installationId }) => ({ installationId: String(installationId) }),
  },
  beforeLoad: async ({ context, params }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery);
    if (!session.installations.some((installation) => installation.id === params.installationId)) {
      throw redirect({ to: '/', replace: true });
    }
  },
  component: function OrgLayout() {
    const { installationId } = orgRoute.useParams();
    return <AppShell installationId={installationId} />;
  },
});

const orgIndexRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: '/',
  beforeLoad: ({ context, params }) => landing(context.queryClient, params.installationId),
});

const hojeRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: 'hoje',
  validateSearch: (search: Record<string, unknown>): { team?: string } =>
    typeof search.team === 'string' && search.team.length > 0 ? { team: search.team } : {},
  beforeLoad: async ({ context, params, search }) => {
    if (search.team === undefined) await landing(context.queryClient, params.installationId);
  },
  component: function Hoje() {
    const { installationId } = orgRoute.useParams();
    const { team } = hojeRoute.useSearch();
    if (!team) return null;
    return (
      <HojePage key={`${installationId}:${team}`} installationId={installationId} team={team} />
    );
  },
});

const historicoRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: 'historico',
  component: function Historico() {
    const { installationId } = orgRoute.useParams();
    return <ComingSoon section="historico" installationId={installationId} />;
  },
});

const configuracaoRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: 'configuracao',
  validateSearch: (search: Record<string, unknown>): { connected?: 'slack' | 'linear' } =>
    search.connected === 'slack' || search.connected === 'linear'
      ? { connected: search.connected }
      : {},
  component: function Configuracao() {
    const { installationId } = orgRoute.useParams();
    const { connected } = configuracaoRoute.useSearch();
    return (
      <ConfiguracaoPage
        key={installationId}
        installationId={installationId}
        connected={connected}
      />
    );
  },
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  setupRoute,
  signedOutRoute,
  orgRoute.addChildren([orgIndexRoute, hojeRoute, historicoRoute, configuracaoRoute]),
]);

type AppRouterOptions = {
  history?: RouterHistory;
  isServer?: boolean;
  origin?: string;
  scrollRestoration?: boolean;
};

export function createAppRouter(queryClient: QueryClient, options: AppRouterOptions = {}) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPendingComponent: Loading,
    defaultErrorComponent: RouteError,
    defaultNotFoundComponent: NotFound,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    ...options,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
