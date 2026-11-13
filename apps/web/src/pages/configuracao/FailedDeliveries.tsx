import type { SetupStatus } from '@standcast/orchestrator';
import { Card, CardTitle } from '../../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { useLang, useT } from '../../i18n';
import { FAILURE_KIND_LABELS, failureReason, formatDate, type Translate } from './labels';

function Reason({ t, error }: { t: Translate; error: string }) {
  const reason = failureReason(t, error);
  return (
    <div className="flex flex-col items-start gap-1">
      <code className="rounded-md bg-bad-soft px-[7px] py-0.5 font-mono text-[12px] text-bad-ink">
        {reason.code}
      </code>
      {reason.text ? (
        <span>
          {reason.text}
          {reason.detail ? (
            <>
              {' '}
              <code className="font-mono text-[12px]">{reason.detail}</code>
            </>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

function Subtitle({ children }: { children: string }) {
  return (
    <h3 className="m-0 font-semibold text-[11px] text-muted uppercase tracking-[0.06em]">
      {children}
    </h3>
  );
}

export function FailedDeliveries({ status }: { status: SetupStatus }) {
  const t = useT();
  const lang = useLang();
  const { teamFailures, personFailures } = status;
  return (
    <Card aria-labelledby="setup-failed">
      <CardTitle id="setup-failed">{t('setup.failed.title')}</CardTitle>
      {teamFailures.length === 0 && personFailures.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">{t('setup.failed.none')}</p>
      ) : null}
      {teamFailures.length > 0 ? (
        <>
          <Subtitle>{t('setup.failed.teamMessages')}</Subtitle>
          <Table className="text-[13px]" label={t('setup.failed.teamMessages')}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{t('setup.failed.team')}</TableHead>
                <TableHead scope="col">{t('setup.failed.when')}</TableHead>
                <TableHead scope="col">{t('setup.failed.delivery')}</TableHead>
                <TableHead scope="col">{t('setup.failed.error')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teamFailures.map((failure) => (
                <TableRow key={`${failure.kind}:${failure.team}:${failure.date}`}>
                  <TableCell>{failure.team}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono">
                    {formatDate(lang, failure.at)}
                  </TableCell>
                  <TableCell>{t(FAILURE_KIND_LABELS[failure.kind])}</TableCell>
                  <TableCell>
                    <Reason t={t} error={failure.error} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      ) : null}
      {personFailures.length > 0 ? (
        <>
          <Subtitle>{t('setup.failed.directMessages')}</Subtitle>
          <Table className="text-[13px]" label={t('setup.failed.directMessages')}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{t('setup.failed.delivery')}</TableHead>
                <TableHead scope="col">{t('setup.failed.lastAt')}</TableHead>
                <TableHead scope="col">{t('setup.failed.count')}</TableHead>
                <TableHead scope="col">{t('setup.failed.error')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {personFailures.map((failure) => (
                <TableRow key={`${failure.kind}:${failure.error}`}>
                  <TableCell>{t(FAILURE_KIND_LABELS[failure.kind])}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono">
                    {formatDate(lang, failure.lastAt)}
                  </TableCell>
                  <TableCell className="font-mono">{failure.count}</TableCell>
                  <TableCell>
                    <Reason t={t} error={failure.error} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      ) : null}
    </Card>
  );
}
