import { describe, expect, test } from 'bun:test';
import type { ChatChannel } from '@standcast/core';
import { saveConnection } from '@standcast/db';
import { db, useCleanDb } from '../../db/test/setup';
import { createChatFor } from '../src';
import { fakeChat, INST, seedOrg } from './use-cases/fakes';

useCleanDb();

const KEY = new Uint8Array(32).fill(7);

function factories(google: ChatChannel | null) {
  const secrets: string[] = [];
  const slack = fakeChat().chat;
  return {
    secrets,
    slack,
    factories: {
      slack: (secret: string) => {
        secrets.push(secret);
        return slack;
      },
      'google-chat': google ? () => google : null,
    },
  };
}

describe('createChatFor', () => {
  test('slack builds the channel from the stored secret', async () => {
    await seedOrg();
    await saveConnection(db, INST, 'slack', 'T1', 'xoxb-1', KEY, 'Acme');
    const f = factories(null);
    const chatFor = createChatFor(db, KEY, f.factories);
    expect(await chatFor(INST, 'slack')).toBe(f.slack);
    expect(f.secrets).toEqual(['xoxb-1']);
  });

  test('no connection row means no channel', async () => {
    await seedOrg();
    const google = fakeChat().chat;
    const chatFor = createChatFor(db, KEY, factories(google).factories);
    expect(await chatFor(INST, 'slack')).toBeNull();
    expect(await chatFor(INST, 'google-chat')).toBeNull();
  });

  test('google-chat uses its factory when connected', async () => {
    await seedOrg();
    await saveConnection(db, INST, 'google-chat', 'spaces/AAAA', '-', KEY);
    const google = fakeChat().chat;
    const f = factories(google);
    expect(await createChatFor(db, KEY, f.factories)(INST, 'google-chat')).toBe(google);
    expect(f.secrets).toEqual([]);
    expect(await createChatFor(db, KEY, factories(null).factories)(INST, 'google-chat')).toBeNull();
  });
});
