import {
  CONFIG_FILE,
  type ConfigRepo,
  type Language,
  PREFERRED_CONFIG_REPO,
} from '@standcast/core';

export function standcastYmlTemplate(login: string, teamName: string, lang: Language): string {
  return `teams:
  - name: ${teamName} Slack
    language: ${lang}
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [${login}]
    members: [${login}]
    chat:
      provider: slack
      channel: "#daily"
  - name: ${teamName} Google Chat
    language: ${lang}
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [${login}]
    members: [${login}]
    chat:
      provider: google-chat
      channel: spaces/AAAAAAAAAAA
`;
}

export function newConfigFileUrl(
  owner: string,
  repo: ConfigRepo,
  branch: string,
  template: string,
): string {
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/new/${encodeURIComponent(branch)}?filename=${CONFIG_FILE}&value=${encodeURIComponent(template)}`;
}

export function newConfigRepoUrl(): string {
  return `https://github.com/new?name=${encodeURIComponent(PREFERRED_CONFIG_REPO)}&visibility=private`;
}
