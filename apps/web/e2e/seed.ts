import { parseConfig } from '../../../packages/core/src';
import {
  createDb,
  createSession,
  deleteInstallation,
  migrate,
  setInstallationConfig,
  setMemberInstallations,
  upsertInstallation,
  upsertMember,
} from '../../../packages/db/src';

export const INSTALLATION_ID = 4242;
export const TEAM_NAME = 'Plataforma';

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
  const token = await createSession(db, member.id, 'web');
  return { db, token };
}
