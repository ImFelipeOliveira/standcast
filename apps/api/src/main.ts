import { createDb } from '@standcast/db';
import {
  createCheckRun,
  createGitHubApp,
  exchangeWebCode,
  fetchCodeowners,
  fetchConfigSource,
  fetchRepositorySelection,
  getPullRequest,
  getUserProfile,
  listActivity,
  listOpenPullRequestSnapshots,
  listPullRequestFiles,
  pullRequestMerged,
  resolveTeamMembers,
} from '@standcast/github';
import { createGoogleJwks, GOOGLE_OIDC_JWKS_URL } from '@standcast/google-chat';
import { exchangeLinearCode, refreshLinearToken } from '@standcast/linear';
import { createChatFor, createTrackerFor, type Deps } from '@standcast/orchestrator';
import { createPgBossQueue } from '@standcast/queue';
import { exchangeSlackCode } from '@standcast/slack';
import { createApp } from './app';
import { chatFactories } from './chat-factories';
import { parseEnv } from './env';
import { clientIpResolver } from './middleware/rate-limit';
import { gracefulShutdown } from './shutdown';

const env = parseEnv();
const db = createDb(env.DATABASE_URL);
const queue = createPgBossQueue(env.DATABASE_URL, {
  retryDelaySeconds: 120,
  retryBackoff: true,
});
const app = createGitHubApp({
  appId: env.GITHUB_APP_ID,
  privateKey: env.GITHUB_APP_PRIVATE_KEY,
  webhookSecret: env.GITHUB_WEBHOOK_SECRET,
  clientId: env.GITHUB_CLIENT_ID,
  clientSecret: env.GITHUB_CLIENT_SECRET,
});

const googleChatAccount = env.GOOGLE_CHAT_SERVICE_ACCOUNT;

const deps: Deps = {
  db,
  queue,
  now: () => new Date(),
  encryptionKey: env.STANDCAST_ENCRYPTION_KEY,
  github: {
    app,
    installationOctokit: (installationId) => app.getInstallationOctokit(installationId),
    getUserProfile,
    listActivity,
    resolveTeamMembers,
    fetchConfigSource,
    fetchRepositorySelection,
    getPullRequest,
    pullRequestMerged,
    listPullRequestFiles,
    listOpenPullRequestSnapshots,
    fetchCodeowners,
    createCheckRun,
    exchangeWebCode: (code) =>
      exchangeWebCode({
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        code,
      }),
  },
  slack: { exchangeCode: exchangeSlackCode },
  linear: { exchangeCode: exchangeLinearCode, refreshToken: refreshLinearToken },
  chatFor: createChatFor(db, env.STANDCAST_ENCRYPTION_KEY, chatFactories(googleChatAccount)),
  googleChatAvailable: Boolean(googleChatAccount),
  trackerFor: (...args) => createTrackerFor(deps)(...args),
  env: {
    publicUrl: env.PUBLIC_URL,
    supportEmail: env.SUPPORT_EMAIL,
    docsUrl: env.DOCS_URL,
    landingUrl: env.LANDING_URL,
    appUrl: env.APP_URL,
    appId: env.GITHUB_APP_ID,
    webhookSecret: env.GITHUB_WEBHOOK_SECRET,
    githubClientId: env.GITHUB_CLIENT_ID,
    githubClientSecret: env.GITHUB_CLIENT_SECRET,
    sessionSecret: env.SESSION_SECRET,
    slackClientId: env.SLACK_CLIENT_ID,
    slackClientSecret: env.SLACK_CLIENT_SECRET,
    linearClientId: env.LINEAR_CLIENT_ID,
    linearClientSecret: env.LINEAR_CLIENT_SECRET,
  },
};

await queue.start();

const api = createApp(deps, {
  getClientIp: clientIpResolver({ trustProxy: env.TRUST_PROXY, hops: env.TRUSTED_PROXY_HOPS }),
  googleChat:
    googleChatAccount && env.GOOGLE_CHAT_PROJECT_NUMBER
      ? {
          projectNumber: env.GOOGLE_CHAT_PROJECT_NUMBER,
          jwks: createGoogleJwks(),
          endpointUrl: `${env.PUBLIC_URL}/webhooks/google-chat`,
          oidcJwks: createGoogleJwks({ url: GOOGLE_OIDC_JWKS_URL }),
        }
      : null,
});

const server = Bun.serve({
  port: env.PORT,
  fetch: (request, server) => api.fetch(request, { server }),
});

const shutdown = gracefulShutdown({
  server: { stop: () => server.stop() },
  queue,
  exit: (code) => process.exit(code),
});

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
