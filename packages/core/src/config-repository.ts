import type { StandcastConfig } from './config';

export const CONFIG_FILE = 'standcast.yml';
export const CONFIG_REPOS = ['.github-private', '.github'] as const;
export type ConfigRepo = (typeof CONFIG_REPOS)[number];
export const PREFERRED_CONFIG_REPO: ConfigRepo = CONFIG_REPOS[0];
export const FALLBACK_CONFIG_REPO: ConfigRepo = CONFIG_REPOS[1];

export function isConfigRepo(name: string | undefined): name is ConfigRepo {
  return CONFIG_REPOS.some((repo) => repo === name);
}

export function hasIdentityOverrides(config: StandcastConfig): boolean {
  return Object.values(config.members).some((overrides) => Object.keys(overrides).length > 0);
}
