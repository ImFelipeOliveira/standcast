import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { configQuery, configValidationQuery } from '../../api/queries';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { type MessageKey, useT } from '../../i18n';
import { cn } from '../../lib/utils';
import { Loading } from '../RouteStates';
import { newConfigFileUrl } from './ConfigFile';
import { type ConfigDraft, emptyTeam, type TeamDraft, toYaml } from './config-yaml';

const DEBOUNCE_MS = 600;

export function configEditUrl(
  owner: string,
  repo: string,
  branch: string,
  exists: boolean,
): string {
  return exists
    ? `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/edit/${encodeURIComponent(branch)}/standcast.yml`
    : newConfigFileUrl(owner, repo, branch, '');
}

const field =
  'min-h-11 w-full rounded-md border border-border-strong bg-surface px-2.5 text-base text-text desk:min-h-9 desk:text-[13px]';

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const splitList = (value: string) =>
  value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);

function Field({
  id,
  label,
  children,
  hint,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-semibold text-[12px] text-text2">
        {label}
      </label>
      {children}
      {hint ? <span className="text-[12px] text-muted">{hint}</span> : null}
    </div>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
      <legend className="mb-1 font-semibold text-[12px] text-text2">{label}</legend>
      <div className="flex flex-wrap gap-1 self-start rounded-lg bg-hover p-0.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'min-h-11 cursor-pointer rounded-md border-0 px-3 font-medium text-[13px] disabled:cursor-not-allowed disabled:opacity-60 desk:min-h-8',
              option.value === value
                ? 'bg-surface font-semibold text-text ring-1 ring-border-strong'
                : 'bg-transparent text-muted hover:text-text',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function notesFor(
  team: TeamDraft,
): { tag: string; key: MessageKey; vars?: Record<string, string> }[] {
  const notes: { tag: string; key: MessageKey; vars?: Record<string, string> }[] = [];
  if (team.chat.provider === 'google-chat') {
    notes.push({ tag: 'Google Chat', key: 'editor.note.googleChat' });
    notes.push({ tag: 'Google Chat', key: 'editor.note.space' });
  } else {
    notes.push({ tag: 'Slack', key: 'editor.note.slack' });
  }
  if (team.tracker?.provider === 'linear') notes.push({ tag: 'Linear', key: 'editor.note.linear' });
  if (team.tracker?.provider === 'jira') notes.push({ tag: 'Jira', key: 'editor.note.jira' });
  if (team.signals.blockerAlertDays !== undefined) {
    notes.push({
      tag: 'Alerta',
      key: 'editor.note.alert',
      vars: { days: String(team.signals.blockerAlertDays) },
    });
  }
  return notes;
}

function TeamForm({
  team,
  index,
  onChange,
}: {
  team: TeamDraft;
  index: number;
  onChange: (team: TeamDraft) => void;
}) {
  const t = useT();
  const id = (name: string) => `team-${index}-${name}`;
  const set = (patch: Partial<TeamDraft>) => onChange({ ...team, ...patch });
  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-1 gap-3 p-4 desk:grid-cols-2">
        <Field id={id('name')} label={t('editor.name')}>
          <input
            id={id('name')}
            className={field}
            value={team.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </Field>
        <Field id={id('tz')} label={t('editor.timezone')}>
          <input
            id={id('tz')}
            className={cn(field, 'font-mono')}
            value={team.timezone}
            onChange={(e) => set({ timezone: e.target.value })}
          />
        </Field>
        <Field id={id('remind')} label={t('editor.remindAt')}>
          <input
            id={id('remind')}
            type="time"
            className={cn(field, 'font-mono')}
            value={team.remindAt}
            onChange={(e) => set({ remindAt: e.target.value })}
          />
        </Field>
        <Field id={id('digest')} label={t('editor.digestAt')}>
          <input
            id={id('digest')}
            type="time"
            className={cn(field, 'font-mono')}
            value={team.digestAt}
            onChange={(e) => set({ digestAt: e.target.value })}
          />
        </Field>
        <Field id={id('managers')} label={t('editor.managers')} hint={t('editor.listHint')}>
          <input
            id={id('managers')}
            className={cn(field, 'font-mono')}
            value={team.managers.join(', ')}
            onChange={(e) => set({ managers: splitList(e.target.value) })}
          />
        </Field>
        <Field id={id('members')} label={t('editor.members')} hint={t('editor.listHint')}>
          <input
            id={id('members')}
            className={cn(field, 'font-mono')}
            value={team.members.join(', ')}
            onChange={(e) => set({ members: splitList(e.target.value) })}
          />
        </Field>
      </div>
      <div className="flex flex-col gap-3 border-border border-t p-4">
        <Choice
          label={t('editor.chat')}
          value={team.chat.provider}
          options={[
            { value: 'slack', label: 'Slack' },
            { value: 'google-chat', label: 'Google Chat' },
            { value: 'teams' as never, label: t('editor.teamsSoon'), disabled: true },
          ]}
          onChange={(provider) =>
            set({
              chat: {
                provider,
                channel: provider === 'google-chat' ? 'spaces/' : '#daily',
              },
            })
          }
        />
        <Field
          id={id('channel')}
          label={team.chat.provider === 'google-chat' ? t('editor.space') : t('editor.channel')}
          hint={
            team.chat.provider === 'google-chat' ? t('editor.spaceHint') : t('editor.channelHint')
          }
        >
          <input
            id={id('channel')}
            className={cn(field, 'font-mono')}
            value={team.chat.channel}
            onChange={(e) => set({ chat: { ...team.chat, channel: e.target.value } })}
          />
        </Field>
      </div>
      <div className="flex flex-col gap-3 border-border border-t p-4">
        <Choice
          label={t('editor.tracker')}
          value={team.tracker?.provider ?? ('none' as const)}
          options={[
            { value: 'none' as const, label: t('editor.none') },
            { value: 'linear' as const, label: 'Linear' },
            { value: 'jira' as const, label: 'Jira' },
          ]}
          onChange={(provider) => {
            if (provider === 'none') {
              const { tracker: _tracker, ...rest } = team;
              onChange(rest);
            } else {
              set({ tracker: { provider, team: team.tracker?.team ?? '' } });
            }
          }}
        />
        {team.tracker ? (
          <Field id={id('tracker-team')} label={t('editor.trackerTeam')}>
            <input
              id={id('tracker-team')}
              className={cn(field, 'font-mono desk:max-w-[200px]')}
              value={team.tracker.team}
              onChange={(e) =>
                set({
                  tracker: { provider: team.tracker?.provider ?? 'linear', team: e.target.value },
                })
              }
            />
          </Field>
        ) : null}
      </div>
      <div className="flex flex-col gap-3 border-border border-t p-4">
        <div className="grid grid-cols-1 gap-3 desk:grid-cols-2">
          <Field id={id('pr')} label={t('editor.prHours')}>
            <input
              id={id('pr')}
              type="number"
              min={1}
              className={cn(field, 'font-mono')}
              value={team.signals.prReviewHours}
              onChange={(e) =>
                set({ signals: { ...team.signals, prReviewHours: Number(e.target.value) } })
              }
            />
          </Field>
          <Field id={id('card')} label={t('editor.cardDays')}>
            <input
              id={id('card')}
              type="number"
              min={1}
              className={cn(field, 'font-mono')}
              value={team.signals.cardStaleDays}
              onChange={(e) =>
                set({ signals: { ...team.signals, cardStaleDays: Number(e.target.value) } })
              }
            />
          </Field>
        </div>
        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-current"
            checked={team.signals.blockerAlertDays !== undefined}
            onChange={(e) => {
              const { blockerAlertDays: _days, ...signals } = team.signals;
              set({ signals: e.target.checked ? { ...signals, blockerAlertDays: 3 } : signals });
            }}
          />
          <span className="flex flex-col gap-0.5">
            <span className="font-semibold text-[13px]">{t('editor.alert')}</span>
            <span className="text-[12px] text-muted">{t('editor.alertHint')}</span>
          </span>
        </label>
        {team.signals.blockerAlertDays !== undefined ? (
          <Field id={id('alert')} label={t('editor.alertDays')}>
            <input
              id={id('alert')}
              type="number"
              min={1}
              className={cn(field, 'font-mono desk:max-w-[120px]')}
              value={team.signals.blockerAlertDays}
              onChange={(e) =>
                set({ signals: { ...team.signals, blockerAlertDays: Number(e.target.value) } })
              }
            />
          </Field>
        ) : null}
      </div>
    </div>
  );
}

function Editor({
  installationId,
  initial,
  editUrl,
}: {
  installationId: number;
  initial: ConfigDraft;
  editUrl: string | null;
}) {
  const t = useT();
  const [draft, setDraft] = useState(initial);
  const [selected, setSelected] = useState(0);
  const nextId = useRef(initial.teams.length);
  const [ids, setIds] = useState(() => initial.teams.map((_, index) => index));
  const [copied, setCopied] = useState(false);
  const yaml = useMemo(() => toYaml(draft), [draft]);
  const debounced = useDebounced(yaml, DEBOUNCE_MS);
  const validation = useQuery(configValidationQuery(installationId, debounced));
  const team = draft.teams[selected] ?? draft.teams[0];
  const pending = debounced !== yaml || validation.isPending;
  const setTeam = (next: TeamDraft) =>
    setDraft((current) => ({
      ...current,
      teams: current.teams.map((item, index) => (index === selected ? next : item)),
    }));
  return (
    <div className="flex flex-wrap items-start gap-6">
      <section
        aria-labelledby="editor-build"
        className="flex min-w-0 flex-[1_1_420px] flex-col gap-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="editor-build" className="m-0 font-semibold text-[15px]">
            {t('editor.build')}
          </h2>
          <div className="flex flex-wrap gap-1">
            {draft.teams.map((item, index) => (
              <Button
                key={ids[index]}
                type="button"
                variant="ghost"
                aria-pressed={index === selected}
                onClick={() => setSelected(index)}
                className={cn(
                  index === selected
                    ? 'bg-surface font-semibold text-text ring-1 ring-border-strong'
                    : null,
                )}
              >
                {item.name || t('editor.unnamed')}
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDraft((current) => ({
                  ...current,
                  teams: [...current.teams, emptyTeam(t('editor.newTeamName'))],
                }));
                setIds((current) => [...current, nextId.current++]);
                setSelected(draft.teams.length);
              }}
            >
              {t('editor.addTeam')}
            </Button>
          </div>
        </div>
        {team ? (
          <Card className="gap-0 p-0">
            <TeamForm key={ids[selected]} team={team} index={selected} onChange={setTeam} />
            {draft.teams.length > 1 ? (
              <div className="border-border border-t p-3">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    setDraft((current) => ({
                      ...current,
                      teams: current.teams.filter((_, index) => index !== selected),
                    }));
                    setIds((current) => current.filter((_, index) => index !== selected));
                    setSelected(0);
                  }}
                >
                  {t('editor.removeTeam')}
                </Button>
              </div>
            ) : null}
          </Card>
        ) : null}
      </section>
      <section
        aria-labelledby="editor-yaml"
        className="flex min-w-0 flex-[1_1_420px] flex-col gap-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="editor-yaml" className="m-0 font-semibold text-[15px]">
            standcast.yml
          </h2>
          <span className="flex flex-wrap items-center gap-2" aria-live="polite">
            {pending ? (
              <Badge variant="neutral">{t('editor.validating')}</Badge>
            ) : validation.data?.ok ? (
              <Badge variant="ok">{t('editor.valid')}</Badge>
            ) : validation.data ? (
              <Badge variant="warn">
                {t('editor.errors', { count: String(validation.data.errors.length) })}
              </Badge>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void navigator.clipboard?.writeText(yaml).then(() => setCopied(true));
              }}
            >
              {copied ? t('history.copied') : t('editor.copy')}
            </Button>
            {editUrl ? (
              <Button asChild>
                <a href={editUrl} target="_blank" rel="noreferrer">
                  {t('editor.openGitHub')}
                </a>
              </Button>
            ) : null}
          </span>
        </div>
        <Card className="gap-0 overflow-hidden p-0">
          <pre className="m-0 overflow-x-auto bg-hover p-4 font-mono text-[12px] text-text leading-relaxed">
            {yaml}
          </pre>
        </Card>
        {validation.data && !validation.data.ok && !pending ? (
          <Card className="gap-2 p-4" role="alert">
            <h3 className="m-0 font-semibold text-[13px] text-warn-ink">
              {t('editor.errorsTitle')}
            </h3>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
              {validation.data.errors.map((error) => (
                <li key={`${error.path}:${error.message}`}>
                  <code className="font-mono text-[12px] text-muted">{error.path}</code>{' '}
                  {error.message}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        {team ? (
          <Card className="gap-2 p-4">
            <h3 className="m-0 font-semibold text-[13px]">{t('editor.notesTitle')}</h3>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {notesFor(team).map((note) => (
                <li
                  key={`${note.tag}:${note.key}`}
                  className="flex items-start gap-2 text-[13px] text-text2"
                >
                  <Badge variant="neutral" className="flex-none">
                    {note.tag}
                  </Badge>
                  <span>{t(note.key, note.vars)}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        <p className="m-0 text-[12px] text-muted">{t('editor.readOnly')}</p>
      </section>
    </div>
  );
}

export function ConfigEditor({
  installationId,
  editUrl,
}: {
  installationId: number;
  editUrl: string | null;
}) {
  const t = useT();
  const query = useQuery(configQuery(installationId));
  if (query.isPending) return <Loading header={false} />;
  if (query.isError) return <p className="m-0 text-bad-ink">{t('error.body')}</p>;
  const initial: ConfigDraft = query.data.config ?? { teams: [emptyTeam('backend')], members: {} };
  return <Editor installationId={installationId} initial={initial} editUrl={editUrl} />;
}
