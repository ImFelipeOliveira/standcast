import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createApp } from '@standcast/api';
import { type Deps, nullTracker } from '@standcast/orchestrator';
import { createMemoryQueue } from '@standcast/queue';
import { ENCRYPTION_KEY, seed } from './seed';

const databaseUrl = process.env.TEST_DATABASE_URL;
const tokenFile = process.env.E2E_TOKEN_FILE;
if (!databaseUrl || !tokenFile)
  throw new Error('TEST_DATABASE_URL and E2E_TOKEN_FILE are required');

const { db, token } = await seed(databaseUrl);
await mkdir(dirname(tokenFile), { recursive: true });
await writeFile(tokenFile, token);

const unused = async (): Promise<never> => {
  throw new Error('unused');
};

const deps: Deps = {
  db,
  queue: createMemoryQueue(),
  now: () => new Date(),
  encryptionKey: ENCRYPTION_KEY,
  github: {
    app: {} as Deps['github']['app'],
    installationOctokit: async () =>
      ({
        request: async (route: string) => {
          if (route.startsWith('GET /user/')) return { data: { login: 'alice' } };
          if (route.startsWith('GET /orgs/{org}/memberships/'))
            return { data: { role: 'admin', state: 'active' }, status: 200 };
          if (!route.startsWith('GET /repos/')) return { data: {}, status: 204 };
          throw Object.assign(new Error('not found'), { status: 404 });
        },
      }) as never,
    getUserProfile: unused,
    listActivity: async () => [],
    resolveTeamMembers: async (_octokit, _owner, members) => ({
      logins: members,
      missingTeams: [],
      truncatedTeams: [],
    }),
    fetchConfigSource: async () => ({ found: false, reason: 'no_repo', repository: null }),
    fetchRepositorySelection: async () => null,
    getPullRequest: async () => null,
    pullRequestMerged: async () => null,
    listPullRequestFiles: async () => [],
    listOpenPullRequestSnapshots: async () => [],
    fetchCodeowners: async () => null,
    createCheckRun: async () => {},
    exchangeWebCode: unused,
  },
  slack: { exchangeCode: unused },
  linear: { exchangeCode: unused, refreshToken: unused },
  chatFor: async () => null,
  trackerFor: async () => nullTracker,
  env: {
    publicUrl: 'http://localhost:3000',
    supportEmail: 'support@example.com',
    docsUrl: 'https://docs.example.com',
    landingUrl: 'https://landing.example.com',
    appUrl: 'http://localhost:4173',
    githubClientId: 'e2e',
    githubClientSecret: 'e2e',
    sessionSecret: 'e2e-session-secret',
    slackClientId: 'e2e',
    slackClientSecret: 'e2e',
    linearClientId: 'e2e',
    linearClientSecret: 'e2e',
    appId: '1',
    webhookSecret: 'e2e',
  },
};

const api = createApp(deps, { getClientIp: () => '127.0.0.1' });

Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  fetch: (request, server) => api.fetch(request, { server }),
});
