import { PostgreSqlContainer } from '@testcontainers/postgresql';

const POSTGRES_IMAGE =
  'postgres:17@sha256:31ba9c94a03ada9988f2bb493a22a75eef3a185884533e5cdbcd498ea835b08f';

export interface TestPostgres {
  url: string;
  stop: () => Promise<void>;
}

interface StartedPostgres {
  getConnectionUri: () => string;
  stop: () => Promise<unknown>;
}

type StartPostgres = () => Promise<StartedPostgres>;
type TestEnvironment = Record<string, string | undefined>;
type RegisterCleanup = (cleanup: () => Promise<void>) => void;
type RunWithEnvironment<T> = (env: TestEnvironment) => Promise<T>;

export async function startTestPostgres(): Promise<StartedPostgres> {
  return new PostgreSqlContainer(POSTGRES_IMAGE)
    .withDatabase('standcast_test')
    .withUsername('standcast')
    .withPassword('standcast')
    .start();
}

export async function acquireTestPostgres(
  existingUrl: string | undefined,
  start: StartPostgres = startTestPostgres,
): Promise<TestPostgres> {
  if (existingUrl) return { url: existingUrl, stop: async () => {} };

  const container = await start();
  let stopped = false;
  return {
    url: container.getConnectionUri(),
    stop: async () => {
      if (stopped) return;
      stopped = true;
      await container.stop();
    },
  };
}

export async function configureTestPostgres(
  env: TestEnvironment,
  registerCleanup: RegisterCleanup,
  start: StartPostgres = startTestPostgres,
): Promise<void> {
  const database = await acquireTestPostgres(env.TEST_DATABASE_URL, start);
  env.TEST_DATABASE_URL = database.url;
  registerCleanup(database.stop);
}

export async function withTestPostgres<T>(
  env: TestEnvironment,
  run: RunWithEnvironment<T>,
  start: StartPostgres = startTestPostgres,
): Promise<T> {
  const database = await acquireTestPostgres(env.TEST_DATABASE_URL, start);
  try {
    return await run({ ...env, TEST_DATABASE_URL: database.url });
  } finally {
    await database.stop();
  }
}
