import { afterAll } from 'bun:test';
import { configureTestPostgres } from './test-postgres';

await configureTestPostgres(process.env, (cleanup) => {
  afterAll(cleanup);
});
