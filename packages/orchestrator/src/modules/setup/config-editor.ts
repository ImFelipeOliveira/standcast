import { type ConfigError, parseConfig, type StandcastConfig } from '@standcast/core';
import { type MemberRow, operationalConfig } from '@standcast/db';
import type { Deps } from '../../deps';
import { DomainError } from '../access/errors';
import type { MembershipCheck } from '../access/org-context';
import { requireAdmin } from '../access/require-admin';

const MAX_SOURCE_LENGTH = 64_000;

export type EditableConfig = { config: StandcastConfig | null };

export type ConfigValidation = { ok: true } | { ok: false; errors: ConfigError[] };

export async function getEditableConfig(
  deps: Deps,
  isMember: MembershipCheck,
  member: MemberRow,
  installationId: number,
): Promise<EditableConfig> {
  const { installation } = await requireAdmin(deps, isMember, member, installationId);
  return { config: operationalConfig(installation) };
}

export async function validateConfigSource(
  deps: Deps,
  isMember: MembershipCheck,
  member: MemberRow,
  installationId: number,
  source: unknown,
): Promise<ConfigValidation> {
  await requireAdmin(deps, isMember, member, installationId);
  if (typeof source !== 'string' || source.length > MAX_SOURCE_LENGTH) {
    throw new DomainError(
      'invalid_request',
      `source must be a string of at most ${MAX_SOURCE_LENGTH} characters`,
    );
  }
  const result = parseConfig(source);
  return result.ok ? { ok: true } : { ok: false, errors: result.errors };
}
