import { useParams } from '@tanstack/react-router';
import { useCancelAway } from '../../api/mutations';
import { useAwayPeriods, useSession } from '../../api/queries';
import { Button } from '../../components/ui/button';
import { Card, CardDescription, CardTitle } from '../../components/ui/card';
import { useLang, useT } from '../../i18n';
import { AwayForm } from '../away/AwayForm';
import { AwayProblem } from '../away/AwayProblem';
import { formatShortDate } from '../hoje/format';

function AwayList({ installationId }: { installationId: number }) {
  const t = useT();
  const lang = useLang();
  const periods = useAwayPeriods(installationId);
  const cancel = useCancelAway(installationId);
  if (periods.isError) return <p className="m-0 text-muted">{t('away.loadFailed')}</p>;
  const list = periods.data ?? [];
  if (periods.data && list.length === 0) return <p className="m-0 text-muted">{t('away.none')}</p>;
  return (
    <>
      <AwayProblem error={cancel.error} />
      <ul className="m-0 flex list-none flex-col p-0">
        {list.map((period) => (
          <li
            key={period.id}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-border border-b py-2.5 last:border-b-0"
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-medium text-text">
                {t('away.range', {
                  from: formatShortDate(lang, period.from),
                  until: formatShortDate(lang, period.until),
                })}
              </span>
              <span className="font-mono text-[12px] text-muted">
                {t('away.markedBy', { login: period.markedBy })}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={cancel.isPending}
              aria-label={t('away.cancelFor', { login: period.login })}
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

export function AwaySection() {
  const t = useT();
  const session = useSession();
  const params = useParams({ strict: false }) as { installationId?: string | number };
  const fromRoute = params.installationId === undefined ? null : Number(params.installationId);
  const installationId = fromRoute ?? session.data?.installations[0]?.id ?? null;
  if (installationId === null) return null;
  return (
    <Card aria-labelledby="account-away">
      <div className="flex flex-col gap-0.5">
        <CardTitle id="account-away">{t('away.title')}</CardTitle>
        <CardDescription>{t('away.hint')}</CardDescription>
      </div>
      <AwayList installationId={installationId} />
      <AwayForm installationId={installationId} />
    </Card>
  );
}
