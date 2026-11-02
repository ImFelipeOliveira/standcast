import type { TodayPerson } from '@standcast/orchestrator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { type MessageKey, useLang, useT } from '../../i18n';
import { ItemList, SectionLabel } from './DailyCard';
import { formatTime } from './format';

const SECTIONS: { key: 'yesterday' | 'today' | 'blockers' | 'support'; label: MessageKey }[] = [
  { key: 'yesterday', label: 'hoje.daily.yesterday' },
  { key: 'today', label: 'hoje.daily.today' },
  { key: 'blockers', label: 'hoje.daily.blockers' },
  { key: 'support', label: 'hoje.daily.support' },
];

type Props = { person: TodayPerson | null; timezone: string; onClose: () => void };

export function DailyDrawer({ person, timezone, onClose }: Props) {
  const t = useT();
  const lang = useLang();
  const daily = person?.daily ?? null;
  return (
    <Dialog open={person !== null && daily !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="top-0 right-0 left-auto h-full max-h-none w-full max-w-md translate-x-0 translate-y-0 rounded-none border-y-0 border-r-0">
        {person && daily ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('hoje.daily.drawerTitle', { login: person.login })}</DialogTitle>
              <DialogDescription>
                {person.submittedAt
                  ? t('hoje.daily.sentAt', { time: formatTime(lang, person.submittedAt, timezone) })
                  : null}
              </DialogDescription>
            </DialogHeader>
            {SECTIONS.map(({ key, label }) => (
              <div key={key}>
                <SectionLabel>{t(label)}</SectionLabel>
                {daily[key].length > 0 ? (
                  <ItemList items={daily[key]} />
                ) : (
                  <p className="m-0 mt-1.5 text-muted">{t('hoje.daily.nothing')}</p>
                )}
              </div>
            ))}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
