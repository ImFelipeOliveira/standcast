import type { TeamReportView } from '@standcast/orchestrator';
import { type FormEvent, useId, useState } from 'react';
import {
  type LlmSettingsInput,
  type TeamReportInput,
  type TeamReportSaved,
  useRemoveLlmSettings,
  useRemoveTeamReport,
  useSaveLlmSettings,
  useSaveTeamReport,
} from '../../api/mutations';
import { useReportSettings } from '../../api/queries';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Checkbox } from '../../components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { type MessageKey, useT } from '../../i18n';
import { Loading } from '../RouteStates';
import { errorMessage } from './labels';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_KEYS = Object.fromEntries(WEEKDAYS.map((day) => [day, `report.day.${day}`])) as Record<
  (typeof WEEKDAYS)[number],
  MessageKey
>;

type Channel = TeamReportSaved['channel'];

export function llmBody(model: string, apiKey: string): LlmSettingsInput {
  const key = apiKey.trim();
  return { provider: 'deepseek', model: model.trim(), ...(key ? { apiKey: key } : {}) };
}

export function teamReportBody(form: TeamReportInput): TeamReportInput {
  return {
    enabled: form.enabled,
    channel: form.channel.trim(),
    weekday: form.weekday,
    time: form.time,
    productionBranch: form.productionBranch.trim(),
  };
}

export function ChannelWarning({
  team,
  provider,
  channel,
  result,
}: {
  team: string;
  provider: TeamReportView['provider'];
  channel: string;
  result: Exclude<Channel, 'ok'>;
}) {
  const t = useT();
  const slack = provider === 'slack';
  const key: MessageKey =
    result === 'not_linked'
      ? 'setup.teams.spaceNotLinked'
      : result === 'not_member'
        ? slack
          ? 'setup.teams.channelNotMember'
          : 'setup.teams.spaceNotMember'
        : slack
          ? 'setup.teams.channelNotFound'
          : 'setup.teams.spaceNotFound';
  return (
    <Alert variant="warn">
      <p className="m-0">{t(key, { team, reference: channel })}</p>
    </Alert>
  );
}

function ConfirmRemove({
  label,
  title,
  body,
  onConfirm,
}: {
  label: string;
  title: string;
  body: string;
  onConfirm: () => Promise<unknown>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const confirm = async () => {
    setPending(true);
    setProblem(null);
    try {
      await onConfirm();
      setOpen(false);
    } catch (error) {
      setProblem(errorMessage(t, error));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        setProblem(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        {problem ? <Alert variant="destructive">{problem}</Alert> : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t('setup.cancel')}
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => void confirm()}
          >
            {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LlmCard({
  installationId,
  settings,
}: {
  installationId: number;
  settings: { model: string; keyLast4: string; rejected: boolean } | null;
}) {
  const t = useT();
  const id = useId();
  const save = useSaveLlmSettings(installationId);
  const remove = useRemoveLlmSettings(installationId);
  const [model, setModel] = useState(settings?.model ?? 'deepseek-chat');
  const [apiKey, setApiKey] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProblem(null);
    try {
      await save.mutateAsync(llmBody(model, apiKey));
      setApiKey('');
    } catch (error) {
      setProblem(errorMessage(t, error));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('report.llm.title')}</CardTitle>
        <CardDescription>{t('report.llm.notice')}</CardDescription>
      </CardHeader>
      {settings?.rejected ? <Alert variant="destructive">{t('report.llm.rejected')}</Alert> : null}
      <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-model`}>{t('report.llm.model')}</Label>
          <Input
            id={`${id}-model`}
            value={model}
            onChange={(event) => setModel(event.target.value)}
            required
            maxLength={100}
            autoComplete="off"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-key`}>{t('report.llm.key')}</Label>
          <Input
            id={`${id}-key`}
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            autoComplete="off"
            placeholder={settings ? `••••${settings.keyLast4}` : undefined}
            required={!settings}
          />
        </div>
        {problem ? (
          <p role="alert" className="m-0 text-[13px] text-bad-ink">
            {problem}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={save.isPending}>
            {t('report.llm.save')}
          </Button>
          {settings ? (
            <ConfirmRemove
              label={t('report.llm.remove')}
              title={t('report.llm.removeTitle')}
              body={t('report.llm.removeBody')}
              onConfirm={() => remove.mutateAsync()}
            />
          ) : null}
        </div>
      </form>
    </Card>
  );
}

function TeamCard({ installationId, view }: { installationId: number; view: TeamReportView }) {
  const t = useT();
  const id = useId();
  const save = useSaveTeamReport(installationId, view.team);
  const remove = useRemoveTeamReport(installationId);
  const [form, setForm] = useState<TeamReportInput>(
    view.report ?? {
      enabled: false,
      channel: '',
      weekday: 'mon',
      time: '09:00',
      productionBranch: 'main',
    },
  );
  const [result, setResult] = useState<Channel | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const patch = (next: Partial<TeamReportInput>) => setForm((current) => ({ ...current, ...next }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProblem(null);
    setResult(null);
    try {
      const saved = await save.mutateAsync(teamReportBody(form));
      setResult(saved.channel);
    } catch (error) {
      setProblem(errorMessage(t, error));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('report.team.title', { team: view.team })}</CardTitle>
      </CardHeader>
      <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <div className="flex min-h-11 items-center gap-2.5 desk:min-h-8">
          <Checkbox
            id={`${id}-enabled`}
            checked={form.enabled}
            onCheckedChange={(checked) => patch({ enabled: checked === true })}
          />
          <Label htmlFor={`${id}-enabled`} className="font-medium text-text">
            {t('report.team.enabled')}
          </Label>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-channel`}>
            {t(
              view.provider === 'slack'
                ? 'report.team.channelSlack'
                : 'report.team.channelGoogleChat',
            )}
          </Label>
          <Input
            id={`${id}-channel`}
            value={form.channel}
            onChange={(event) => patch({ channel: event.target.value })}
            required
            maxLength={200}
            autoComplete="off"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-weekday`}>{t('report.team.weekday')}</Label>
          <Select
            value={form.weekday}
            onValueChange={(value) => patch({ weekday: value as TeamReportInput['weekday'] })}
          >
            <SelectTrigger id={`${id}-weekday`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEKDAYS.map((day) => (
                <SelectItem key={day} value={day}>
                  {t(DAY_KEYS[day])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-time`}>{t('report.team.time')}</Label>
          <Input
            id={`${id}-time`}
            type="time"
            value={form.time}
            onChange={(event) => patch({ time: event.target.value })}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-branch`}>{t('report.team.branch')}</Label>
          <Input
            id={`${id}-branch`}
            value={form.productionBranch}
            onChange={(event) => patch({ productionBranch: event.target.value })}
            required
            maxLength={200}
            autoComplete="off"
          />
        </div>
        {problem ? (
          <p role="alert" className="m-0 text-[13px] text-bad-ink">
            {problem}
          </p>
        ) : null}
        {result && result !== 'ok' ? (
          <ChannelWarning
            team={view.team}
            provider={view.provider}
            channel={form.channel.trim()}
            result={result}
          />
        ) : null}
        {result === 'ok' ? (
          <p role="status" className="m-0 text-[13px] text-text2">
            {t('report.saved')}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={save.isPending}>
            {t('report.team.save')}
          </Button>
          {view.report ? (
            <ConfirmRemove
              label={t('report.team.remove')}
              title={t('report.team.removeTitle', { team: view.team })}
              body={t('report.team.removeBody')}
              onConfirm={() => remove.mutateAsync(view.team)}
            />
          ) : null}
        </div>
      </form>
    </Card>
  );
}

function ReadOnlyTeam({ view }: { view: TeamReportView }) {
  const t = useT();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('report.team.title', { team: view.team })}</CardTitle>
        <CardDescription>
          {view.report?.enabled
            ? t('report.readonly.on', {
                day: t(DAY_KEYS[view.report.weekday]),
                time: view.report.time,
                channel: view.report.channel,
              })
            : t('report.readonly.off')}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

export function ReportsTab({ installationId }: { installationId: number }) {
  const t = useT();
  const query = useReportSettings(installationId);
  const removeTeam = useRemoveTeamReport(installationId);
  if (query.isPending) return <Loading header={false} />;
  if (query.isError) return <p className="m-0 text-bad-ink">{t('error.body')}</p>;
  const { llm, teams, orphans } = query.data;
  return (
    <div className="flex flex-col gap-4">
      {llm.manage ? <LlmCard installationId={installationId} settings={llm.settings} /> : null}
      {teams.map((view) =>
        view.editable ? (
          <TeamCard key={view.team} installationId={installationId} view={view} />
        ) : (
          <ReadOnlyTeam key={view.team} view={view} />
        ),
      )}
      {orphans.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('report.orphans.title')}</CardTitle>
          </CardHeader>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {orphans.map((team) => (
              <li key={team} className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono">{team}</span>
                <ConfirmRemove
                  label={t('report.orphans.remove', { team })}
                  title={t('report.team.removeTitle', { team })}
                  body={t('report.team.removeBody')}
                  onConfirm={() => removeTeam.mutateAsync(team)}
                />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
