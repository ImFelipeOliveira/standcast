import type { TodayBlocker } from '@standcast/orchestrator';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { type MessageKey, useLang, useT } from '../../i18n';
import { cn } from '../../lib/utils';
import { formatShortDate, formatTime, initials } from './format';
import { Avatar, RefLink } from './RefLink';

const REASONS: Record<string, MessageKey> = {
  manager: 'hoje.blocker.reason.manager',
  pull_request: 'hoje.blocker.reason.pull_request',
  card: 'hoje.blocker.reason.card',
};

function CheckIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}

export function Author({ login }: { login: string }) {
  return (
    <span className="ml-auto flex items-center gap-2">
      <Avatar text={initials(login)} small />
      <span className="font-mono text-[12px]">@{login}</span>
    </span>
  );
}

type Props = {
  blocker: TodayBlocker;
  timezone: string;
  today: string;
  resolved: boolean;
  canResolve: boolean;
  pending: boolean;
  onResolve: () => void;
  onReopen: () => void;
  onViewDaily: (() => void) | null;
};

export function BlockerCard({
  blocker,
  timezone,
  today,
  resolved,
  canResolve,
  pending,
  onResolve,
  onReopen,
  onViewDaily,
}: Props) {
  const t = useT();
  const lang = useLang();
  const stuck = blocker.ageDays > 2;
  const reason = blocker.routedTo
    ? Object.hasOwn(REASONS, blocker.routedTo.reason)
      ? t(REASONS[blocker.routedTo.reason] as MessageKey)
      : blocker.routedTo.reason
    : null;
  return (
    <article
      className={cn(
        'flex flex-col gap-2.5 rounded-xl border p-4',
        stuck && !resolved ? 'border-warn-line bg-warn-wash' : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-warn text-on-accent">{t('hoje.blocker.kind')}</Badge>
        {resolved ? (
          <Badge variant="ok">
            <CheckIcon />
            {t('hoje.blocker.resolved')}
          </Badge>
        ) : blocker.ageDays === 0 ? (
          <Badge variant="neutral">{t('hoje.blocker.since')}</Badge>
        ) : (
          <Badge variant="warn">
            {blocker.ageDays === 1
              ? t('hoje.blocker.age.one')
              : t('hoje.blocker.age.other', { days: String(blocker.ageDays) })}
          </Badge>
        )}
        {blocker.recurring ? <Badge variant="neutral">{t('hoje.blocker.recurring')}</Badge> : null}
        {blocker.hint && !resolved ? (
          <Badge variant="ok">
            <CheckIcon />
            {blocker.hint.on === today
              ? t('hoje.blocker.hint', { time: formatTime(lang, blocker.hint.at, timezone) })
              : t('hoje.blocker.hintOn', {
                  date: formatShortDate(lang, blocker.hint.on),
                  time: formatTime(lang, blocker.hint.at, timezone),
                })}
          </Badge>
        ) : null}
        <Author login={blocker.author} />
      </div>
      <p className="m-0 font-medium text-[15px]">{blocker.text}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0 flex-wrap items-center gap-2 text-[13px] text-muted">
          {blocker.ref ? <RefLink refValue={blocker.ref} /> : null}
          {blocker.routedTo && reason ? (
            <span>
              {t('hoje.blocker.routed', {
                logins: blocker.routedTo.logins.map((login) => `@${login}`).join(', '),
                reason,
              })}
            </span>
          ) : null}
        </span>
        <span className="flex flex-wrap gap-2">
          {onViewDaily ? (
            <Button type="button" variant="outline" onClick={onViewDaily}>
              {t('hoje.viewDaily')}
            </Button>
          ) : null}
          {canResolve ? (
            resolved ? (
              <Button type="button" variant="outline" disabled={pending} onClick={onReopen}>
                {t('hoje.blocker.reopen')}
              </Button>
            ) : (
              <Button type="button" disabled={pending} onClick={onResolve}>
                {t('hoje.blocker.resolve')}
              </Button>
            )
          ) : null}
        </span>
      </div>
    </article>
  );
}
