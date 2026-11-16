import { describe, expect, test } from 'bun:test';
import { parseConfig } from '@standcast/core';
import {
  cancelAwayPeriod,
  createAwayPeriod,
  getDelivery,
  setIdentity,
  upsertMember,
} from '@standcast/db';
import { db, useCleanDb } from '../../../db/test/setup';
import { sendAwayNotice } from '../../src';
import { fakeChat, fakeDeps, INST, seedMember, seedOrg } from './fakes';

useCleanDb();

async function setup() {
  const parsed = parseConfig(`
teams:
  - name: Alpha
    timezone: America/Sao_Paulo
    language: pt-BR
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [alice]
    members: [alice, bob, carol]
    chat: { provider: slack, channel: "#alpha" }
`);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  await seedOrg(parsed.config);
  const alice = await seedMember();
  const fake = fakeDeps();
  fake.setNow(new Date('2026-10-28T12:00:00Z'));
  const chat = fakeChat();
  fake.deps.chatFor = async () => chat.chat;
  const mark = async (login: string) => {
    const row = await createAwayPeriod(db, {
      installationId: INST,
      login,
      from: '2026-11-02',
      until: '2026-11-06',
      createdBy: alice.id,
    });
    if (row === 'overlap') throw new Error('overlap');
    return row;
  };
  return { ...fake, ...chat, mark };
}

const key = (subject: string) => ({
  installationId: INST,
  teamName: '',
  date: '2026-10-28',
  kind: 'away_notice' as const,
  subject,
});

describe('sendAwayNotice', () => {
  test('sends the pt-BR notice once on retry', async () => {
    const { deps, directs, failWith, mark } = await setup();
    const bob = await upsertMember(db, { githubUserId: 2, login: 'bob', email: null });
    await setIdentity(db, INST, bob.id, 'slack', 'U2');
    const row = await mark('bob');
    const job = {
      installationId: INST,
      periodId: row.id,
      action: 'marked' as const,
      byLogin: 'alice',
      date: '2026-10-28',
    };
    failWith(new Error('network down'));
    await expect(sendAwayNotice(deps, job)).rejects.toThrow('network down');
    expect((await getDelivery(db, key(`bob:${row.id}:marked`)))?.status).toBe('failed');
    failWith(null);
    await sendAwayNotice(deps, job);
    await sendAwayNotice(deps, job);
    expect(directs).toHaveLength(1);
    expect(directs[0]?.userId).toBe('U2');
    expect(directs[0]?.msg.fallbackText).toBe(
      `@alice marcou você de férias de 02/11/2026 a 06/11/2026. Você não vai receber lembretes da daily nesses dias. Para desfazer: \`standcast away cancel ${row.id}\`.`,
    );
    expect((await getDelivery(db, key(`bob:${row.id}:marked`)))?.status).toBe('sent');
  });

  test('a retry after midnight keys the delivery on the job date and sends once', async () => {
    const { deps, directs, failWith, mark, setNow } = await setup();
    const bob = await upsertMember(db, { githubUserId: 2, login: 'bob', email: null });
    await setIdentity(db, INST, bob.id, 'slack', 'U2');
    const row = await mark('bob');
    const job = {
      installationId: INST,
      periodId: row.id,
      action: 'marked' as const,
      byLogin: 'alice',
      date: '2026-10-28',
    };
    await sendAwayNotice(deps, job);
    setNow(new Date('2026-10-29T12:00:00Z'));
    failWith(null);
    await sendAwayNotice(deps, job);
    expect(directs).toHaveLength(1);
    expect((await getDelivery(db, key(`bob:${row.id}:marked`)))?.status).toBe('sent');
    expect(
      await getDelivery(db, { ...key(`bob:${row.id}:marked`), date: '2026-10-29' }),
    ).toBeNull();
  });

  test('sends the cancelled notice', async () => {
    const { deps, directs, mark } = await setup();
    const bob = await upsertMember(db, { githubUserId: 2, login: 'bob', email: null });
    await setIdentity(db, INST, bob.id, 'slack', 'U2');
    const row = await mark('bob');
    await sendAwayNotice(deps, {
      installationId: INST,
      periodId: row.id,
      action: 'cancelled',
      byLogin: 'alice',
      date: '2026-10-28',
    });
    expect(directs[0]?.msg.fallbackText).toBe(
      '@alice cancelou as suas férias de 02/11/2026 a 06/11/2026.',
    );
  });

  test('fails with no_chat_identity without a chat user', async () => {
    const { deps, directs, mark } = await setup();
    const row = await mark('carol');
    await sendAwayNotice(deps, {
      installationId: INST,
      periodId: row.id,
      action: 'marked',
      byLogin: 'alice',
      date: '2026-10-28',
    });
    expect(directs).toHaveLength(0);
    const delivery = await getDelivery(db, key(`carol:${row.id}:marked`));
    expect(delivery?.status).toBe('failed');
    expect(delivery?.error).toBe('no_chat_identity: carol');
  });

  test('fails with no_chat_connection without a chat', async () => {
    const { deps, mark } = await setup();
    deps.chatFor = async () => null;
    const row = await mark('bob');
    await sendAwayNotice(deps, {
      installationId: INST,
      periodId: row.id,
      action: 'marked',
      byLogin: 'alice',
      date: '2026-10-28',
    });
    const delivery = await getDelivery(db, key(`bob:${row.id}:marked`));
    expect(delivery?.status).toBe('failed');
    expect(delivery?.error).toBe('no_chat_connection');
  });

  test('a marked notice for a period cancelled meanwhile is not sent', async () => {
    const { deps, directs, mark } = await setup();
    const bob = await upsertMember(db, { githubUserId: 2, login: 'bob', email: null });
    await setIdentity(db, INST, bob.id, 'slack', 'U2');
    const row = await mark('bob');
    await cancelAwayPeriod(db, { installationId: INST, id: row.id, cancelledBy: bob.id });
    await sendAwayNotice(deps, {
      installationId: INST,
      periodId: row.id,
      action: 'marked',
      byLogin: 'alice',
      date: '2026-10-28',
    });
    expect(directs).toHaveLength(0);
    expect(await getDelivery(db, key(`bob:${row.id}:marked`))).toBeNull();
  });
});
