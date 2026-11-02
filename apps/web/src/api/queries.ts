import type { SetupStatus } from '@standcast/orchestrator';
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

export function useSession() {
  return useQuery(sessionQuery);
}

export function useOrgContext(installationId: number) {
  return useQuery(orgContextQuery(installationId));
}

export function useSetupStatus(installationId: number) {
  return useQuery(setupStatusQuery(installationId));
}
