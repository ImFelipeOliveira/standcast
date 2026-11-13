import type { RemindNowResult, TeamToday, TodayDaily, TodayPerson } from '@standcast/orchestrator';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { type MessageKey, useLang, useT } from '../../i18n';
import { cn } from '../../lib/utils';
import { formatTime, initials, keyed } from './format';
import { Avatar, RefLink } from './RefLink';

export type DailyFilter = 'all' | 'sent' | 'missing';
export type RemindStatus = 'pending' | 'failed' | RemindNowResult;

const FILTERS: { id: DailyFilter; label: MessageKey }[] = [
  { id: 'all', label: 'hoje.dailies.all' },
  { id: 'sent', label: 'hoje.dailies.sent' },
  { id: 'missing', label: 'hoje.dailies.missing' },
];

const REMIND_MESSAGES: Record<Exclude<RemindStatus, 'pending'>, MessageKey> = {
  queued: 'hoje.remind.queued',
  already_sent: 'hoje.remind.already_sent',
  too_late: 'hoje.remind.too_late',
  failed: 'setup.actionFailed',
};

export function ItemList({ items }: { items: TodayDaily['today'] }) {
  return (
    <ul className="m-0 mt-1.5 flex list-none flex-col gap-1.5 p-0">
      {keyed(items, (item) => `${item.text}:${item.ref?.url ?? ''}`).map(({ key, item }) => (
        <li
          key={key}
          className="flex items-baseline justify-between gap-2 [overflow-wrap:anywhere]"
        >
          <span>{item.text}</span>
          {item.ref ? <RefLink refValue={item.ref} className="flex-none" /> : null}
        </li>
      ))}
    </ul>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return (
    <span className="font-semibold text-[11px] text-muted uppercase tracking-[0.06em]">
      {children}
    </span>
  );
}

type CardProps = {
  person: TodayPerson;
  timezone: string;
  canRemind: boolean;
  remind: RemindStatus | undefined;
  onRemind: () => void;
  onView: () => void;
};

export function DailyCard({ person, timezone, canRemind, remind, onRemind, onView }: CardProps) {
  const t = useT();
  const lang = useLang();
  const daily = person.daily;
  const blockers = daily?.blockers.length ?? 0;
  const meta = [
    `@${person.login}`,
    person.submittedAt ? formatTime(lang, person.submittedAt, timezone) : null,
    person.status === 'late' ? t('hoje.daily.late') : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const showRemind = canRemind && remind !== 'too_late' && remind !== 'queued';
  return (
    <article className="flex flex-col gap-3 rounded-[14px] border border-border bg-surface px-[18px] py-4">
      <div className="flex items-center gap-2.5">
        <Avatar text={initials(person.login)} />
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-semibold">{meta}</span>
        {blockers > 0 ? (
          <Badge variant="warn">
            {blockers === 1
              ? t('hoje.daily.blockerCount.one')
              : t('hoje.daily.blockerCount.other', { count: String(blockers) })}
          </Badge>
        ) : null}
      </div>
      {daily ? (
        <div className="flex flex-col gap-2.5">
          {daily.yesterday.length > 0 ? (
            <div>
              <SectionLabel>{t('hoje.daily.yesterday')}</SectionLabel>
              <ItemList items={daily.yesterday} />
            </div>
          ) : null}
          <div>
            <SectionLabel>{t('hoje.daily.today')}</SectionLabel>
            <ItemList items={daily.today} />
          </div>
          <Button type="button" variant="outline" className="self-start" onClick={onView}>
            {t('hoje.daily.full')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 rounded-[10px] border border-border border-dashed p-3.5">
          <span className="text-muted">{t('hoje.missing.body')}</span>
          {showRemind ? (
            <Button
              type="button"
              variant="outline"
              className="self-start"
              disabled={remind === 'pending'}
              onClick={onRemind}
            >
              {t('hoje.remind')}
            </Button>
          ) : null}
          <span role="status" className="text-[13px] text-text2 empty:sr-only">
            {remind && remind !== 'pending' ? t(REMIND_MESSAGES[remind]) : null}
          </span>
        </div>
      )}
    </article>
  );
}

export function filterPeople(people: TodayPerson[], filter: DailyFilter): TodayPerson[] {
  if (filter === 'all') return people;
  return people.filter((person) =>
    filter === 'missing' ? person.status === 'missing' : person.status !== 'missing',
  );
}

type DailiesProps = {
  today: TeamToday;
  filter: DailyFilter;
  onFilter: (filter: DailyFilter) => void;
  reminders: Record<string, RemindStatus>;
  onRemind: (login: string) => void;
  onView: (login: string) => void;
};

export function Dailies({ today, filter, onFilter, reminders, onRemind, onView }: DailiesProps) {
  const t = useT();
  const people = filterPeople(today.people, filter);
  return (
    <section aria-labelledby="hoje-dailies" className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="hoje-dailies" className="m-0 font-bold text-[17px]">
          {t('hoje.dailies.title')}
        </h2>
        <fieldset className="m-0 inline-flex min-w-0 gap-0.5 rounded-[10px] border-0 bg-seg p-[3px]">
          <legend className="sr-only">{t('hoje.dailies.filter')}</legend>
          {FILTERS.map((item) => {
            const on = item.id === filter;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={on}
                onClick={() => onFilter(item.id)}
                className={cn(
                  'min-h-11 cursor-pointer rounded-lg border-0 px-3.5 font-semibold text-[13px] desk:min-h-8',
                  on
                    ? 'bg-surface text-text shadow-sm'
                    : 'bg-transparent text-muted hover:text-text',
                )}
              >
                {t(item.label)}
              </button>
            );
          })}
        </fieldset>
      </div>
      {people.length === 0 ? (
        <p className="m-0 text-muted">{t('hoje.dailies.none')}</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-3.5">
          {people.map((person) => (
            <DailyCard
              key={person.login}
              person={person}
              timezone={today.team.timezone}
              canRemind={today.canRemind}
              remind={reminders[person.login]}
              onRemind={() => onRemind(person.login)}
              onView={() => onView(person.login)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
