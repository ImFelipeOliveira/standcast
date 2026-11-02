import type { QueryClient } from '@tanstack/react-query';
import { apiPost, forgetSession } from '../api/client';

type SignOutDeps = {
  queryClient: QueryClient;
  goToSignedOut: () => Promise<void> | void;
};

export async function signOut({ queryClient, goToSignedOut }: SignOutDeps): Promise<boolean> {
  try {
    await apiPost<void>('/v1/app/logout');
  } catch {
    return false;
  }
  forgetSession();
  await goToSignedOut();
  queryClient.clear();
  return true;
}
