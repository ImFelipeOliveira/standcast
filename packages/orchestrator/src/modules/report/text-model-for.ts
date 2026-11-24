import type { LlmProvider, TextModel } from '@standcast/core';
import { getLlmApiKey, getLlmSettings } from '@standcast/db';
import type { Deps } from '../../deps';

export type TextModelFactories = Record<LlmProvider, (apiKey: string, model: string) => TextModel>;

export type TextModelFor = (installationId: number) => Promise<TextModel | null>;

export function createTextModelFor(
  deps: Pick<Deps, 'db' | 'encryptionKey'>,
  factories: TextModelFactories,
): TextModelFor {
  return async (installationId) => {
    const settings = await getLlmSettings(deps.db, installationId);
    if (!settings || settings.rejectedAt) return null;
    const apiKey = await getLlmApiKey(deps.db, installationId, deps.encryptionKey);
    return apiKey ? factories[settings.provider](apiKey, settings.model) : null;
  };
}
