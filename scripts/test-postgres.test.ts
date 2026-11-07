import { describe, expect, test } from 'bun:test';

type TestPostgresModule = typeof import('./test-postgres');

async function loadModule(): Promise<TestPostgresModule> {
  const module = await import('./test-postgres').catch(() => null);
  expect(module).not.toBeNull();
  return module as TestPostgresModule;
}

describe('acquireTestPostgres', () => {
  test('starts one database and stops it once after the run', async () => {
    const { acquireTestPostgres } = await loadModule();
    let starts = 0;
    let stops = 0;

    const database = await acquireTestPostgres(undefined, async () => {
      starts++;
      return {
        getConnectionUri: () => 'postgres://container/standcast_test',
        stop: async () => {
          stops++;
        },
      };
    });

    expect(database.url).toBe('postgres://container/standcast_test');
    expect(starts).toBe(1);
    await database.stop();
    await database.stop();
    expect(stops).toBe(1);
  });

  test('reuses TEST_DATABASE_URL without starting a container', async () => {
    const { acquireTestPostgres } = await loadModule();
    let starts = 0;

    const database = await acquireTestPostgres('postgres://external/standcast_test', async () => {
      starts++;
      throw new Error('must not start');
    });

    expect(database.url).toBe('postgres://external/standcast_test');
    expect(starts).toBe(0);
    await database.stop();
  });
});

describe('configureTestPostgres', () => {
  test('shares one URL with the test process and registers final cleanup', async () => {
    const module = await loadModule();
    expect(module.configureTestPostgres).toBeFunction();
    const env: Record<string, string | undefined> = {};
    let cleanup: (() => Promise<void>) | undefined;
    let starts = 0;
    let stops = 0;

    await module.configureTestPostgres(
      env,
      (registered) => {
        cleanup = registered;
      },
      async () => {
        starts++;
        return {
          getConnectionUri: () => 'postgres://container/standcast_test',
          stop: async () => {
            stops++;
          },
        };
      },
    );

    expect(env.TEST_DATABASE_URL).toBe('postgres://container/standcast_test');
    expect(starts).toBe(1);
    expect(cleanup).toBeFunction();
    await cleanup?.();
    expect(stops).toBe(1);
  });
});

describe('withTestPostgres', () => {
  test('keeps one database alive for the whole command', async () => {
    const module = await loadModule();
    expect(module.withTestPostgres).toBeFunction();
    const events: string[] = [];

    const exitCode = await module.withTestPostgres(
      {},
      async (env) => {
        events.push(`run:${env.TEST_DATABASE_URL}`);
        return 0;
      },
      async () => {
        events.push('start');
        return {
          getConnectionUri: () => 'postgres://container/standcast_test',
          stop: async () => {
            events.push('stop');
          },
        };
      },
    );

    expect(exitCode).toBe(0);
    expect(events).toEqual(['start', 'run:postgres://container/standcast_test', 'stop']);
  });

  test('stops the database when the command fails', async () => {
    const module = await loadModule();
    let stops = 0;

    const run = module.withTestPostgres(
      {},
      async () => {
        throw new Error('test command failed');
      },
      async () => ({
        getConnectionUri: () => 'postgres://container/standcast_test',
        stop: async () => {
          stops++;
        },
      }),
    );

    await expect(run).rejects.toThrow('test command failed');
    expect(stops).toBe(1);
  });
});
