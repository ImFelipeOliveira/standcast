import type { TeamToday, TodayBlocker } from '@standcast/orchestrator';
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { useT } from '../../i18n';
import { BlockerCard } from './BlockerCard';
import { keyed } from './format';
import { SupportCard } from './SupportCard';

type Props = {
  today: TeamToday;
  blockers: { blocker: TodayBlocker; resolved: boolean }[];
  canResolve: (blocker: TodayBlocker) => boolean;
  pendingId: string | null;
  problem: string | null;
  onResolve: (blocker: TodayBlocker) => void;
  onReopen: (blocker: TodayBlocker) => void;
  onView: (login: string) => void;
  hasDaily: (login: string) => boolean;
};

export function NeedsYou({
  today,
  blockers,
  canResolve,
  pendingId,
  problem,
  onResolve,
  onReopen,
  onView,
  hasDaily,
}: Props) {
  const t = useT();
  const view = (login: string) => (hasDaily(login) ? () => onView(login) : null);
  return (
    <Card aria-labelledby="hoje-needs">
      <CardHeader>
        <CardTitle id="hoje-needs">{t('hoje.needs.title')}</CardTitle>
        <CardDescription>{t('hoje.needs.subtitle')}</CardDescription>
      </CardHeader>
      {problem ? (
        <p role="alert" className="m-0 text-[13px] text-bad-ink">
          {problem}
        </p>
      ) : null}
      {blockers.length === 0 && today.support.length === 0 ? (
        <p className="m-0 text-muted">{t('hoje.needs.empty')}</p>
      ) : null}
      {blockers.map(({ blocker, resolved }) => (
        <BlockerCard
          key={blocker.id}
          blocker={blocker}
          timezone={today.team.timezone}
          today={today.date}
          resolved={resolved}
          canResolve={canResolve(blocker)}
          pending={pendingId === blocker.id}
          onResolve={() => onResolve(blocker)}
          onReopen={() => onReopen(blocker)}
          onViewDaily={view(blocker.author)}
        />
      ))}
      {keyed(today.support, (support) => `${support.author}:${support.text}`).map(
        ({ key, item: support }) => (
          <SupportCard
            key={key}
            support={support}
            date={today.date}
            onViewDaily={view(support.author)}
          />
        ),
      )}
    </Card>
  );
}
