import { deleteMemberSessions } from '@standcast/db';
import type { Deps } from '../../deps';

export async function revokeAllWebSessions(
  deps: Deps,
  memberId: string,
): Promise<{ revoked: number }> {
  return { revoked: await deleteMemberSessions(deps.db, memberId, 'web') };
}
