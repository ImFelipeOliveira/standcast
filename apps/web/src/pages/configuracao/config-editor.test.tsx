import { beforeEach, describe, expect, test } from 'bun:test';
import { QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { configQuery, configValidationQuery, createQueryClient } from '../../api/queries';
import { applyLang } from '../../i18n';
import { en } from '../../i18n/en';
import { ptBR } from '../../i18n/pt-BR';
import { ConfigEditor, configEditUrl, ValidationStatus } from './ConfigEditor';
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
  config: ConfigDraft = draft,
) {
  const queryClient = createQueryClient();
  queryClient.setQueryData(configQuery(11).queryKey, { config });
  queryClient.setQueryData(configValidationQuery(11, toYaml(config)).queryKey, validation);
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

  test('a failed validation request says so instead of showing nothing', () => {
    const html = renderToStaticMarkup(
      <ValidationStatus pending={false} failed result={undefined} />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('Não foi possível validar');
    expect(html).not.toContain('>Válido<');
  });

  test('notes describe how people are linked on this version', () => {
    const google = render({ ok: true });
    expect(google).not.toContain('Vincular minha conta');
    expect(google).toContain('mensagem direta');
    expect(google).toContain('users/');
    const slack = render(
      { ok: true },
      {
        ...draft,
        teams: [
          {
            ...(draft.teams[0] as ConfigDraft['teams'][number]),
            chat: { provider: 'slack', channel: '#daily' },
          },
        ],
      },
    );
    expect(slack).toContain('ao entrar no Standcast');
    expect(slack).toContain('U0123ABCD');
  });

  test('every note tag follows the interface language', () => {
    applyLang('en');
    const html = render({ ok: true });
    expect(html).not.toContain('>Alerta<');
    expect(html).toContain('>Alert<');
  });

  test('copy and open in GitHub are offered', () => {
    const html = render({ ok: true });
    expect(html).toContain('Copiar YAML');
    expect(html).toContain('href="https://github.com/acme/.github/edit/main/standcast.yml"');
  });
});

describe('editor copy', () => {
  test('pt-BR calls the digest consolidado, like the rest of the product', () => {
    const editorCopy = Object.entries(ptBR).filter(([key]) => key.startsWith('editor.'));
    expect(editorCopy.filter(([, value]) => /resumo/i.test(value))).toEqual([]);
    expect(ptBR['editor.digestAt']).toBe('Consolidado');
  });
});

describe('editor starting point', () => {
  test('without a standcast.yml the first team uses the interface language', () => {
    const renderEmpty = () => {
      const queryClient = createQueryClient();
      queryClient.setQueryData(configQuery(11).queryKey, { config: null });
      return renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <ConfigEditor installationId={11} editUrl={null} />
        </QueryClientProvider>,
      );
    };
    expect(renderEmpty()).toContain('language: pt-BR');
    applyLang('en');
    expect(renderEmpty()).toContain('language: en');
  });

  test('the read-only note does not name one configuration repository', () => {
    expect(en['editor.readOnly']).not.toContain('.github');
    expect(ptBR['editor.readOnly']).not.toContain('.github');
    expect(en['editor.readOnly']).toContain("organization's configuration repository");
    expect(ptBR['editor.readOnly']).toContain('repositório de configuração da organização');
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
