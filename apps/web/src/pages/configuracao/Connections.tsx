import type { SetupStatus } from '@standcast/orchestrator';
import type { ReactNode } from 'react';
import { apiUrl } from '../../api/client';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { useT } from '../../i18n';
import { reasonText, TRACKER_NOTICES, type Translate } from './labels';

type LinearState = 'done' | 'todo' | 'error';

export const usesLinear = (status: SetupStatus) =>
  status.teams.some((team) => team.tracker === 'linear');

export const linearState = (status: SetupStatus): LinearState => {
  if (!status.linear.connected) return 'todo';
  return status.linear.invalid ? 'error' : 'done';
};

export function setupProgress(status: SetupStatus): { done: number; total: number } {
  const steps = [
    true,
    status.slack.connected,
    status.config.status === 'configured',
    ...(usesLinear(status) ? [linearState(status) === 'done'] : []),
  ];
  return { done: steps.filter(Boolean).length, total: steps.length };
}

const connectUrl = (provider: 'slack' | 'linear', installationId: number) =>
  `${apiUrl}/connect/${provider}?installation_id=${installationId}`;

function ConnectionCard({
  title,
  badge,
  description,
  action,
  children,
}: {
  title: string;
  badge: ReactNode;
  description: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <article className="flex flex-col gap-2.5 rounded-[14px] border border-border bg-surface px-5 py-[18px]">
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 font-bold text-[15px]">{title}</h3>
        {badge}
      </div>
      <p className="m-0 text-[13px] text-muted">{description}</p>
      {children}
      {action ? <div className="self-start">{action}</div> : null}
    </article>
  );
}

function LinkButton({
  href,
  primary,
  children,
}: {
  href: string;
  primary?: boolean;
  children: ReactNode;
}) {
  return (
    <Button asChild variant={primary ? 'default' : 'outline'}>
      <a href={href}>{children}</a>
    </Button>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[12px] text-muted">{children}</p>;
}

function GithubCard({ t, status }: { t: Translate; status: SetupStatus }) {
  return (
    <ConnectionCard
      title={t('setup.github.title')}
      badge={<Badge variant="ok">{t('setup.badge.installed')}</Badge>}
      description={t('setup.github.installed', { owner: status.owner })}
    >
      {status.accessWarning ? (
        <Alert variant="warn" role="status">
          <AlertTitle>{reasonText(t, status.accessWarning)}</AlertTitle>
          <AlertDescription>{t('setup.accessWarning')}</AlertDescription>
        </Alert>
      ) : null}
    </ConnectionCard>
  );
}

function SlackCard({ t, status }: { t: Translate; status: SetupStatus }) {
  const href = connectUrl('slack', status.installationId);
  const { slack } = status;
  return (
    <ConnectionCard
      title={t('setup.slack.title')}
      badge={
        slack.connected ? (
          <Badge variant="ok">{t('setup.badge.connected')}</Badge>
        ) : (
          <Badge variant="neutral">{t('setup.badge.todo')}</Badge>
        )
      }
      description={
        slack.connected
          ? t('setup.slack.connectedTo', { workspace: slack.workspace })
          : t('setup.slack.description')
      }
      action={
        status.admin ? (
          <LinkButton href={href} primary={!slack.connected}>
            {slack.connected ? t('setup.slack.reconnect') : t('setup.slack.connect')}
          </LinkButton>
        ) : null
      }
    >
      {status.admin || slack.connected ? null : <Note>{t('setup.slack.adminOnly')}</Note>}
    </ConnectionCard>
  );
}

function LinearCard({ t, status }: { t: Translate; status: SetupStatus }) {
  const href = connectUrl('linear', status.installationId);
  const { linear } = status;
  const state = linearState(status);
  const badge =
    state === 'error' ? (
      <Badge variant="bad">{t('setup.badge.needsAttention')}</Badge>
    ) : !usesLinear(status) ? (
      <Badge variant="neutral">{t('setup.badge.optional')}</Badge>
    ) : state === 'done' ? (
      <Badge variant="ok">{t('setup.badge.connected')}</Badge>
    ) : (
      <Badge variant="neutral">{t('setup.badge.todo')}</Badge>
    );
  const action = !status.admin ? null : state === 'done' ? (
    <LinkButton href={href}>{t('setup.linear.reconnect')}</LinkButton>
  ) : state === 'todo' ? (
    <LinkButton href={href} primary>
      {t('setup.linear.connect')}
    </LinkButton>
  ) : null;
  return (
    <ConnectionCard
      title={t('setup.linear.title')}
      badge={badge}
      description={
        linear.connected
          ? t('setup.linear.connected', { workspace: linear.workspace })
          : t('setup.linear.description')
      }
      action={action}
    >
      {linear.connected && linear.invalid ? (
        <Alert variant="destructive" role="status">
          <AlertTitle>{t('setup.linear.stopped')}</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            <p>{t('setup.linear.invalid', { workspace: linear.workspace })}</p>
            {status.admin ? (
              <Button asChild variant="destructive">
                <a href={href}>{t('setup.linear.reconnect')}</a>
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {status.trackerNotices.map((notice) => (
        <Alert key={notice} variant="warn" role="status">
          <AlertTitle>{t(TRACKER_NOTICES[notice])}</AlertTitle>
        </Alert>
      ))}
      {status.admin || state === 'done' ? null : <Note>{t('setup.linear.adminOnly')}</Note>}
    </ConnectionCard>
  );
}

export function Connections({ status }: { status: SetupStatus }) {
  const t = useT();
  return (
    <section aria-labelledby="setup-connections" className="flex flex-col gap-3">
      <h2 id="setup-connections" className="m-0 font-bold text-[17px]">
        {t('setup.connections')}
      </h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
        <GithubCard t={t} status={status} />
        <SlackCard t={t} status={status} />
        <LinearCard t={t} status={status} />
      </div>
    </section>
  );
}
