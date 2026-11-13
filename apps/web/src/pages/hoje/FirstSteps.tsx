import type { SetupStatus, TeamToday } from '@standcast/orchestrator';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { type MessageKey, useLang, useT } from '../../i18n';
import { docsUrl } from '../../lib/links';
import { cn } from '../../lib/utils';

type Step = {
  title: MessageKey;
  body: MessageKey;
  done: boolean;
  unknown?: MessageKey;
  retry?: () => void;
  link?: { href: string; label: MessageKey; external?: boolean };
};

export function chatConnectedFor(
  setup: Pick<SetupStatus, 'slack' | 'googleChat' | 'teams'> | undefined,
  today: TeamToday,
): boolean | null {
  if (!setup) return null;
  if (today.chat?.provider !== 'google-chat') return setup.slack.connected;
  const channel = setup.teams.find((team) => team.name === today.team.name)?.channel;
  return setup.googleChat.spaces.some((space) => space.name === channel);
}

export function FirstSteps({
  installationId,
  today,
  chatConnected,
  onRetryChat,
}: {
  installationId: number;
  today: TeamToday;
  chatConnected: boolean | null;
  onRetryChat?: () => void;
}) {
  const t = useT();
  const lang = useLang();
  if (today.digest.everSent !== false) return null;
  const googleChat = today.chat?.provider === 'google-chat';
  const steps: Step[] = [
    { title: 'firstSteps.install', body: 'firstSteps.installBody', done: true },
    { title: 'firstSteps.config', body: 'firstSteps.configBody', done: true },
    {
      title: googleChat ? 'firstSteps.chatGoogle' : 'firstSteps.chatSlack',
      body: googleChat ? 'firstSteps.chatGoogleBody' : 'firstSteps.chatSlackBody',
      done: chatConnected === true,
      unknown:
        chatConnected === null
          ? onRetryChat
            ? 'firstSteps.unchecked'
            : 'firstSteps.checking'
          : undefined,
      retry: chatConnected === null ? onRetryChat : undefined,
      link:
        chatConnected === false
          ? { href: `/orgs/${installationId}/settings`, label: 'firstSteps.openSettings' }
          : undefined,
    },
    {
      title: 'firstSteps.daily',
      body: 'firstSteps.dailyBody',
      done: today.everSubmitted,
      link: { href: docsUrl(lang), label: 'firstSteps.openDocs', external: true },
    },
    { title: 'firstSteps.digest', body: 'firstSteps.digestBody', done: false },
  ];
  const done = steps.filter((step) => step.done).length;
  return (
    <Card className="gap-4 p-5" aria-labelledby="first-steps-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="first-steps-title" className="m-0 font-semibold text-[17px]">
          {t('firstSteps.title')}
        </h2>
        <span className="font-mono text-[13px] text-muted">
          {t('firstSteps.progress', { done: String(done), total: String(steps.length) })}
        </span>
      </div>
      <p className="m-0 text-[13px] text-text2">{t('firstSteps.intro')}</p>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {steps.map((step, index) => (
          <li key={step.title} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={cn(
                'flex size-7 flex-none items-center justify-center rounded-full font-mono font-semibold text-[12px]',
                step.done ? 'bg-accent text-on-accent' : 'bg-hover text-text2',
              )}
            >
              {index + 1}
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-[14px]">{t(step.title)}</span>
                <Badge variant={step.done ? 'ok' : 'neutral'}>
                  {step.done
                    ? t('firstSteps.done')
                    : step.unknown
                      ? t(step.unknown)
                      : t('firstSteps.pending')}
                </Badge>
              </span>
              <span className="text-[13px] text-text2">
                {t(step.body, { time: today.team.digestAt })}
              </span>
              {step.link && !step.done ? (
                <a
                  href={step.link.href}
                  className="inline-flex min-h-11 items-center self-start font-medium text-[13px] text-accent-text underline underline-offset-4 desk:min-h-0"
                  {...(step.link.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                >
                  {t(step.link.label)}
                  {step.link.external ? (
                    <span className="sr-only"> {t('firstSteps.newTab')}</span>
                  ) : null}
                </a>
              ) : null}
              {step.retry ? (
                <Button
                  type="button"
                  variant="link"
                  onClick={step.retry}
                  className="min-h-11 self-start text-[13px] desk:min-h-0"
                >
                  {t('error.retry')}
                </Button>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
