import { beforeEach, describe, expect, test } from 'bun:test';
import { QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { configQuery, configValidationQuery, createQueryClient } from '../../api/queries';
import { applyLang } from '../../i18n';
import { ConfigEditor, configEditUrl } from './ConfigEditor';
import { type ConfigDraft, emptyTeam, toYaml } from './config-yaml';

const draft: ConfigDraft = {
  teams: [
    {
      ...emptyTeam('plataforma'),
      managers: ['felipe'],
      members: ['carla', 'diego'],
      chat: { provider: 'google-chat', channel: 'spaces/AAAA' },
      tracker: { provider: 'linear', team: 'PLT' },
      signals: { ...emptyTeam('x').signals, blockerAlertDays: 3 },
    },
  ],
  members: {},
};

function render(
  validation: { ok: true } | { ok: false; errors: { path: string; message: string }[] },
) {
  const queryClient = createQueryClient();
  queryClient.setQueryData(configQuery(11).queryKey, { config: draft });
  queryClient.setQueryData(configValidationQuery(11, toYaml(draft)).queryKey, validation);
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <ConfigEditor
        installationId={11}
        editUrl="https://github.com/acme/.github/edit/main/standcast.yml"
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => applyLang('pt-BR'));

describe('standcast.yml editor', () => {
  test('shows the YAML built from the form and the notes for the chosen chat and tracker', () => {
    const html = render({ ok: true });
    expect(html).toContain('provider: google-chat');
    expect(html).toContain('blocker_alert_days: 3');
    expect(html).toContain('Válido');
    expect(html).toContain('google_chat');
    expect(html).toContain('members.&lt;login&gt;.linear');
    expect(html).toContain('3 dias');
  });

  test('teams is listed as coming soon and cannot be chosen', () => {
    const html = render({ ok: true });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Teams · em breve<\/button>/);
  });

  test('server errors are listed with their path', () => {
    const html = render({
      ok: false,
      errors: [{ path: 'teams.0.chat.channel', message: 'must be a Google Chat space name' }],
    });
    expect(html).toContain('teams.0.chat.channel');
    expect(html).toContain('must be a Google Chat space name');
    expect(html).not.toContain('>Válido<');
  });

  test('copy and open in GitHub are offered', () => {
    const html = render({ ok: true });
    expect(html).toContain('Copiar YAML');
    expect(html).toContain('href="https://github.com/acme/.github/edit/main/standcast.yml"');
  });
});

describe('editor link to GitHub', () => {
  test('points to the file editor when the config exists and to a new file otherwise', () => {
    expect(configEditUrl('acme', '.github', 'main', true)).toBe(
      'https://github.com/acme/.github/edit/main/standcast.yml',
    );
    expect(configEditUrl('acme', '.github', 'main', false)).toBe(
      'https://github.com/acme/.github/new/main?filename=standcast.yml&value=',
    );
  });
});
