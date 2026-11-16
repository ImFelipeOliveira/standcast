import type { TodayAway } from '@standcast/orchestrator';
import { useState } from 'react';
import { useCancelAway } from '../../api/mutations';
import { useAwayPeriods } from '../../api/queries';
import { Button } from '../../components/ui/button';
import { useLang, useT } from '../../i18n';
import { AwayForm } from '../away/AwayForm';
import { AwayProblem } from '../away/AwayProblem';
import { formatShortDate } from './format';

function UpcomingAway({ installationId, login }: { installationId: number; login: string }) {
  const t = useT();
  const lang = useLang();
  const periods = useAwayPeriods(installationId, login);
  const cancel = useCancelAway(installationId);
  const list = periods.data ?? [];
  if (list.length === 0) return null;
  return (
    <>
      <AwayProblem error={cancel.error} />
      <ul className="m-0 flex list-none flex-col p-0">
        {list.map((period) => (
          <li
            key={period.id}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-border border-b py-2 last:border-b-0"
          >
            <span className="text-muted">
              {t('away.range', {
                from: formatShortDate(lang, period.from),
                until: formatShortDate(lang, period.until),
              })}
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={cancel.isPending}
              aria-label={t('away.cancelFor', { login })}
              onClick={() => cancel.mutate(period.id)}
            >
              {t('away.cancel')}
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}

export function AwayActions({ installationId, login }: { installationId: number; login: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <UpcomingAway installationId={installationId} login={login} />
      <Button
        type="button"
        variant="outline"
        className="self-start"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {t('away.mark')}
        <span className="sr-only"> @{login}</span>
      </Button>
      {open ? (
        <AwayForm installationId={installationId} login={login} onDone={() => setOpen(false)} />
      ) : null}
    </div>
  );
}

function ElevatedAway({
  installationId,
  login,
  away,
}: {
  installationId: number;
  login: string;
  away: TodayAway;
}) {
  const t = useT();
  const lang = useLang();
  const cancel = useCancelAway(installationId);
  return (
    <>
      <span className="text-muted">
        {t('away.stateUntil', { date: formatShortDate(lang, away.until) })}
      </span>
      <AwayProblem error={cancel.error} />
      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={cancel.isPending}
        aria-label={t('away.cancelFor', { login })}
        onClick={() => cancel.mutate(away.id)}
      >
        {t('away.cancel')}
      </Button>
    </>
  );
}

export function AwayState({
  installationId,
  login,
  away,
  elevated,
}: {
  installationId: number;
  login: string;
  away: TodayAway | null;
  elevated: boolean;
}) {
  const t = useT();
  if (!elevated || !away) return <span className="text-muted">{t('away.state')}</span>;
  return <ElevatedAway installationId={installationId} login={login} away={away} />;
}
