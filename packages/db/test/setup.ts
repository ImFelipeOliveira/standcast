import { beforeEach } from 'bun:test';
import { sql } from 'drizzle-orm';
import { createDb, type Db, migrate } from '../src';
import { retryOnDeadlock } from './retry-on-deadlock';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DATABASE_URL) throw new Error('test database was not provisioned');

await migrate(TEST_DATABASE_URL);

export const db: Db = createDb(TEST_DATABASE_URL);

export function useCleanDb(): void {
  beforeEach(async () => {
    await retryOnDeadlock(() =>
      db.execute(sql`
        TRUNCATE installations, members, member_installations, member_identities,
          connections, sessions, dailies, deliveries, rate_limits, api_keys,
          webhook_endpoints, webhook_deliveries, suggestions, beta_requests, blocker_states,
          google_chat_spaces CASCADE
      `),
    );
  });
}
