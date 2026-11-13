import type { RemindNowResult, SetupStatus } from '@standcast/orchestrator';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiPost } from './client';
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
export type LinkedGoogleChatSpace = { space: string; displayName: string };

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

export function useLinkGoogleChatSpace(installationId: number) {
  return useSetupMutation(installationId, (code: string) =>
    apiPost<LinkedGoogleChatSpace>(`${orgPath(installationId)}/google-chat/spaces`, { code }),
  );
}

export function useUnlinkGoogleChatSpace(installationId: number) {
  return useSetupMutation(installationId, (space: string) =>
    apiDelete<void>(`${orgPath(installationId)}/google-chat/spaces/${encodeURIComponent(space)}`),
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

function useOrgBlockerMutation(installationId: number, action: 'resolve' | 'reopen') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (blockerStateId: string) =>
      apiPost<void>(
        `${orgPath(installationId)}/blockers/${encodeURIComponent(blockerStateId)}/${action}`,
      ),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['org', installationId, 'blockers'] }),
        queryClient.invalidateQueries({ queryKey: ['org', installationId, 'team'] }),
      ]),
  });
}

export function useResolveOrgBlocker(installationId: number) {
  return useOrgBlockerMutation(installationId, 'resolve');
}

export function useReopenOrgBlocker(installationId: number) {
  return useOrgBlockerMutation(installationId, 'reopen');
}

export function useRedeliverWebhook(installationId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deliveryId: string) =>
      apiPost<void>(
        `${orgPath(installationId)}/webhooks/deliveries/${encodeURIComponent(deliveryId)}/redeliver`,
      ),
    onSettled: () => queryClient.invalidateQueries(setupStatusQuery(installationId)),
  });
}
