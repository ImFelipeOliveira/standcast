import type { TeamToday } from '@standcast/orchestrator';
import type { ReactNode } from 'react';
import { useLang, useT } from '../../i18n';
import { cn } from '../../lib/utils';
import { formatShortDate } from './format';

function Tile({
  label,
  value,
  note,
  warn = false,
  children,
}: {
  label: string;
  value: ReactNode;
  note?: string | null;
  warn?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 rounded-[14px] border px-[18px] py-4',
        warn ? 'border-warn-line bg-warn-soft text-warn-ink' : 'border-border bg-surface',
      )}
    >
      <span
        className={cn(
          'font-semibold text-[11px] uppercase tracking-[0.06em]',
          warn ? 'text-warn-ink' : 'text-muted',
        )}
      >
        {label}
      </span>
      <span className="font-bold text-[26px] leading-tight">{value}</span>
      {note ? (
        <span className={cn('text-[12px]', warn ? 'text-warn-ink' : 'text-muted')}>{note}</span>
      ) : null}
      {children}
    </div>
  );
}

export function SummaryTiles({ today }: { today: TeamToday }) {
  const t = useT();
  const lang = useLang();
  const total = today.people.length;
  const sent = today.people.filter((person) => person.status !== 'missing').length;
  const stuck = today.blockers.filter((blocker) => blocker.ageDays > 2).length;
  const oldestSupport = today.support.reduce<string | null>(
    (oldest, item) => (oldest === null || item.since < oldest ? item.since : oldest),
    null,
  );
  const prs = today.shipped.filter((item) => item.ref.kind === 'pull_request').length;
  const cards = today.shipped.length - prs;
  const percent = total === 0 ? 0 : Math.round((sent / total) * 100);
  return (
    <section
      aria-label={t('hoje.summary')}
      className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3"
    >
      <Tile
        label={t('hoje.tile.dailies')}
        value={
          <>
            {sent}{' '}
            <span className="font-medium text-[15px] text-muted">
              {t('hoje.tile.dailiesOf', { total: String(total) })}
            </span>
          </>
        }
      >
        <div
          role="progressbar"
          aria-label={t('hoje.tile.dailies')}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={sent}
          className="h-1.5 overflow-hidden rounded-full bg-track"
        >
          <div className="h-full bg-accent" style={{ width: `${percent}%` }} />
        </div>
      </Tile>
      <Tile
        label={t('hoje.tile.blockers')}
        value={today.blockers.length}
        warn={today.blockers.length > 0}
        note={
          stuck === 0
            ? null
            : stuck === 1
              ? t('hoje.tile.stuck.one')
              : t('hoje.tile.stuck.other', { count: String(stuck) })
        }
      />
      <Tile
        label={t('hoje.tile.support')}
        value={today.support.length}
        note={
          oldestSupport
            ? t('hoje.tile.supportSince', { date: formatShortDate(lang, oldestSupport) })
            : null
        }
      />
      <Tile
        label={t('hoje.tile.shipped')}
        value={today.shipped.length}
        note={
          today.shipped.length > 0
            ? t('hoje.tile.shippedKinds', { prs: String(prs), cards: String(cards) })
            : null
        }
      />
    </section>
  );
}
