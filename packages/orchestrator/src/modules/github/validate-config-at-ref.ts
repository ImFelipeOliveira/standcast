import {
  CONFIG_FILE,
  type ConfigError,
  type ConfigRepo,
  hasIdentityOverrides,
  type Language,
  locateConfigKey,
  locateConfigPath,
  PREFERRED_CONFIG_REPO,
  parseConfig,
  type StandcastConfig,
  t,
} from '@standcast/core';
import { getInstallation } from '@standcast/db';
import type { CheckRunInput, ConfigRepository, Octokit } from '@standcast/github';
import type { WorkerDeps } from '../../deps';
import { logError } from '../../log-error';

export { CONFIG_REPOS, FALLBACK_CONFIG_REPO } from '@standcast/core';

export const VALIDATE_CONFIG_JOB = 'validate-config';
const CHECK_RUN_NAME = 'Standcast config';

export type ValidateConfigJob = {
  installationId: number;
  owner: string;
  repo: ConfigRepo;
  headSha: string;
  pullNumber?: number;
};

type ValidationResult = 'success' | 'failure' | 'skipped';

export async function enqueueValidateConfig(
  deps: Pick<WorkerDeps, 'queue'>,
  job: ValidateConfigJob,
): Promise<void> {
  await deps.queue.enqueue(VALIDATE_CONFIG_JOB, job, {
    singletonKey: `validate:${job.installationId}:${job.repo}:${job.headSha}`,
  });
}

function locateLine(source: string, path: string): number {
  const segments = path === '' ? [] : path.split('.');
  for (let size = segments.length; size >= 0; size--) {
    const found = locateConfigPath(source, segments.slice(0, size).join('.'));
    if (found) return found.line;
  }
  return 1;
}

function describeError(error: ConfigError): string {
  return error.path === '' ? error.message : `${error.path}: ${error.message}`;
}

async function touchesConfig(
  deps: WorkerDeps,
  octokit: Octokit,
  owner: string,
  repo: ConfigRepo,
  pullNumber: number,
): Promise<boolean> {
  const files = await deps.github.listPullRequestFiles(octokit, {
    owner,
    repo,
    number: pullNumber,
  });
  return files.includes(CONFIG_FILE);
}

type CheckRunBase = Pick<CheckRunInput, 'owner' | 'repo' | 'headSha' | 'name'>;

function exposesIdentities(config: StandcastConfig, repository: ConfigRepository): boolean {
  return !repository.private && hasIdentityOverrides(config);
}

function publicIdentityCheckRun(
  source: string,
  lang: Language,
  repository: ConfigRepository,
  base: CheckRunBase,
): CheckRunInput {
  const message = t(lang, 'checkRun.publicIdentity.message', {
    repo: repository.name,
    preferred: PREFERRED_CONFIG_REPO,
  });
  return {
    ...base,
    conclusion: 'failure',
    title: t(lang, 'checkRun.publicIdentity.title'),
    summary: message,
    annotations: [
      { path: CONFIG_FILE, line: locateConfigKey(source, 'members')?.line ?? 1, message },
    ],
  };
}

function checkRunFor(
  source: string,
  repository: ConfigRepository,
  base: CheckRunBase,
): CheckRunInput {
  const parsed = parseConfig(source);
  if (parsed.ok) {
    const lang: Language = parsed.config.teams[0]?.language ?? 'en';
    if (exposesIdentities(parsed.config, repository)) {
      return publicIdentityCheckRun(source, lang, repository, base);
    }
    const title = t(lang, 'checkRun.success.title');
    return { ...base, conclusion: 'success', title, summary: title, annotations: [] };
  }
  const lang: Language = 'en';
  return {
    ...base,
    conclusion: 'failure',
    title: t(lang, 'checkRun.failure.title'),
    summary: t(lang, 'checkRun.summary', {
      count: parsed.errors.length,
      errors: parsed.errors.map((error) => `- ${describeError(error)}`).join('\n'),
    }),
    annotations: parsed.errors.map((error) => ({
      path: CONFIG_FILE,
      line: locateLine(source, error.path),
      message: describeError(error),
    })),
  };
}

export async function validateConfigAtRef(
  deps: WorkerDeps,
  job: ValidateConfigJob,
): Promise<ValidationResult> {
  const installation = await getInstallation(deps.db, job.installationId);
  if (!installation) return 'skipped';
  if (installation.accountLogin.toLowerCase() !== job.owner.toLowerCase()) return 'skipped';
  const owner = installation.accountLogin;
  const octokit = await deps.github.installationOctokit(installation.id);
  if (
    job.pullNumber !== undefined &&
    !(await touchesConfig(deps, octokit, owner, job.repo, job.pullNumber))
  ) {
    return 'skipped';
  }
  const source = await deps.github.fetchConfigSource(octokit, owner, {
    repo: job.repo,
    ref: job.headSha,
  });
  if (!source.found) {
    if (source.reason === 'no_access') {
      logError('config validation skipped', {
        name: 'ConfigAccessError',
        code: source.reason,
        message: 'no access to the config repository',
      });
    }
    return 'skipped';
  }
  const input = checkRunFor(source.source, source.repository, {
    owner,
    repo: job.repo,
    headSha: job.headSha,
    name: CHECK_RUN_NAME,
  });
  try {
    await deps.github.createCheckRun(octokit, input);
  } catch (error) {
    logError('config check run failed', error);
    throw error;
  }
  return input.conclusion;
}
