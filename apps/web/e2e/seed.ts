import { dailyDateFor, parseConfig } from '@standcast/core';
import {
  createDb,
  createSession,
  deleteInstallation,
  insertWebhookDeliveries,
  insertWebhookEndpoint,
  migrate,
  setInstallationConfig,
  setMemberInstallations,
  upsertDaily,
  upsertInstallation,
  upsertMember,
} from '@standcast/db';
import { recordBlockers } from '@standcast/orchestrator';

export const INSTALLATION_ID = 4242;
export const TEAM_NAME = 'Plataforma';
export const BLOCKER_TEXT = 'Aguardando acesso ao banco de produção';
export const WEBHOOK_URL = 'https://hooks.acme.test/standcast';

const CONFIG = `
teams:
  - name: ${TEAM_NAME}
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [alice]
    members: [alice, bob]
    chat: { provider: slack, channel: "#plataforma" }
`;

export async function seed(
  databaseUrl: string,
): Promise<{ db: ReturnType<typeof createDb>; token: string }> {
  await migrate(databaseUrl);
  const db = createDb(databaseUrl);
  await deleteInstallation(db, INSTALLATION_ID);
  await upsertInstallation(db, {
    id: INSTALLATION_ID,
    accountLogin: 'acme',
    accountType: 'Organization',
  });
  const parsed = parseConfig(CONFIG);
  if (!parsed.ok) throw new Error('invalid e2e config fixture');
  await setInstallationConfig(db, INSTALLATION_ID, { status: 'configured', config: parsed.config });
  const member = await upsertMember(db, {
    githubUserId: 1,
    login: 'alice',
    email: 'alice@acme.test',
  });
  await setMemberInstallations(db, member.id, [INSTALLATION_ID]);
  const team = parsed.config.teams[0];
  if (!team) throw new Error('missing e2e team');
  const date = dailyDateFor(new Date(), team);
  const blockers = [{ text: BLOCKER_TEXT }];
  await upsertDaily(db, {
    installationId: INSTALLATION_ID,
    memberId: member.id,
    date,
    payload: {
      org: 'acme',
      yesterday: [{ text: 'Revisei o fluxo de login' }],
      today: [{ text: 'Migrar o serviço de filas' }],
      blockers,
      support: [],
    },
    submittedAt: new Date(),
  });
  await recordBlockers({ db } as Parameters<typeof recordBlockers>[0], {
    installationId: INSTALLATION_ID,
    memberId: member.id,
    date,
    blockers,
  });
  const endpoint = await insertWebhookEndpoint(
    db,
    {
      installationId: INSTALLATION_ID,
      url: WEBHOOK_URL,
      events: ['daily.submitted'],
      secret: 'whsec_e2e',
    },
    new Uint8Array(32).fill(7),
  );
  const [deliveryId] = await insertWebhookDeliveries(db, [
    {
      endpointId: endpoint.id,
      event: 'daily.submitted',
      eventId: crypto.randomUUID(),
      payload: {},
      nextAttemptAt: new Date(),
    },
  ]);
  if (!deliveryId) throw new Error('missing e2e webhook delivery');
  await db.execute(
    `update webhook_deliveries set status = 'failed', attempts = 8, last_error = 'timeout' where id = '${deliveryId}'`,
  );
  const token = await createSession(db, member.id, 'web');
  return { db, token };
}
