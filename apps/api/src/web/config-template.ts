import type { Language } from '@standcast/core';

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

export function newConfigFileUrl(owner: string, branch: string, template: string): string {
  return `https://github.com/${encodeURIComponent(owner)}/.github/new/${encodeURIComponent(branch)}?filename=standcast.yml&value=${encodeURIComponent(template)}`;
}

export function newConfigRepoUrl(): string {
  return 'https://github.com/new?name=.github&visibility=private';
}
