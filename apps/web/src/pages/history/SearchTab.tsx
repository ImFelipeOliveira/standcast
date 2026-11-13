import type { SearchResult } from '@standcast/orchestrator';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { teamSearchQuery } from '../../api/queries';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { type MessageKey, useLang, useT } from '../../i18n';
import { cn } from '../../lib/utils';
import { formatShortDate } from '../hoje/format';
import { RefLink } from '../hoje/RefLink';
import { Loading } from '../RouteStates';
import { entryKey, type HistorySearch, keyed, RangeFields, readRange } from './shared';

const SECTION_LABELS: Record<SearchResult['section'], MessageKey> = {
  yesterday: 'history.section.yesterday',
  today: 'history.section.today',
  blockers: 'history.section.blockers',
  support: 'history.section.support',
};

function SearchForm({ installationId, search }: { installationId: number; search: HistorySearch }) {
  const t = useT();
  const navigate = useNavigate();
  const [text, setText] = useState(search.q ?? '');
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void navigate({
      to: '/orgs/$installationId/history',
      params: { installationId },
      search: {
        team: search.team,
        tab: 'search',
        q: text.trim(),
        ...readRange(event.currentTarget),
      },
    });
  };
  return (
    <form
      aria-label={t('history.searchLabel')}
      onSubmit={submit}
      className="flex flex-wrap items-end gap-2"
    >
      <label htmlFor="history-q" className="sr-only">
        {t('history.searchLabel')}
      </label>
      <input
        id="history-q"
        name="q"
        type="search"
        maxLength={100}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t('history.searchPlaceholder')}
        className="min-h-11 min-w-0 flex-[1_1_280px] rounded-md border border-border-strong bg-surface px-3 text-base text-text desk:min-h-9 desk:text-[13px]"
      />
      <RangeFields from={search.from} to={search.to} />
      <Button type="submit">{t('history.searchButton')}</Button>
    </form>
  );
}

export function SearchTab({
  installationId,
  search,
}: {
  installationId: number;
  search: HistorySearch;
}) {
  const t = useT();
  const lang = useLang();
  const ready = (search.q ?? '').trim().length >= 2;
  const query = useQuery({
    ...teamSearchQuery(installationId, search.team, search.q ?? '', search.from, search.to),
    enabled: ready,
  });
  return (
    <div className="flex flex-col gap-3">
      <SearchForm
        key={`${search.q ?? ''}|${search.from ?? ''}|${search.to ?? ''}`}
        installationId={installationId}
        search={search}
      />
      {!ready ? (
        <p className="m-0 text-[13px] text-muted">{t('history.searchHint')}</p>
      ) : query.isPending ? (
        <Loading header={false} />
      ) : query.isError ? (
        <p className="m-0 text-bad-ink">{t('error.body')}</p>
      ) : query.data.results.length === 0 ? (
        <p className="m-0 text-muted">{t('history.noResults')}</p>
      ) : (
        <Card className="gap-0 p-0">
          <ul className="m-0 list-none p-0">
            {keyed(
              query.data.results,
              (result) => `${result.date}:${result.section}:${entryKey(result)}`,
            ).map(([key, result], index) => (
              <li
                key={key}
                className={cn(
                  'flex flex-col gap-1 px-4 py-3',
                  index > 0 ? 'border-border border-t' : null,
                )}
              >
                <span className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
                  <span className="font-mono">{formatShortDate(lang, result.date)}</span>
                  <span className="font-mono">@{result.author}</span>
                  <Badge variant="neutral">{t(SECTION_LABELS[result.section])}</Badge>
                </span>
                <span className="flex flex-wrap items-baseline justify-between gap-3 text-[14px]">
                  <span>{result.text}</span>
                  {result.ref ? <RefLink refValue={result.ref} /> : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
