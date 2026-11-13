import type { TeamToday, TodayBlocker } from '@standcast/orchestrator';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import { useRemindNow, useReopenBlocker, useResolveBlocker } from '../../api/mutations';
import { useSession, useTeamToday } from '../../api/queries';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { useLang, useT } from '../../i18n';
import { PageHeader } from '../../shell/PageHeader';
import { errorMessage } from '../configuracao/labels';
import { Loading } from '../RouteStates';
import { Dailies, type DailyFilter, type RemindStatus } from './DailyCard';
import { DailyDrawer } from './DailyDrawer';
import { formatDay, formatTime } from './format';
import { NeedsYou } from './NeedsYou';
import { SentToday } from './SentToday';
import { ShippedList } from './ShippedList';
import { SummaryTiles } from './SummaryTiles';

function byOpening(a: TodayBlocker, b: TodayBlocker): number {
  return (
    a.openedOn.localeCompare(b.openedOn) ||
    a.author.localeCompare(b.author) ||
    a.text.localeCompare(b.text)
  );
}

function without(record: Record<string, TodayBlocker>, id: string): Record<string, TodayBlocker> {
  const { [id]: _, ...rest } = record;
  return rest;
}

type PendingUpdate = (update: (current: ReadonlySet<string>) => ReadonlySet<string>) => void;

export async function withPending(
  setPending: PendingUpdate,
  id: string,
  run: () => Promise<void>,
): Promise<void> {
  setPending((current) => new Set(current).add(id));
  try {
    await run();
  } finally {
    setPending((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }
}

export function listBlockers(
  blockers: TodayBlocker[],
  resolved: Record<string, TodayBlocker>,
  reopened: Record<string, TodayBlocker>,
): { open: TodayBlocker[]; listed: { blocker: TodayBlocker; resolved: boolean }[] } {
  const known = (list: TodayBlocker[], blocker: TodayBlocker) =>
    list.some((item) => item.id === blocker.id);
  const current = [
    ...blockers,
    ...Object.values(reopened).filter((blocker) => !known(blockers, blocker)),
  ];
  const open = current.filter((blocker) => !resolved[blocker.id]);
  const listed = [
    ...current,
    ...Object.values(resolved).filter((blocker) => !known(current, blocker)),
  ]
    .sort(byOpening)
    .map((blocker) => ({ blocker, resolved: Boolean(resolved[blocker.id]) }));
  return { open, listed };
}

function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const t = useT();
  const status = error instanceof ApiError ? error.status : 0;
  const body =
    status === 403 ? t('hoje.forbidden') : status === 404 ? t('hoje.notFound') : t('error.body');
  return (
    <Card role="alert" className="items-start">
      <h1 className="m-0 font-bold text-[17px]">{t('error.title')}</h1>
      <p className="m-0 text-text2">{body}</p>
      {status === 403 || status === 404 ? null : (
        <Button type="button" variant="outline" onClick={onRetry}>
          {t('error.retry')}
        </Button>
      )}
    </Card>
  );
}

function DigestPill({ today }: { today: TeamToday }) {
  const t = useT();
  const lang = useLang();
  if (today.digest.status === 'failed') {
    return <Badge variant="bad">{t('hoje.digest.failed')}</Badge>;
  }
  if (today.digest.status === 'sent') {
    const time = today.digest.sentAt
      ? formatTime(lang, today.digest.sentAt, today.team.timezone)
      : today.team.digestAt;
    return <Badge variant="ok">{t('hoje.digest.sent', { time })}</Badge>;
  }
  return (
    <Badge variant="outline">{t('hoje.digest.scheduled', { time: today.team.digestAt })}</Badge>
  );
}

function TodayView({ installationId, today }: { installationId: number; today: TeamToday }) {
  const t = useT();
  const lang = useLang();
  const session = useSession();
  const team = today.team.name;
  const resolve = useResolveBlocker(installationId, team);
  const reopen = useReopenBlocker(installationId, team);
  const remind = useRemindNow(installationId, team);
  const [filter, setFilter] = useState<DailyFilter>('all');
  const [viewing, setViewing] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Record<string, TodayBlocker>>({});
  const [reopened, setReopened] = useState<Record<string, TodayBlocker>>({});
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set());
  const [problem, setProblem] = useState<string | null>(null);
  const [reminders, setReminders] = useState<Record<string, RemindStatus>>({});

  const me = session.data?.login.toLowerCase() ?? null;
  const { open, listed } = listBlockers(today.blockers, resolved, reopened);
  const withDaily = new Set(
    today.people.filter((person) => person.daily !== null).map((person) => person.login),
  );

  const onResolve = (blocker: TodayBlocker) => {
    setProblem(null);
    void withPending(setPendingIds, blocker.id, async () => {
      try {
        await resolve.mutateAsync(blocker.id);
        setResolved((current) => ({ ...current, [blocker.id]: blocker }));
        setReopened((current) => without(current, blocker.id));
      } catch (error) {
        setProblem(errorMessage(t, error));
      }
    });
  };

  const onReopen = (blocker: TodayBlocker) => {
    setProblem(null);
    void withPending(setPendingIds, blocker.id, async () => {
      try {
        await reopen.mutateAsync(blocker.id);
        setResolved((current) => without(current, blocker.id));
        setReopened((current) => ({ ...current, [blocker.id]: blocker }));
      } catch (error) {
        setProblem(errorMessage(t, error));
      }
    });
  };

  const onRemind = async (login: string) => {
    setReminders((current) => ({ ...current, [login]: 'pending' }));
    try {
      const { result } = await remind.mutateAsync(login);
      setReminders((current) => ({ ...current, [login]: result }));
    } catch {
      setReminders((current) => ({ ...current, [login]: 'failed' }));
    }
  };

  return (
    <>
      <PageHeader
        context={`${today.team.name} · ${today.team.timezone}`}
        title={formatDay(lang, today.date)}
        actions={
          <>
            <Badge variant="outline">{t('hoje.remindAt', { time: today.team.remindAt })}</Badge>
            <DigestPill today={today} />
          </>
        }
      />
      <SummaryTiles today={{ ...today, blockers: open }} />
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
          <NeedsYou
            today={today}
            blockers={listed}
            canResolve={(blocker) => today.canResolve || blocker.author === me}
            pendingIds={pendingIds}
            problem={problem}
            onResolve={onResolve}
            onReopen={onReopen}
            onView={setViewing}
            hasDaily={(login) => withDaily.has(login)}
          />
          <Dailies
            today={today}
            filter={filter}
            onFilter={setFilter}
            reminders={reminders}
            onRemind={onRemind}
            onView={setViewing}
          />
        </div>
        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-6">
          <ShippedList shipped={today.shipped} />
          <SentToday people={today.people} />
        </aside>
      </div>
      <DailyDrawer
        person={today.people.find((person) => person.login === viewing) ?? null}
        timezone={today.team.timezone}
        onClose={() => setViewing(null)}
      />
    </>
  );
}

export function HojePage({ installationId, team }: { installationId: number; team: string }) {
  const today = useTeamToday(installationId, team);
  if (today.isPending) return <Loading />;
  if (today.isError) {
    if (today.error instanceof ApiError && today.error.status === 401) return <Loading />;
    return <LoadError error={today.error} onRetry={() => void today.refetch()} />;
  }
  return <TodayView installationId={installationId} today={today.data} />;
}
