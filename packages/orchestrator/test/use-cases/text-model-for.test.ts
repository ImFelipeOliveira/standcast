import { expect, test } from 'bun:test';
import type { TextModel } from '@standcast/core';
import { markLlmKeyRejected, upsertLlmSettings } from '@standcast/db';
import { db } from '../../../db/test/setup';
import { createTextModelFor } from '../../src';
import { INST, seedOrg } from './fakes';

const key = new Uint8Array(32).fill(7);

test('factory returns null without settings or after rejection, else the provider model with the decrypted key', async () => {
  await seedOrg();
  const calls: { key: string; model: string }[] = [];
  const built = {} as TextModel;
  const forInstallation = createTextModelFor(
    { db, encryptionKey: key },
    {
      deepseek: (apiKey, model) => {
        calls.push({ key: apiKey, model });
        return built;
      },
    },
  );
  expect(await forInstallation(INST)).toBeNull();
  await upsertLlmSettings(
    db,
    {
      installationId: INST,
      provider: 'deepseek',
      model: 'deepseek-chat',
      apiKey: 'sk-secret-1234',
    },
    key,
  );
  expect(await forInstallation(INST)).toBe(built);
  expect(calls).toEqual([{ key: 'sk-secret-1234', model: 'deepseek-chat' }]);
  await markLlmKeyRejected(db, INST, new Date());
  expect(await forInstallation(INST)).toBeNull();
});
