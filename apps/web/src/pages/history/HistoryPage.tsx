import type { HistoryEntry, SearchResult, TeamHistory } from '@standcast/orchestrator';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { type FormEvent, type ReactNode, useState } from 'react';
import {
  teamDigestQuery,
  teamHistoryQuery,
  teamSearchQuery,
  teamShippedQuery,
  useTeamsSummary,
} from '../../api/queries';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { type MessageKey, useLang, useT } from '../../i18n';
import { cn } from '../../lib/utils';
import { PageHeader } from '../../shell/PageHeader';
import { formatShortDate } from '../hoje/format';
import { RefLink } from '../hoje/RefLink';
import { Loading } from '../RouteStates';
import { shippedCsv, shippedMarkdown } from './export';

export type HistoryTab = 'digests' | 'search' | 'shipped';

export type HistorySearch = {
  team: string;
  tab: HistoryTab;
  date?: string;
  q?: string;
  from?: string;
  to?: string;
};

const SECTION_LABELS: Record<SearchResult['section'], MessageKey> = {
  yesterday: 'history.section.yesterday',
  today: 'history.section.today',
  blockers: 'history.section.blockers',
  support: 'history.section.support',
};

function keyed<T>(items: T[], base: (item: T) => string): [string, T][] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const key = base(item);
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    return [`${key}#${count}`, item];
  });
}

const entryKey = (entry: HistoryEntry) => `${entry.author}:${entry.text}:${entry.ref?.url ?? ''}`;

function chatLabel(provider: TeamHistory['provider']): MessageKey {
  return provider === 'slack' ? 'chat.openSlack' : 'chat.openGoogleChat';
}

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

function Entry({ entry }: { entry: HistoryEntry }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[14px]">
      <span>
        <span className="mr-2 font-mono text-[12px] text-muted">@{entry.author}</span>
        {entry.text}
      </span>
      {entry.ref ? <RefLink refValue={entry.ref} /> : null}
    </li>
  );
}

function DigestDetail({
  installationId,
  team,
  date,
}: {
  installationId: number;
  team: string;
  date: string;
}) {
  const t = useT();
  const lang = useLang();
  const query = useQuery(teamDigestQuery(installationId, team, date));
  if (query.isPending) return <Loading header={false} />;
  if (query.isError) return <p className="m-0 text-bad-ink">{t('error.body')}</p>;
  const digest = query.data;
  const section = (title: string, children: ReactNode) => (
    <section className="flex flex-col gap-2 border-border border-t px-4 py-3.5">
      <h3 className="m-0 font-semibold text-[12px] text-muted">{title}</h3>
      {children}
    </section>
  );
  return (
    <Card className="gap-0 p-0" aria-labelledby="digest-title">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
        <div className="flex flex-col gap-0.5">
          <h2 id="digest-title" className="m-0 font-semibold text-[16px]">
            {formatShortDate(lang, digest.date)}
          </h2>
          <span className="font-mono text-[12px] text-muted">
            {t(`history.status.${digest.status}`)}
          </span>
        </div>
        {digest.chatUrl ? (
          <Button asChild variant="outline">
            <a href={digest.chatUrl} target="_blank" rel="noreferrer">
              {t(chatLabel(digest.provider))}
            </a>
          </Button>
        ) : null}
      </div>
      {section(
        t('history.section.blockers'),
        digest.blockers.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {keyed(digest.blockers, entryKey).map(([key, entry]) => (
              <Entry key={key} entry={entry} />
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[13px] text-muted">{t('history.none')}</p>
        ),
      )}
      {section(
        t('history.section.shipped'),
        digest.shipped.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {keyed(digest.shipped, entryKey).map(([key, entry]) => (
              <Entry key={key} entry={entry} />
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[13px] text-muted">{t('history.none')}</p>
        ),
      )}
      {section(
        t('history.section.today'),
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {keyed(
            digest.today.flatMap((person) =>
              person.items.map((item) => ({
                author: person.author,
                text: item.text,
                ref: item.ref,
              })),
            ),
            entryKey,
          ).map(([key, entry]) => (
            <Entry key={key} entry={entry} />
          ))}
        </ul>,
      )}
    </Card>
  );
}

function Digests({ installationId, search }: { installationId: number; search: HistorySearch }) {
  const t = useT();
  const lang = useLang();
  const query = useQuery(teamHistoryQuery(installationId, search.team));
  if (query.isPending) return <Loading header={false} />;
  if (query.isError) return <p className="m-0 text-bad-ink">{t('error.body')}</p>;
  const days = query.data.days;
  if (days.length === 0) return <p className="m-0 text-muted">{t('history.empty')}</p>;
  const selected = days.find((day) => day.date === search.date)?.date ?? days[0]?.date ?? '';
  return (
    <div className="flex flex-wrap items-start gap-6">
      <nav
        aria-label={t('history.days')}
        className="box-border flex max-w-full flex-[1_1_240px] flex-col gap-0.5 rounded-[10px] bg-surface p-2"
      >
        {days.map((day) => (
          <Link
            key={day.date}
            to="/orgs/$installationId/history"
            params={{ installationId }}
            search={{ team: search.team, date: day.date }}
            activeOptions={{ exact: true, includeSearch: true }}
            aria-current={day.date === selected ? 'page' : undefined}
            className={cn(
              'flex min-h-11 items-center justify-between gap-2 rounded-md px-3 text-[13px] no-underline desk:min-h-9',
              day.date === selected
                ? 'bg-hover font-semibold text-text'
                : 'text-text2 hover:bg-hover hover:text-text',
            )}
          >
            <span>{formatShortDate(lang, day.date)}</span>
            <span className="font-mono text-[11px] text-muted">
              {t('history.dayCounts', {
                dailies: String(day.dailies),
                blockers: String(day.blockers),
              })}
            </span>
          </Link>
        ))}
      </nav>
      <div className="min-w-0 flex-[999_1_480px]">
        <DigestDetail installationId={installationId} team={search.team} date={selected} />
      </div>
    </div>
  );
}

function SearchTab({ installationId, search }: { installationId: number; search: HistorySearch }) {
  const t = useT();
  const lang = useLang();
  const navigate = useNavigate();
  const [text, setText] = useState(search.q ?? '');
  const ready = (search.q ?? '').trim().length >= 2;
  const query = useQuery({
    ...teamSearchQuery(installationId, search.team, search.q ?? '', search.from, search.to),
    enabled: ready,
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void navigate({
      to: '/orgs/$installationId/history',
      params: { installationId },
      search: { team: search.team, tab: 'search', q: text.trim() },
    });
  };
  return (
    <div className="flex flex-col gap-3">
      <form
        aria-label={t('history.searchLabel')}
        onSubmit={submit}
        className="flex flex-wrap gap-2"
      >
        <label htmlFor="history-q" className="sr-only">
          {t('history.searchLabel')}
        </label>
        <input
          id="history-q"
          name="q"
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('history.searchPlaceholder')}
          className="min-h-11 min-w-0 flex-[1_1_280px] rounded-md border border-border-strong bg-surface px-3 text-base text-text desk:min-h-9 desk:text-[13px]"
        />
        <Button type="submit">{t('history.searchButton')}</Button>
      </form>
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

function download(name: string, type: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function Shipped({ installationId, search }: { installationId: number; search: HistorySearch }) {
  const t = useT();
  const lang = useLang();
  const [copied, setCopied] = useState(false);
  const query = useQuery(teamShippedQuery(installationId, search.team, search.from, search.to));
  if (query.isPending) return <Loading header={false} />;
  if (query.isError) return <p className="m-0 text-bad-ink">{t('error.body')}</p>;
  const shipped = query.data;
  const markdown = () => shippedMarkdown(shipped, search.team, lang);
  const file = `standcast-${search.team}-${shipped.from}-${shipped.to}`;
  return (
    <div className="flex flex-col gap-3">
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
    </div>
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
