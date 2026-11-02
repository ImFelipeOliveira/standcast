import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  type RouterHistory,
  redirect,
} from '@tanstack/react-router';
import { sessionQuery } from './api/queries';
import { ComingSoon } from './pages/ComingSoon';
import { ConfiguracaoPage } from './pages/configuracao/ConfiguracaoPage';
import { NoInstallations } from './pages/NoInstallations';
import { Loading, NotFound, RouteError } from './pages/RouteStates';
import { SignedOut } from './pages/SignedOut';
import { AppShell } from './shell/AppShell';

type RouterContext = { queryClient: QueryClient };

function parseInstallationId(value: unknown): number | null {
  const id = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
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
    if (first) {
      throw redirect({
        to: '/orgs/$installationId/configuracao',
        params: { installationId: first.id },
        replace: true,
      });
    }
  },
  component: NoInstallations,
});

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  validateSearch: (search: Record<string, unknown>): { installation_id?: number } => {
    const id = parseInstallationId(search.installation_id);
    return id === null ? {} : { installation_id: id };
  },
  beforeLoad: ({ search }) => {
    if (search.installation_id === undefined) throw redirect({ to: '/', replace: true });
    throw redirect({
      to: '/orgs/$installationId/configuracao',
      params: { installationId: search.installation_id },
      replace: true,
    });
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
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/orgs/$installationId/configuracao',
      params: { installationId: params.installationId },
      replace: true,
    });
  },
});

const hojeRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: 'hoje',
  component: function Hoje() {
    const { installationId } = orgRoute.useParams();
    return <ComingSoon section="hoje" installationId={installationId} />;
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
  component: function Configuracao() {
    const { installationId } = orgRoute.useParams();
    return <ConfiguracaoPage key={installationId} installationId={installationId} />;
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
