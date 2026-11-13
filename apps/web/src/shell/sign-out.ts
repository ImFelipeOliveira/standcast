import type { QueryClient } from '@tanstack/react-query';
import { ApiError, apiPost, forgetSession } from '../api/client';

type SignOutDeps = {
  queryClient: QueryClient;
  goToSignedOut: () => Promise<void> | void;
  everywhere?: boolean;
};

export async function signOut({
  queryClient,
  goToSignedOut,
  everywhere = false,
}: SignOutDeps): Promise<boolean> {
  const path = everywhere ? '/v1/app/sessions/revoke-all' : '/v1/app/logout';
  try {
    await apiPost<void>(path, undefined, { skipAuthRedirect: true });
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 401)) return false;
  }
  forgetSession();
  await goToSignedOut();
  queryClient.clear();
  return true;
}
