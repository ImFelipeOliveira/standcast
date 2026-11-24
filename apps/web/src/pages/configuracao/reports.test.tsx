import { beforeEach, describe, expect, test } from 'bun:test';
import type { ReportSettings } from '@standcast/orchestrator';
import { QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { createQueryClient, reportSettingsQuery } from '../../api/queries';
import { applyLang } from '../../i18n';
import { ChannelWarning, llmBody, ReportsTab, teamReportBody } from './ReportsTab';
import { tabsFor } from './SettingsTabs';

const report = {
  enabled: true,
  channel: '#sales',
  weekday: 'fri',
  time: '17:00',
  productionBranch: 'main',
} as const;

const admin: ReportSettings = {
  llm: {
    manage: true,
    settings: { provider: 'deepseek', model: 'deepseek-chat', keyLast4: '4321', rejected: true },
  },
  teams: [
    { team: 'backend', provider: 'slack', editable: true, report },
    { team: 'mobile', provider: 'google-chat', editable: false, report: null },
  ],
  orphans: ['old-team'],
};

const manager: ReportSettings = {
  llm: { manage: false },
  teams: [
    { team: 'backend', provider: 'slack', editable: true, report: null },
    { team: 'mobile', provider: 'google-chat', editable: false, report },
  ],
  orphans: [],
};

function render(data: ReportSettings): string {
  const queryClient = createQueryClient();
  queryClient.setQueryData(reportSettingsQuery(11).queryKey, data);
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <ReportsTab installationId={11} />
    </QueryClientProvider>,
  );
}

beforeEach(() => applyLang('en'));

describe('reports tab', () => {
  test('admin sees the DeepSeek card, the masked key hint and never the key', () => {
    const html = render(admin);
    expect(html).toContain('DeepSeek');
    expect(html).toContain('••••4321');
    expect(html).toContain('Key rejected by DeepSeek');
    expect(html).toContain('are sent to DeepSeek to write the report.');
    expect(html).toContain('old-team');
    expect(html).not.toContain('value="••');
  });

  test('removing the key, a team report or an orphan report opens a confirmation first', () => {
    const html = render(admin);
    expect(html.match(/aria-haspopup="dialog"/g)).toHaveLength(3);
  });

  test('a manager sees only the editable team form and no DeepSeek card', () => {
    const html = render(manager);
    expect(html).not.toContain('DeepSeek');
    expect(html).toContain('backend');
    expect(html).toContain('every Friday at 17:00, channel #sales');
    expect(html.match(/type="time"/g)).toHaveLength(1);
  });

  test('every input has a visible label', () => {
    const html = render(admin);
    const ids = [...html.matchAll(/<(?:input|button)[^>]* id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(7);
    for (const id of ids as string[]) expect(html).toContain(`for="${id}"`);
  });

  test('builds the exact bodies to post', () => {
    expect(teamReportBody({ ...report, channel: ' #sales ' })).toEqual(report);
    expect(llmBody('deepseek-chat', '')).toEqual({ provider: 'deepseek', model: 'deepseek-chat' });
    expect(llmBody('deepseek-chat', ' sk-1 ')).toEqual({
      provider: 'deepseek',
      model: 'deepseek-chat',
      apiKey: 'sk-1',
    });
  });

  test('renders the not_member warning with the team channel copy', () => {
    const html = renderToStaticMarkup(
      <ChannelWarning team="backend" provider="slack" channel="#sales" result="not_member" />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('/invite @Standcast');
  });

  test('non-admins get General and Reports only', () => {
    expect(tabsFor(false).map((tab) => tab.tab)).toEqual(['general', 'reports']);
    expect(tabsFor(true)).toHaveLength(5);
  });
});
