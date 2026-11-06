import type { SetupStatus } from '@standcast/orchestrator';
import { type FormEvent, type ReactNode, useId, useState } from 'react';
import { apiUrl } from '../../api/client';
import { useLinkGoogleChatSpace, useUnlinkGoogleChatSpace } from '../../api/mutations';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { useT } from '../../i18n';
import {
  errorMessage,
  linkErrorMessage,
  reasonText,
  TRACKER_NOTICES,
  type Translate,
} from './labels';

type LinearState = 'done' | 'todo' | 'error';

export const usesLinear = (status: SetupStatus) =>
  status.teams.some((team) => team.tracker === 'linear');

export const linearState = (status: SetupStatus): LinearState => {
  if (!status.linear.connected) return 'todo';
  return status.linear.invalid ? 'error' : 'done';
};

export const chatConnected = (status: SetupStatus) =>
  status.slack.connected || status.googleChat.spaces.length > 0;

export function setupProgress(status: SetupStatus): { done: number; total: number } {
  const steps = [
    true,
    chatConnected(status),
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

type GoogleChatSpace = SetupStatus['googleChat']['spaces'][number];
type CopyState = 'idle' | 'copied' | 'failed';

function SpaceRow({
  t,
  space,
  admin,
  unlinking,
  onUnlink,
}: {
  t: Translate;
  space: GoogleChatSpace;
  admin: boolean;
  unlinking: boolean;
  onUnlink: (space: GoogleChatSpace) => void;
}) {
  const [copy, setCopy] = useState<CopyState>('idle');
  const copyName = async () => {
    try {
      await navigator.clipboard.writeText(space.name);
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  };
  return (
    <li className="flex flex-col gap-1.5 rounded-[10px] border border-border px-3 py-2.5">
      <span className="break-words font-semibold text-[13px]">{space.displayName}</span>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-[1_1_140px] select-all break-all font-mono text-[12px] text-muted">
          {space.name}
        </code>
        <Button type="button" variant="outline" size="sm" onClick={() => void copyName()}>
          {copy === 'copied' ? t('setup.secret.copied') : t('setup.secret.copy')}
          <span className="sr-only"> {space.name}</span>
        </Button>
        {admin ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={unlinking}
            onClick={() => onUnlink(space)}
          >
            {t('setup.googleChat.unlink')}
            <span className="sr-only"> {space.displayName}</span>
          </Button>
        ) : null}
      </div>
      {copy === 'failed' ? (
        <p role="alert" className="m-0 text-[12px] text-bad-ink">
          {t('setup.secret.copyFailed')}
        </p>
      ) : null}
    </li>
  );
}

function LinkSpaceForm({
  t,
  installationId,
  onLinked,
}: {
  t: Translate;
  installationId: number;
  onLinked: (displayName: string) => void;
}) {
  const id = useId();
  const link = useLinkGoogleChatSpace(installationId);
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = code.trim();
    if (!value) return;
    setProblem(null);
    try {
      const linked = await link.mutateAsync(value);
      setCode('');
      onLinked(linked.displayName);
    } catch (error) {
      setProblem(linkErrorMessage(t, error));
    }
  };

  return (
    <form className="flex flex-col gap-1.5" onSubmit={(event) => void submit(event)}>
      <Label htmlFor={`${id}-code`}>{t('setup.googleChat.code')}</Label>
      <p id={`${id}-hint`} className="m-0 text-[12px] text-muted">
        {t('setup.googleChat.instructions')}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={`${id}-code`}
          className="flex-[1_1_120px] font-mono uppercase"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          required
          maxLength={32}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-describedby={problem ? `${id}-hint ${id}-problem` : `${id}-hint`}
          aria-invalid={problem ? true : undefined}
        />
        <Button type="submit" disabled={link.isPending}>
          {t('setup.googleChat.link')}
        </Button>
      </div>
      {problem ? (
        <p id={`${id}-problem`} role="alert" className="m-0 text-[13px] text-bad-ink">
          {problem}
        </p>
      ) : null}
    </form>
  );
}

function GoogleChatCard({ t, status }: { t: Translate; status: SetupStatus }) {
  const { googleChat } = status;
  const unlink = useUnlinkGoogleChatSpace(status.installationId);
  const [linked, setLinked] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const connected = googleChat.spaces.length > 0;

  const unlinkSpace = (space: GoogleChatSpace) => {
    setProblem(null);
    setLinked(null);
    unlink.mutate(space.name, { onError: (error) => setProblem(errorMessage(t, error)) });
  };

  const badge = !googleChat.available ? (
    <Badge variant="neutral">{t('setup.badge.unavailable')}</Badge>
  ) : connected ? (
    <Badge variant="ok">{t('setup.badge.connected')}</Badge>
  ) : (
    <Badge variant="neutral">{t('setup.badge.optional')}</Badge>
  );

  if (!googleChat.available && !connected) {
    return (
      <ConnectionCard
        title={t('setup.googleChat.title')}
        badge={badge}
        description={t('setup.googleChat.unavailable')}
      />
    );
  }

  return (
    <ConnectionCard
      title={t('setup.googleChat.title')}
      badge={badge}
      description={
        googleChat.available ? t('setup.googleChat.description') : t('setup.googleChat.unavailable')
      }
    >
      {connected ? (
        <div className="flex flex-col gap-1.5">
          <h4 className="m-0 font-semibold text-[13px] text-text2">
            {t('setup.googleChat.spaces')}
          </h4>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {googleChat.spaces.map((space) => (
              <SpaceRow
                key={space.name}
                t={t}
                space={space}
                admin={status.admin}
                unlinking={unlink.isPending && unlink.variables === space.name}
                onUnlink={unlinkSpace}
              />
            ))}
          </ul>
        </div>
      ) : (
        <Note>{t('setup.googleChat.none')}</Note>
      )}
      {linked ? (
        <p role="status" className="m-0 text-[13px] text-ok-ink">
          {t('setup.googleChat.linked', { space: linked })}
        </p>
      ) : null}
      {problem ? (
        <p role="alert" className="m-0 text-[13px] text-bad-ink">
          {problem}
        </p>
      ) : null}
      {status.admin && googleChat.available ? (
        <LinkSpaceForm
          t={t}
          installationId={status.installationId}
          onLinked={(displayName) => {
            setProblem(null);
            setLinked(displayName);
          }}
        />
      ) : null}
      {status.admin ? null : <Note>{t('setup.googleChat.adminOnly')}</Note>}
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
        <GoogleChatCard t={t} status={status} />
        <LinearCard t={t} status={status} />
      </div>
    </section>
  );
}
