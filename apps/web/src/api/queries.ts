import type {
  OrgBlockers,
  PeopleLinks,
  SearchResult,
  SetupStatus,
  TeamDigest,
  TeamHistory,
  TeamShipped,
  TeamSummary,
  TeamToday,
} from '@standcast/orchestrator';
import { QueryClient, queryOptions, useQuery } from '@tanstack/react-query';
import { ApiError, apiGet, fetchSession, type OrgContext } from './client';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status < 500) && failureCount < 2,
      },
    },
  });
}

export const sessionQuery = queryOptions({
  queryKey: ['session'],
  queryFn: () => fetchSession(),
  staleTime: 5 * 60_000,
});

export function orgContextQuery(installationId: number) {
  return queryOptions({
    queryKey: ['org', installationId, 'context'],
    queryFn: () => apiGet<OrgContext>(`/v1/app/orgs/${installationId}/context`),
  });
}

export function setupStatusQuery(installationId: number) {
  return queryOptions({
    queryKey: ['org', installationId, 'setup'],
    queryFn: () => apiGet<SetupStatus>(`/v1/app/orgs/${installationId}/setup`),
  });
}

export function teamTodayQuery(installationId: number, team: string) {
  return queryOptions({
    queryKey: ['org', installationId, 'team', team, 'today'],
    queryFn: () =>
      apiGet<TeamToday>(`/v1/app/orgs/${installationId}/teams/${encodeURIComponent(team)}/today`),
  });
}

export function teamsSummaryQuery(installationId: number) {
  return queryOptions({
    queryKey: ['org', installationId, 'teams', 'summary'],
    queryFn: () => apiGet<TeamSummary[]>(`/v1/app/orgs/${installationId}/teams/summary`),
  });
}

export function useSession() {
  return useQuery(sessionQuery);
}

export function useOrgContext(installationId: number) {
  return useQuery(orgContextQuery(installationId));
}

export function useSetupStatus(installationId: number) {
  return useQuery(setupStatusQuery(installationId));
}

export function useTeamToday(installationId: number, team: string) {
  return useQuery(teamTodayQuery(installationId, team));
}

export function useTeamsSummary(installationId: number, enabled: boolean) {
  return useQuery({ ...teamsSummaryQuery(installationId), enabled });
}

export function orgBlockersQuery(installationId: number, team?: string) {
  const query = team ? `?team=${encodeURIComponent(team)}` : '';
  return queryOptions({
    queryKey: ['org', installationId, 'blockers', team ?? null],
    queryFn: () => apiGet<OrgBlockers>(`/v1/app/orgs/${installationId}/blockers${query}`),
  });
}

export function useOrgBlockers(installationId: number, team?: string) {
  return useQuery(orgBlockersQuery(installationId, team));
}

function historyPath(installationId: number, team: string): string {
  return `/v1/app/orgs/${installationId}/teams/${encodeURIComponent(team)}/history`;
}

function rangeQuery(from?: string, to?: string): string {
  const query = new URLSearchParams();
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  const value = query.toString();
  return value ? `?${value}` : '';
}

export function teamHistoryQuery(installationId: number, team: string) {
  return queryOptions({
    queryKey: ['org', installationId, 'team', team, 'history', 'days'],
    queryFn: () => apiGet<TeamHistory>(`${historyPath(installationId, team)}/digests`),
  });
}

export function teamDigestQuery(installationId: number, team: string, date: string) {
  return queryOptions({
    queryKey: ['org', installationId, 'team', team, 'history', 'digest', date],
    queryFn: () =>
      apiGet<TeamDigest>(
        `${historyPath(installationId, team)}/digests/${encodeURIComponent(date)}`,
      ),
  });
}

export function teamSearchQuery(
  installationId: number,
  team: string,
  q: string,
  from?: string,
  to?: string,
) {
  return queryOptions({
    queryKey: [
      'org',
      installationId,
      'team',
      team,
      'history',
      'search',
      q,
      from ?? null,
      to ?? null,
    ],
    queryFn: () => {
      const query = new URLSearchParams({ q });
      if (from) query.set('from', from);
      if (to) query.set('to', to);
      return apiGet<{ results: SearchResult[] }>(
        `${historyPath(installationId, team)}/search?${query}`,
      );
    },
  });
}

export function teamShippedQuery(installationId: number, team: string, from?: string, to?: string) {
  return queryOptions({
    queryKey: ['org', installationId, 'team', team, 'history', 'shipped', from ?? null, to ?? null],
    queryFn: () =>
      apiGet<TeamShipped>(`${historyPath(installationId, team)}/shipped${rangeQuery(from, to)}`),
  });
}

export function peopleQuery(installationId: number) {
  return queryOptions({
    queryKey: ['org', installationId, 'people'],
    queryFn: () => apiGet<PeopleLinks>(`/v1/app/orgs/${installationId}/people`),
  });
}
