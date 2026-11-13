import type { OrgOpenBlocker, OrgResolvedBlocker } from '@standcast/orchestrator';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import { useReopenOrgBlocker, useResolveOrgBlocker } from '../../api/mutations';
import { useOrgBlockers, useTeamsSummary } from '../../api/queries';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { useLang, useT } from '../../i18n';
import { cn } from '../../lib/utils';
import { PageHeader } from '../../shell/PageHeader';
import { BlockerCard } from '../hoje/BlockerCard';
import { formatShortDate } from '../hoje/format';
import { RefLink } from '../hoje/RefLink';
import { Loading } from '../RouteStates';

type Tab = 'open' | 'resolved';

function Tabs({
  installationId,
  tab,
  team,
  openCount,
  resolvedCount,
}: {
  installationId: number;
  tab: Tab;
  team?: string;
  openCount: number;
  resolvedCount: number;
}) {
  const t = useT();
  const item = (value: Tab, label: string, count: number) => (
    <Link
      to="/orgs/$installationId/blockers"
      params={{ installationId }}
      search={{
        ...(value === 'resolved' ? { state: 'resolved' as const } : {}),
        ...(team ? { team } : {}),
      }}
      activeOptions={{ exact: true, includeSearch: true }}
      aria-current={tab === value ? 'page' : undefined}
      className={cn(
        'inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 font-medium text-[13px] no-underline desk:min-h-8',
        tab === value
          ? 'bg-surface font-semibold text-text ring-1 ring-border-strong'
          : 'text-muted hover:bg-hover hover:text-text',
      )}
    >
      {label}
      <span className="font-mono text-[11px] text-muted">{count}</span>
    </Link>
  );
  return (
    <nav aria-label={t('blockers.state')} className="flex gap-1 rounded-lg bg-hover p-0.5">
      {item('open', t('blockers.open'), openCount)}
      {item('resolved', t('blockers.resolved'), resolvedCount)}
    </nav>
  );
}

function TeamFilter({
  installationId,
  tab,
  team,
  teams,
}: {
  installationId: number;
  tab: Tab;
  team?: string;
  teams: string[];
}) {
  const t = useT();
  const navigate = useNavigate();
  const summary = useTeamsSummary(installationId, true);
  const options = summary.data ? summary.data.map((entry) => entry.team) : teams;
  if (options.length < 2 && !team) return null;
  return (
    <>
      <label htmlFor="blockers-team" className="sr-only">
        {t('blockers.team')}
      </label>
      <select
        id="blockers-team"
        value={team ?? ''}
        onChange={(event) =>
          void navigate({
            to: '/orgs/$installationId/blockers',
            params: { installationId },
            search: {
              ...(tab === 'resolved' ? { state: 'resolved' as const } : {}),
              ...(event.target.value ? { team: event.target.value } : {}),
            },
          })
        }
        className="min-h-11 rounded-md border border-border-strong bg-surface px-2.5 text-base text-text desk:min-h-8 desk:text-[13px]"
      >
        <option value="">{t('blockers.allTeams')}</option>
        {options.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </>
  );
}

export type Kept = { blocker: OrgOpenBlocker; settled: boolean };

export function withKept(
  open: OrgOpenBlocker[],
  kept: Map<string, Kept>,
): { blocker: OrgOpenBlocker; resolved: boolean }[] {
  const ids = new Set(open.map((blocker) => blocker.id));
  return [
    ...open.map((blocker) => ({ blocker, resolved: kept.get(blocker.id)?.settled === false })),
    ...[...kept.values()]
      .filter((entry) => !ids.has(entry.blocker.id))
      .map((entry) => ({ blocker: entry.blocker, resolved: true })),
  ].sort((a, b) => a.blocker.openedOn.localeCompare(b.blocker.openedOn));
}

function without(current: Map<string, Kept>, id: string): Map<string, Kept> {
  const next = new Map(current);
  next.delete(id);
  return next;
}

function FailedAlert() {
  const t = useT();
  return (
    <p role="alert" className="m-0 text-[13px] text-bad-ink">
      {t('blockers.failed')}
    </p>
  );
}

function OpenList({
  installationId,
  blockers,
}: {
  installationId: number;
  blockers: OrgOpenBlocker[];
}) {
  const t = useT();
  const resolve = useResolveOrgBlocker(installationId);
  const reopen = useReopenOrgBlocker(installationId);
  const [kept, setKept] = useState<Map<string, Kept>>(new Map());
  const [failed, setFailed] = useState(false);
  const listed = withKept(blockers, kept);
  if (listed.length === 0) return <p className="m-0 text-muted">{t('blockers.emptyOpen')}</p>;
  const run = (blocker: OrgOpenBlocker, done: boolean) => {
    setFailed(false);
    if (done) {
      setKept((current) => new Map(current).set(blocker.id, { blocker, settled: false }));
    }
    const mutation = done ? resolve : reopen;
    mutation.mutate(blocker.id, {
      onSuccess: () => {
        setKept((current) =>
          done
            ? new Map(current).set(blocker.id, { blocker, settled: true })
            : without(current, blocker.id),
        );
      },
      onError: () => {
        setFailed(true);
        if (done) setKept((current) => without(current, blocker.id));
      },
    });
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[12px] text-muted">{t('blockers.openNote')}</p>
      {failed ? <FailedAlert /> : null}
      {listed.map(({ blocker, resolved }) => (
        <BlockerCard
          key={blocker.id}
          blocker={blocker}
          teams={blocker.teams}
          timezone={blocker.timezone}
          today={blocker.today}
          resolved={resolved}
          canResolve={blocker.canResolve}
          pending={resolve.isPending || reopen.isPending}
          onResolve={() => run(blocker, true)}
          onReopen={() => run(blocker, false)}
          onViewDaily={null}
        />
      ))}
    </div>
  );
}

function ResolvedList({
  installationId,
  blockers,
}: {
  installationId: number;
  blockers: OrgResolvedBlocker[];
}) {
  const t = useT();
  const lang = useLang();
  const reopen = useReopenOrgBlocker(installationId);
  if (blockers.length === 0) return <p className="m-0 text-muted">{t('blockers.emptyResolved')}</p>;
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[12px] text-muted">{t('blockers.resolvedNote')}</p>
      <Card className="gap-0 p-0">
        <ul className="m-0 list-none p-0">
          {blockers.map((blocker, index) => (
            <li
              key={blocker.id}
              className={cn(
                'flex flex-col gap-1.5 px-4 py-3',
                index > 0 ? 'border-border border-t' : null,
              )}
            >
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant="ok">{t('hoje.blocker.resolved')}</Badge>
                {blocker.teams.map((name) => (
                  <Badge key={name} variant="outline">
                    {name}
                  </Badge>
                ))}
                <span className="ml-auto font-mono text-[12px] text-muted">@{blocker.author}</span>
              </span>
              <span className="text-[14px]">{blocker.text}</span>
              <span className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
                {blocker.ref ? <RefLink refValue={blocker.ref} /> : null}
                <span>
                  {blocker.resolvedBy
                    ? t('blockers.resolvedBy', {
                        date: formatShortDate(lang, blocker.resolvedOn),
                        login: blocker.resolvedBy,
                      })
                    : t('blockers.resolvedOn', { date: formatShortDate(lang, blocker.resolvedOn) })}
                </span>
                {blocker.canResolve ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="ml-auto"
                    disabled={reopen.isPending}
                    onClick={() => reopen.mutate(blocker.id)}
                  >
                    {t('hoje.blocker.reopen')}
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function ByTeam({ blockers }: { blockers: OrgOpenBlocker[] }) {
  const t = useT();
  const counts = new Map<string, number>();
  for (const blocker of blockers) {
    for (const team of blocker.teams) counts.set(team, (counts.get(team) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  return (
    <Card className="gap-2 px-4 py-3">
      <h2 className="m-0 font-semibold text-[13px]">{t('blockers.byTeam')}</h2>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {[...counts.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([team, count]) => (
            <li key={team} className="flex justify-between text-[13px]">
              <span>{team}</span>
              <span className="font-mono text-muted">{count}</span>
            </li>
          ))}
      </ul>
    </Card>
  );
}

export function BlockersPage({
  installationId,
  tab,
  team,
}: {
  installationId: number;
  tab: Tab;
  team?: string;
}) {
  const t = useT();
  const query = useOrgBlockers(installationId, team);
  if (query.isPending) return <Loading />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 401) return <Loading />;
    return (
      <>
        <PageHeader title={t('nav.blockers')} />
        <Card role="alert" className="items-start">
          <h2 className="m-0 font-bold text-[17px]">{t('error.title')}</h2>
          <p className="m-0 text-text2">{t('error.body')}</p>
          <Button type="button" variant="outline" onClick={() => void query.refetch()}>
            {t('error.retry')}
          </Button>
        </Card>
      </>
    );
  }
  const data = query.data;
  const teams = [
    ...new Set([...data.open, ...data.resolved].flatMap((blocker) => blocker.teams)),
  ].sort((a, b) => a.localeCompare(b));
  return (
    <>
      <PageHeader
        context={t('blockers.context')}
        title={t('nav.blockers')}
        actions={
          <>
            <Tabs
              installationId={installationId}
              tab={tab}
              team={team}
              openCount={data.open.length}
              resolvedCount={data.resolved.length}
            />
            <TeamFilter installationId={installationId} tab={tab} team={team} teams={teams} />
          </>
        }
      />
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
          {tab === 'open' ? (
            <OpenList installationId={installationId} blockers={data.open} />
          ) : (
            <ResolvedList installationId={installationId} blockers={data.resolved} />
          )}
        </div>
        {tab === 'open' ? (
          <aside className="flex min-w-0 flex-[1_1_260px] flex-col gap-4">
            <ByTeam blockers={data.open} />
          </aside>
        ) : null}
      </div>
    </>
  );
}
