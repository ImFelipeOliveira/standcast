import type { TodaySupport } from '@standcast/orchestrator';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { useLang, useT } from '../../i18n';
import { Author } from './BlockerCard';
import { formatShortDate } from './format';
import { RefLink } from './RefLink';

type Props = { support: TodaySupport; date: string; onViewDaily: (() => void) | null };

export function SupportCard({ support, date, onViewDaily }: Props) {
  const t = useT();
  const lang = useLang();
  return (
    <article className="flex flex-col gap-2.5 rounded-[10px] bg-accent-wash p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-accent text-on-accent">{t('hoje.support.kind')}</Badge>
        <Badge className="bg-accent-soft3 text-accent-ink">
          {support.since === date
            ? t('hoje.support.today')
            : t('hoje.support.since', { date: formatShortDate(lang, support.since) })}
        </Badge>
        <Author login={support.author} />
      </div>
      <p className="m-0 font-medium text-[15px]">{support.text}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0">
          {support.ref ? <RefLink refValue={support.ref} /> : null}
        </span>
        {onViewDaily ? (
          <Button type="button" variant="outline" onClick={onViewDaily}>
            {t('hoje.viewDaily')}
          </Button>
        ) : null}
      </div>
    </article>
  );
}
