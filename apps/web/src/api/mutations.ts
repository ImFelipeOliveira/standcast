import type { RemindNowResult, SetupStatus } from '@standcast/orchestrator';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost } from './client';
import { setupStatusQuery, teamTodayQuery } from './queries';

type ManagedKeys = Extract<SetupStatus['apiKeys'], { manage: true }>;
type ManagedWebhooks = Extract<SetupStatus['webhooks'], { manage: true }>;

export type ApiKeySummary = ManagedKeys['keys'][number];
export type ApiKeyScope = ApiKeySummary['scopes'][number];
export type WebhookEndpoint = ManagedWebhooks['endpoints'][number];
export type WebhookDelivery = ManagedWebhooks['deliveries'][number];
export type WebhookEvent = WebhookEndpoint['events'][number];

export type CreateApiKeyInput = { name: string; scopes: ApiKeyScope[] };
export type CreatedApiKey = { key: ApiKeySummary; secret: string };
export type CreateWebhookInput = { url: string; events: WebhookEvent[] };
export type CreatedWebhook = { endpoint: WebhookEndpoint; secret: string };

const orgPath = (installationId: number) => `/v1/app/orgs/${installationId}`;

function useSetupMutation<TInput, TResult>(
  installationId: number,
  run: (input: TInput) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    gcTime: 0,
    onSuccess: () => queryClient.invalidateQueries(setupStatusQuery(installationId)),
  });
}

export function useCreateApiKey(installationId: number) {
  return useSetupMutation(installationId, (input: CreateApiKeyInput) =>
    apiPost<CreatedApiKey>(`${orgPath(installationId)}/api-keys`, input),
  );
}

export function useRevokeApiKey(installationId: number) {
  return useSetupMutation(installationId, (keyId: string) =>
    apiPost<void>(`${orgPath(installationId)}/api-keys/${encodeURIComponent(keyId)}/revoke`),
  );
}

export function useCreateWebhook(installationId: number) {
  return useSetupMutation(installationId, (input: CreateWebhookInput) =>
    apiPost<CreatedWebhook>(`${orgPath(installationId)}/webhooks`, input),
  );
}

export function useDisableWebhook(installationId: number) {
  return useSetupMutation(installationId, (endpointId: string) =>
    apiPost<void>(`${orgPath(installationId)}/webhooks/${encodeURIComponent(endpointId)}/disable`),
  );
}

export function useTestWebhook(installationId: number) {
  return useSetupMutation(installationId, (endpointId: string) =>
    apiPost<void>(`${orgPath(installationId)}/webhooks/${encodeURIComponent(endpointId)}/test`),
  );
}

function useTodayMutation<TInput, TResult>(
  installationId: number,
  team: string,
  run: (input: TInput) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => queryClient.invalidateQueries(teamTodayQuery(installationId, team)),
  });
}

export function useResolveBlocker(installationId: number, team: string) {
  return useTodayMutation(installationId, team, (blockerStateId: string) =>
    apiPost<void>(
      `${orgPath(installationId)}/blockers/${encodeURIComponent(blockerStateId)}/resolve`,
    ),
  );
}

export function useReopenBlocker(installationId: number, team: string) {
  return useTodayMutation(installationId, team, (blockerStateId: string) =>
    apiPost<void>(
      `${orgPath(installationId)}/blockers/${encodeURIComponent(blockerStateId)}/reopen`,
    ),
  );
}

export function useRemindNow(installationId: number, team: string) {
  return useTodayMutation(installationId, team, (login: string) =>
    apiPost<{ result: RemindNowResult }>(
      `${orgPath(installationId)}/teams/${encodeURIComponent(team)}/remind/${encodeURIComponent(login)}`,
    ),
  );
}
