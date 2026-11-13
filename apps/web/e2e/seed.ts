import { addCalendarDays, dailyDateFor, parseConfig, type StoredDaily } from '@standcast/core';
import {
  claimDelivery,
  claimWebhookDelivery,
  createApiKey,
  createDb,
  createSession,
  deleteInstallation,
  failDelivery,
  failWebhookDelivery,
  insertWebhookDeliveries,
  insertWebhookEndpoint,
  markDeliverySent,
  migrate,
  setBlockerStateResolved,
  setIdentity,
  setInstallationConfig,
  setMemberInstallations,
  upsertBlockerState,
  upsertDaily,
  upsertInstallation,
  upsertMember,
} from '@standcast/db';
import { recordBlockers } from '@standcast/orchestrator';

export const INSTALLATION_ID = 4242;
export const TEAM_NAME = 'Plataforma';
export const BLOCKER_TEXT = 'Aguardando acesso ao banco de produção';
export const RESOLVED_BLOCKER_TEXT = 'Esperando a revisão do contrato da API';
export const SEARCH_TERM = 'filas';
export const WEBHOOK_URL = 'https://hooks.acme.test/standcast';
export const ENCRYPTION_KEY = new Uint8Array(32).fill(7);

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

type Db = ReturnType<typeof createDb>;

const pr = (repo: string, number: number, title: string) => ({
  kind: 'pull_request' as const,
  url: `https://github.com/acme/${repo}/pull/${number}`,
  title,
});

async function daily(
  db: Db,
  memberId: string,
  date: string,
  payload: Omit<StoredDaily, 'org'>,
  submittedAt = new Date(`${date}T12:00:00Z`),
): Promise<void> {
  await upsertDaily(db, {
    installationId: INSTALLATION_ID,
    memberId,
    date,
    payload: { org: 'acme', ...payload },
    submittedAt,
  });
}

async function seedHistory(db: Db, aliceId: string, bobId: string, date: string): Promise<void> {
  const yesterday = addCalendarDays(date, -1);
  const twoDaysAgo = addCalendarDays(date, -2);
  await daily(db, aliceId, yesterday, {
    yesterday: [
      { text: 'Ajustei os alertas do worker', ref: pr('worker', 41, 'Alertas do worker') },
    ],
    today: [{ text: 'Revisar o fluxo de login' }],
    blockers: [],
    support: [],
  });
  await daily(db, bobId, yesterday, {
    yesterday: [
      { text: 'Publiquei a nova fila de e-mails', ref: pr('api', 87, 'Fila de e-mails') },
    ],
    today: [{ text: 'Medir a latência das filas' }],
    blockers: [{ text: RESOLVED_BLOCKER_TEXT }],
    support: [],
  });
  await daily(db, bobId, twoDaysAgo, {
    yesterday: [{ text: 'Corrigi o retry das filas', ref: pr('api', 85, 'Retry das filas') }],
    today: [{ text: 'Publicar a nova fila de e-mails' }],
    blockers: [],
    support: [],
  });
  const state = await upsertBlockerState(db, {
    installationId: INSTALLATION_ID,
    authorMemberId: bobId,
    blockerId: 'e2e-resolved',
    text: RESOLVED_BLOCKER_TEXT,
    ref: null,
    date: yesterday,
  });
  await setBlockerStateResolved(db, INSTALLATION_ID, state.id, {
    at: new Date(),
    by: aliceId,
    on: date,
  });
  const digest = (day: string) => ({
    installationId: INSTALLATION_ID,
    teamName: TEAM_NAME,
    date: day,
    kind: 'digest' as const,
  });
  await markDeliverySent(db, digest(yesterday));
  const claim = await claimDelivery(db, digest(twoDaysAgo));
  if (claim.status === 'claimed') {
    await failDelivery(db, digest(twoDaysAgo), claim.token, 'channel_not_found');
  }
}

async function seedIntegrations(db: Db, aliceId: string): Promise<void> {
  await setIdentity(db, INSTALLATION_ID, aliceId, 'slack', 'U0ALICE');
  await createApiKey(db, {
    installationId: INSTALLATION_ID,
    name: 'Painel interno',
    scopes: ['teams:read', 'dailies:read'],
    createdBy: aliceId,
  });
  const endpoint = await insertWebhookEndpoint(
    db,
    {
      installationId: INSTALLATION_ID,
      url: WEBHOOK_URL,
      events: ['daily.submitted', 'blocker.opened'],
      secret: 'e2e-webhook-secret',
    },
    ENCRYPTION_KEY,
  );
  const now = new Date();
  const [deliveryId] = await insertWebhookDeliveries(db, [
    {
      endpointId: endpoint.id,
      event: 'daily.submitted',
      eventId: crypto.randomUUID(),
      payload: {},
      nextAttemptAt: now,
    },
  ]);
  if (!deliveryId) return;
  const claimed = await claimWebhookDelivery(db, deliveryId, now, 60_000);
  if (!claimed) return;
  await failWebhookDelivery(
    db,
    deliveryId,
    claimed.attempts,
    { statusCode: 500, error: 'Internal Server Error' },
    null,
  );
}

export async function seed(databaseUrl: string): Promise<{ db: Db; token: string }> {
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
  const bob = await upsertMember(db, { githubUserId: 2, login: 'bob', email: 'bob@acme.test' });
  await setMemberInstallations(db, member.id, [INSTALLATION_ID]);
  await setMemberInstallations(db, bob.id, [INSTALLATION_ID]);
  const team = parsed.config.teams[0];
  if (!team) throw new Error('missing e2e team');
  const date = dailyDateFor(new Date(), team);
  const blockers = [{ text: BLOCKER_TEXT }];
  await daily(
    db,
    member.id,
    date,
    {
      yesterday: [
        { text: 'Revisei o fluxo de login', ref: pr('web', 112, 'Fluxo de login') },
        { text: 'Atualizei o runbook de incidentes' },
      ],
      today: [{ text: 'Migrar o serviço de filas' }],
      blockers,
      support: [{ text: 'Preciso de ajuda com o IAM da AWS' }],
    },
    new Date(),
  );
  await recordBlockers({ db } as Parameters<typeof recordBlockers>[0], {
    installationId: INSTALLATION_ID,
    memberId: member.id,
    date,
    blockers,
  });
  await seedHistory(db, member.id, bob.id, date);
  await seedIntegrations(db, member.id);
  const token = await createSession(db, member.id, 'web');
  return { db, token };
}
