import { useState } from 'react';
import { useCancelAway } from '../../api/mutations';
import { useAwayPeriods } from '../../api/queries';
import { Button } from '../../components/ui/button';
import { useLang, useT } from '../../i18n';
import { AwayForm } from '../away/AwayForm';
import { formatShortDate } from './format';

export function AwayActions({ installationId, login }: { installationId: number; login: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
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
  date,
}: {
  installationId: number;
  login: string;
  date: string;
}) {
  const t = useT();
  const lang = useLang();
  const periods = useAwayPeriods(installationId, login);
  const cancel = useCancelAway(installationId);
  const current = periods.data?.find((period) => period.from <= date && date <= period.until);
  return (
    <>
      <span className="text-muted">
        {current
          ? t('away.stateUntil', { date: formatShortDate(lang, current.until) })
          : t('away.state')}
      </span>
      {current ? (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={cancel.isPending}
          aria-label={t('away.cancelFor', { login })}
          onClick={() => cancel.mutate(current.id)}
        >
          {t('away.cancel')}
        </Button>
      ) : null}
    </>
  );
}

export function AwayState({
  installationId,
  login,
  date,
  elevated,
}: {
  installationId: number;
  login: string;
  date: string;
  elevated: boolean;
}) {
  const t = useT();
  if (!elevated) return <span className="text-muted">{t('away.state')}</span>;
  return <ElevatedAway installationId={installationId} login={login} date={date} />;
}
