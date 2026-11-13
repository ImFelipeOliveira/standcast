import { beforeEach, describe, expect, test } from 'bun:test';
import type { TeamToday } from '@standcast/orchestrator';
import { renderToStaticMarkup } from 'react-dom/server';
import { applyLang } from '../../i18n';
import { chatConnectedFor, FirstSteps } from './FirstSteps';

function today(overrides: Partial<TeamToday> = {}): TeamToday {
  return {
    team: { name: 'backend', timezone: 'America/Sao_Paulo', remindAt: '09:00', digestAt: '10:00' },
    date: '2026-11-03',
    digest: { status: 'scheduled', sentAt: null, everSent: false },
    chat: { provider: 'slack', url: null },
    canRemind: true,
    canResolve: true,
    people: [{ login: 'diego', status: 'missing', submittedAt: null, daily: null }],
    blockers: [],
    support: [],
    shipped: [],
    ...overrides,
  };
}

const render = (value: TeamToday, chatConnected: boolean | null) =>
  renderToStaticMarkup(
    <FirstSteps installationId={11} today={value} chatConnected={chatConnected} />,
  );

beforeEach(() => applyLang('pt-BR'));

describe('first steps', () => {
  test('lists the five steps with their state in words, not only color', () => {
    const html = render(today(), false);
    expect(html).toContain('Primeiros passos');
    expect(html).toContain('2 de 5');
    expect((html.match(/<li/g) ?? []).length).toBe(5);
    expect((html.match(/Feito/g) ?? []).length).toBe(2);
    expect(html).toContain('Conectar o Slack');
    expect(html).toContain('href="/orgs/11/settings"');
    expect(html).toContain('às 10:00');
  });

  test('a sent daily and a connected Google Chat count as done', () => {
    const html = render(
      today({
        chat: { provider: 'google-chat', url: null },
        people: [
          { login: 'ana', status: 'sent', submittedAt: '2026-11-03T12:00:00.000Z', daily: null },
        ],
      }),
      true,
    );
    expect(html).toContain('4 de 5');
    expect(html).toContain('Conectar o Google Chat');
    expect(html).not.toContain('href="/orgs/11/settings"');
  });

  test('nothing shows once the team got its first digest', () => {
    expect(
      render(today({ digest: { status: 'scheduled', sentAt: null, everSent: true } }), true),
    ).toBe('');
  });
});

describe('chat connection for first steps', () => {
  const setup = (overrides: Record<string, unknown>) =>
    ({
      slack: { connected: false },
      googleChat: { available: true, spaces: [] },
      teams: [
        {
          name: 'backend',
          channel: 'spaces/AAA',
          remindAt: '09:00',
          digestAt: '10:00',
          tracker: null,
        },
      ],
      ...overrides,
    }) as unknown as Parameters<typeof chatConnectedFor>[0];

  test('Slack counts once the workspace is connected', () => {
    expect(
      chatConnectedFor(setup({ slack: { connected: true, workspace: 'acme' } }), today()),
    ).toBe(true);
    expect(chatConnectedFor(setup({}), today())).toBe(false);
  });

  test('Google Chat counts only when the app is in the team space', () => {
    const google = today({ chat: { provider: 'google-chat', url: null } });
    expect(chatConnectedFor(setup({}), google)).toBe(false);
    expect(
      chatConnectedFor(
        setup({
          googleChat: { available: true, spaces: [{ name: 'spaces/AAA', displayName: 'Backend' }] },
        }),
        google,
      ),
    ).toBe(true);
  });

  test('unknown while the setup status has not loaded', () => {
    expect(chatConnectedFor(undefined, today())).toBeNull();
  });
});
