import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgres://standcast:standcast@localhost:5433/standcast_test';
const apiPort = process.env.E2E_API_PORT ?? '3000';
const tokenFile = resolve(import.meta.dirname, 'test-results/session-token');

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  timeout: 30_000,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'pt-BR',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'bun run apps/web/e2e/server.ts',
      cwd: '../..',
      url: `http://localhost:${apiPort}/health`,
      env: { TEST_DATABASE_URL: databaseUrl, E2E_TOKEN_FILE: tokenFile, PORT: apiPort },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'bun run build && bun run preview --port 4173 --strictPort',
      url: 'http://localhost:4173',
      env: { VITE_API_URL: '', API_ORIGIN: `http://localhost:${apiPort}` },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
