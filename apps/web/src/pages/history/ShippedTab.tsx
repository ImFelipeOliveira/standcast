import type { TeamShipped } from '@standcast/orchestrator';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { teamShippedQuery } from '../../api/queries';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { useLang, useT } from '../../i18n';
import { formatShortDate } from '../hoje/format';
import { Loading } from '../RouteStates';
import { shippedCsv, shippedMarkdown } from './export';
import { Entry, entryKey, type HistorySearch, keyed, RangeFields, readRange } from './shared';

function download(name: string, type: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function RangeForm({
  installationId,
  team,
  from,
  to,
}: {
  installationId: number;
  team: string;
  from?: string;
  to?: string;
}) {
  const t = useT();
  const navigate = useNavigate();
  const applyRange = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void navigate({
      to: '/orgs/$installationId/history',
      params: { installationId },
      search: { team, tab: 'shipped', ...readRange(event.currentTarget) },
    });
  };
  return (
    <form
      aria-label={t('history.range')}
      onSubmit={applyRange}
      className="flex flex-wrap items-end gap-2"
    >
      <RangeFields from={from} to={to} />
      <Button type="submit" variant="outline">
        {t('history.apply')}
      </Button>
    </form>
  );
}

function ShippedList({ shipped, team }: { shipped: TeamShipped; team: string }) {
  const t = useT();
  const lang = useLang();
  const [copied, setCopied] = useState(false);
  const markdown = () => shippedMarkdown(shipped, team, lang);
  const file = `standcast-${team}-${shipped.from}-${shipped.to}`;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-semibold text-[14px]">
          {t('history.shippedRange', {
            from: formatShortDate(lang, shipped.from),
            to: formatShortDate(lang, shipped.to),
          })}
        </span>
        <span className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(markdown()).then(() => setCopied(true));
            }}
          >
            {copied ? t('history.copied') : t('history.copyMarkdown')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => download(`${file}.md`, 'text/markdown', markdown())}
          >
            {t('history.exportMarkdown')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => download(`${file}.csv`, 'text/csv', shippedCsv(shipped))}
          >
            {t('history.exportCsv')}
          </Button>
        </span>
      </div>
      <p className="m-0 text-[12px] text-muted">{t('history.shippedNote')}</p>
      {shipped.days.length === 0 ? (
        <p className="m-0 text-muted">{t('history.none')}</p>
      ) : (
        shipped.days.map((day) => (
          <Card key={day.date} className="gap-0 p-0" aria-label={formatShortDate(lang, day.date)}>
            <h3 className="m-0 rounded-t-[10px] bg-hover px-4 py-2.5 font-semibold text-[12px] text-muted">
              {formatShortDate(lang, day.date)}
            </h3>
            <ul className="m-0 flex list-none flex-col gap-2 p-4">
              {keyed(day.items, entryKey).map(([key, entry]) => (
                <Entry key={key} entry={entry} />
              ))}
            </ul>
          </Card>
        ))
      )}
    </>
  );
}

export function Shipped({
  installationId,
  search,
}: {
  installationId: number;
  search: HistorySearch;
}) {
  const t = useT();
  const query = useQuery(teamShippedQuery(installationId, search.team, search.from, search.to));
  const from = query.data?.from ?? search.from;
  const to = query.data?.to ?? search.to;
  return (
    <div className="flex flex-col gap-3">
      <RangeForm
        key={`${from ?? ''}|${to ?? ''}`}
        installationId={installationId}
        team={search.team}
        from={from}
        to={to}
      />
      {query.isPending ? (
        <Loading header={false} />
      ) : query.isError ? (
        <p className="m-0 text-bad-ink">{t('error.body')}</p>
      ) : (
        <ShippedList shipped={query.data} team={search.team} />
      )}
    </div>
  );
}
