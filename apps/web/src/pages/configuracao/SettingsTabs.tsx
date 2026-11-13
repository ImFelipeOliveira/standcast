import { Link } from '@tanstack/react-router';
import { useSetupStatus } from '../../api/queries';
import { type MessageKey, useT } from '../../i18n';
import { cn } from '../../lib/utils';

export type SettingsTab = 'general' | 'people' | 'config' | 'api';

const TABS: { tab: SettingsTab; to: string; label: MessageKey }[] = [
  { tab: 'general', to: '/orgs/$installationId/settings', label: 'settings.tab.general' },
  { tab: 'people', to: '/orgs/$installationId/settings/people', label: 'settings.tab.people' },
  {
    tab: 'config',
    to: '/orgs/$installationId/settings/config',
    label: 'settings.tab.config',
  },
  { tab: 'api', to: '/orgs/$installationId/settings/api', label: 'settings.tab.api' },
];

export function SettingsTabs({
  installationId,
  current,
}: {
  installationId: number;
  current: SettingsTab;
}) {
  const t = useT();
  const setup = useSetupStatus(installationId);
  if (!setup.data?.apiKeys.manage) return null;
  return (
    <nav aria-label={t('settings.tabs')} className="flex flex-wrap gap-1 rounded-lg bg-hover p-0.5">
      {TABS.map((item) => (
        <Link
          key={item.tab}
          to={item.to}
          params={{ installationId }}
          activeOptions={{ exact: true, includeSearch: false }}
          aria-current={current === item.tab ? 'page' : undefined}
          className={cn(
            'inline-flex min-h-11 items-center rounded-md px-3 font-medium text-[13px] no-underline desk:min-h-8',
            current === item.tab
              ? 'bg-surface font-semibold text-text ring-1 ring-border-strong'
              : 'text-muted hover:bg-hover hover:text-text',
          )}
        >
          {t(item.label)}
        </Link>
      ))}
    </nav>
  );
}
