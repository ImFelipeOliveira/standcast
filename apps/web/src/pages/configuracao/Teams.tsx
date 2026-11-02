import type { SetupStatus } from '@standcast/orchestrator';
import { Badge } from '../../components/ui/badge';
import { AlertTriangleIcon } from '../../components/ui/icons';
import { useT } from '../../i18n';
import { cn } from '../../lib/utils';
import { noticeText, type TeamNotice, type Translate } from './labels';

type Team = SetupStatus['teams'][number];

const TRACKER_LABELS = {
  linear: 'setup.teams.tracker.linear',
  jira: 'setup.teams.tracker.jira',
} as const;

function NoticeLine({ text }: { text: string }) {
  return (
    <p role="status" className="m-0 flex items-start gap-2 text-[13px] text-warn-ink">
      <AlertTriangleIcon className="mt-0.5 shrink-0" />
      <span>{text}</span>
    </p>
  );
}

function TeamCard({ t, team, notices }: { t: Translate; team: Team; notices: string[] }) {
  const warn = notices.length > 0;
  return (
    <article
      className={cn(
        'flex flex-col gap-2 rounded-xl border p-4',
        warn ? 'border-warn-line bg-warn-wash' : 'border-border',
      )}
    >
      <h3 className="m-0 font-bold text-sm">{team.name}</h3>
      {team.channel || team.tracker ? (
        <span className="flex flex-wrap gap-1.5">
          {team.channel ? (
            <Badge variant="neutral" className="font-medium font-mono">
              {team.channel}
            </Badge>
          ) : null}
          {team.tracker ? (
            <Badge variant="neutral" className="font-medium">
              {t(TRACKER_LABELS[team.tracker])}
            </Badge>
          ) : null}
        </span>
      ) : null}
      <span className="text-[13px] text-muted">
        {t('setup.teams.times', { remindAt: team.remindAt, digestAt: team.digestAt })}
      </span>
      {notices.map((text) => (
        <NoticeLine key={text} text={text} />
      ))}
    </article>
  );
}

export function LooseNotices({ notices }: { notices: TeamNotice[] }) {
  const t = useT();
  const texts = notices.map((notice) => noticeText(t, notice)).filter((text) => text !== null);
  if (texts.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-warn-line bg-warn-wash p-4">
      {texts.map((text) => (
        <NoticeLine key={text} text={text} />
      ))}
    </div>
  );
}

export function Teams({ teams, notices }: { teams: Team[]; notices: TeamNotice[] }) {
  const t = useT();
  if (teams.length === 0) return null;
  return (
    <div className="flex flex-col gap-2.5">
      <h3 className="m-0 font-semibold text-[11px] text-muted uppercase tracking-[0.06em]">
        {t('setup.teams.title')}
      </h3>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3">
        {teams.map((team) => (
          <TeamCard
            key={team.name}
            t={t}
            team={team}
            notices={notices
              .filter((notice) => notice.team === team.name)
              .map((notice) => noticeText(t, notice))
              .filter((text) => text !== null)}
          />
        ))}
      </div>
    </div>
  );
}
