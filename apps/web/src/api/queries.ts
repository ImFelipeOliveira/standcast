import type { SetupStatus, TeamSummary, TeamToday } from '@standcast/orchestrator';
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
