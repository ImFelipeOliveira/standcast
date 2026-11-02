import type { TodayPerson } from '@standcast/orchestrator';
import { Badge } from '../../components/ui/badge';
import { Card, CardTitle } from '../../components/ui/card';
import { useT } from '../../i18n';

export function SentToday({ people }: { people: TodayPerson[] }) {
  const t = useT();
  const sent = people.filter((person) => person.status !== 'missing');
  const missing = people.filter((person) => person.status === 'missing');
  return (
    <Card aria-labelledby="hoje-sent" className="gap-3 px-5 py-[18px]">
      <CardTitle id="hoje-sent" className="text-[15px]">
        {t('hoje.sent.title')}
      </CardTitle>
      <div className="flex flex-wrap gap-2">
        {sent.map((person) => (
          <Badge key={person.login} className="bg-accent-soft font-medium text-accent-ink">
            @{person.login}
          </Badge>
        ))}
        {missing.map((person) => (
          <Badge key={person.login} variant="outline" className="border-(--dashed) border-dashed">
            {t('hoje.sent.missing', { login: person.login })}
          </Badge>
        ))}
      </div>
      <p className="m-0 text-[12px] text-muted">{t('hoje.sent.note')}</p>
    </Card>
  );
}
