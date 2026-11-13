import type { TeamHistory } from '@standcast/orchestrator';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { teamDigestQuery, teamHistoryQuery } from '../../api/queries';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { type MessageKey, useLang, useT } from '../../i18n';
import { cn } from '../../lib/utils';
import { formatShortDate } from '../hoje/format';
import { Loading } from '../RouteStates';
import { Entry, entryKey, type HistorySearch, keyed } from './shared';

function chatLabel(provider: TeamHistory['provider']): MessageKey {
  return provider === 'slack' ? 'chat.openSlack' : 'chat.openGoogleChat';
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

export function Digests({
  installationId,
  search,
}: {
  installationId: number;
  search: HistorySearch;
}) {
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
