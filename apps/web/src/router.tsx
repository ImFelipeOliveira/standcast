import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  type RouterHistory,
  redirect,
} from '@tanstack/react-router';
import {
  clearSignInMarker,
  fetchSession,
  SIGN_IN_ERRORS,
  type SignInError,
  safeNext,
  signInUrl,
} from './api/client';
import { orgContextQuery, sessionQuery } from './api/queries';
import { useT } from './i18n';
import { BlockersPage } from './pages/blockers/BlockersPage';
import { ConfiguracaoPage } from './pages/configuracao/ConfiguracaoPage';
import { PeopleTab } from './pages/configuracao/PeopleTab';
import { SettingsTabs } from './pages/configuracao/SettingsTabs';
import { HistoryPage, type HistorySearch } from './pages/history/HistoryPage';
import { HojePage } from './pages/hoje/HojePage';
import { NoInstallations } from './pages/NoInstallations';
import { Loading, NotFound, RouteError } from './pages/RouteStates';
import { SetupPending } from './pages/SetupPending';
import { SignIn } from './pages/SignIn';
import { AppShell } from './shell/AppShell';
import { PageHeader } from './shell/PageHeader';
import { teamsOf } from './shell/roles';
import { SectionHeader } from './shell/SectionHeader';

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
      to: '/orgs/$installationId/today',
      params: { installationId },
      search: { team },
      replace: true,
    });
  }
  throw redirect({
    to: '/orgs/$installationId/settings',
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
        to: '/orgs/$installationId/settings',
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

type SignInSearch = { next?: string; error?: SignInError; signed_out?: 1 };

function parseSignInSearch(search: Record<string, unknown>): SignInSearch {
  const next = safeNext(search.next);
  const error = (SIGN_IN_ERRORS as readonly unknown[]).includes(search.error)
    ? (search.error as SignInError)
    : undefined;
  const signedOut = search.signed_out === 1 || search.signed_out === '1';
  return {
    ...(next === '/' ? {} : { next }),
    ...(error ? { error } : {}),
    ...(signedOut ? { signed_out: 1 as const } : {}),
  };
}

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  validateSearch: parseSignInSearch,
  beforeLoad: async ({ context, search }) => {
    const { next, error } = parseSignInSearch(search);
    if (error) clearSignInMarker();
    const session = await fetchSession({ skipAuthRedirect: true }).catch(() => null);
    if (!session) return;
    context.queryClient.setQueryData(sessionQuery.queryKey, session);
    throw redirect({ href: next ?? '/', replace: true });
  },
  component: function SignInPage() {
    const { next, error, signed_out: signedOut } = parseSignInSearch(signInRoute.useSearch());
    return <SignIn next={next ?? '/'} error={error} signedOut={signedOut === 1} />;
  },
});

const signedOutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/signed-out',
  beforeLoad: () => {
    throw redirect({ to: '/sign-in', search: { signed_out: 1 }, replace: true });
  },
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
  path: 'today',
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

type BlockersSearch = { state?: 'resolved'; team?: string };

function parseBlockersSearch(search: Record<string, unknown>): BlockersSearch {
  return {
    ...(search.state === 'resolved' ? { state: 'resolved' as const } : {}),
    ...(typeof search.team === 'string' && search.team.length > 0 ? { team: search.team } : {}),
  };
}

const blockersRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: 'blockers',
  validateSearch: parseBlockersSearch,
  component: function Blockers() {
    const { installationId } = orgRoute.useParams();
    const { state, team } = parseBlockersSearch(blockersRoute.useSearch());
    return (
      <BlockersPage
        key={`${installationId}:${team ?? ''}`}
        installationId={installationId}
        tab={state === 'resolved' ? 'resolved' : 'open'}
        team={team}
      />
    );
  },
});

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function parseHistorySearch(search: Record<string, unknown>): Partial<HistorySearch> {
  const text = (value: unknown) =>
    typeof value === 'string' && value.length > 0 ? value : undefined;
  const day = (value: unknown) =>
    typeof value === 'string' && DAY.test(value) ? value : undefined;
  const tab = search.tab === 'search' || search.tab === 'shipped' ? search.tab : undefined;
  const parsed = {
    team: text(search.team),
    tab,
    date: day(search.date),
    q: text(search.q),
    from: day(search.from),
    to: day(search.to),
  };
  return Object.fromEntries(
    Object.entries(parsed).filter(([, value]) => value !== undefined),
  ) as Partial<HistorySearch>;
}

const historicoRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: 'history',
  validateSearch: parseHistorySearch,
  beforeLoad: async ({ context, params, search }) => {
    if (parseHistorySearch(search).team) return;
    const team = await firstTeam(context.queryClient, params.installationId);
    if (!team) return;
    throw redirect({
      to: '/orgs/$installationId/history',
      params,
      search: { team },
      replace: true,
    });
  },
  component: function History() {
    const t = useT();
    const { installationId } = orgRoute.useParams();
    const search = parseHistorySearch(historicoRoute.useSearch());
    if (!search.team) {
      return (
        <>
          <SectionHeader />
          <p className="m-0 text-muted">{t('history.noTeams')}</p>
        </>
      );
    }
    return (
      <HistoryPage
        key={`${installationId}:${search.team}`}
        installationId={installationId}
        search={{ ...search, team: search.team, tab: search.tab ?? 'digests' }}
      />
    );
  },
});

const configuracaoRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: 'settings',
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
        tabs={<SettingsTabs installationId={installationId} current="general" />}
      />
    );
  },
});

const settingsPeopleRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: 'settings/people',
  component: function SettingsPeople() {
    const t = useT();
    const { installationId } = orgRoute.useParams();
    return (
      <>
        <PageHeader
          title={t('setup.heading')}
          actions={<SettingsTabs installationId={installationId} current="people" />}
        />
        <PeopleTab installationId={installationId} />
      </>
    );
  },
});

const settingsApiRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: 'settings/api',
  component: function SettingsApi() {
    const { installationId } = orgRoute.useParams();
    return (
      <ConfiguracaoPage
        key={installationId}
        installationId={installationId}
        tab="api"
        tabs={<SettingsTabs installationId={installationId} current="api" />}
      />
    );
  },
});

const legacyTodayRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: 'hoje',
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: '/orgs/$installationId/today',
      params,
      search: search as Record<string, unknown>,
      replace: true,
    });
  },
});

const legacyHistoryRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: 'historico',
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/orgs/$installationId/history', params, replace: true });
  },
});

const legacySettingsRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: 'configuracao',
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: '/orgs/$installationId/settings',
      params,
      search: search as Record<string, unknown>,
      replace: true,
    });
  },
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  setupRoute,
  signInRoute,
  signedOutRoute,
  orgRoute.addChildren([
    orgIndexRoute,
    hojeRoute,
    blockersRoute,
    historicoRoute,
    configuracaoRoute,
    settingsPeopleRoute,
    settingsApiRoute,
    legacyTodayRoute,
    legacyHistoryRoute,
    legacySettingsRoute,
  ]),
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
