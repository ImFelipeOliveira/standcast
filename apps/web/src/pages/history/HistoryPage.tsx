import { Link, useNavigate } from '@tanstack/react-router';
import { useTeamsSummary } from '../../api/queries';
import { type MessageKey, useT } from '../../i18n';
import { cn } from '../../lib/utils';
import { PageHeader } from '../../shell/PageHeader';
import { Digests } from './DigestsTab';
import { SearchTab } from './SearchTab';
import { Shipped } from './ShippedTab';
import type { HistorySearch, HistoryTab } from './shared';

export type { HistorySearch, HistoryTab } from './shared';

function Tabs({ installationId, search }: { installationId: number; search: HistorySearch }) {
  const t = useT();
  const item = (tab: HistoryTab, label: MessageKey) => (
    <Link
      to="/orgs/$installationId/history"
      params={{ installationId }}
      search={{ team: search.team, ...(tab === 'digests' ? {} : { tab }) }}
      activeOptions={{ exact: true, includeSearch: true }}
      aria-current={search.tab === tab ? 'page' : undefined}
      className={cn(
        'inline-flex min-h-11 items-center rounded-md px-3 font-medium text-[13px] no-underline desk:min-h-8',
        search.tab === tab
          ? 'bg-surface font-semibold text-text ring-1 ring-border-strong'
          : 'text-muted hover:bg-hover hover:text-text',
      )}
    >
      {t(label)}
    </Link>
  );
  return (
    <nav aria-label={t('history.sections')} className="flex gap-1 rounded-lg bg-hover p-0.5">
      {item('digests', 'history.tab.digests')}
      {item('search', 'history.tab.search')}
      {item('shipped', 'history.tab.shipped')}
    </nav>
  );
}

function TeamSelect({ installationId, search }: { installationId: number; search: HistorySearch }) {
  const t = useT();
  const navigate = useNavigate();
  const summary = useTeamsSummary(installationId, true);
  const teams = summary.data?.map((entry) => entry.team) ?? [search.team];
  if (teams.length < 2) return null;
  return (
    <>
      <label htmlFor="history-team" className="sr-only">
        {t('blockers.team')}
      </label>
      <select
        id="history-team"
        value={search.team}
        onChange={(event) =>
          void navigate({
            to: '/orgs/$installationId/history',
            params: { installationId },
            search: {
              team: event.target.value,
              ...(search.tab === 'digests' ? {} : { tab: search.tab }),
            },
          })
        }
        className="min-h-11 rounded-md border border-border-strong bg-surface px-2.5 text-base text-text desk:min-h-8 desk:text-[13px]"
      >
        {teams.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </>
  );
}

export function HistoryPage({
  installationId,
  search,
}: {
  installationId: number;
  search: HistorySearch;
}) {
  const t = useT();
  return (
    <>
      <PageHeader
        context={search.team}
        title={t('nav.history')}
        actions={
          <>
            <Tabs installationId={installationId} search={search} />
            <TeamSelect installationId={installationId} search={search} />
          </>
        }
      />
      {search.tab === 'search' ? (
        <SearchTab installationId={installationId} search={search} />
      ) : search.tab === 'shipped' ? (
        <Shipped installationId={installationId} search={search} />
      ) : (
        <Digests installationId={installationId} search={search} />
      )}
    </>
  );
}
