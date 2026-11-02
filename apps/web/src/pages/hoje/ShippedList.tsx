import type { TodayShipped } from '@standcast/orchestrator';
import { Card, CardTitle } from '../../components/ui/card';
import { useT } from '../../i18n';
import { keyed } from './format';
import { RefLink } from './RefLink';

export function ShippedList({ shipped }: { shipped: TodayShipped[] }) {
  const t = useT();
  return (
    <Card aria-labelledby="hoje-shipped" className="gap-3 px-5 py-[18px]">
      <CardTitle id="hoje-shipped" className="text-[15px]">
        {t('hoje.shipped.title')}
      </CardTitle>
      {shipped.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">{t('hoje.shipped.empty')}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {keyed(shipped, (item) => `${item.author}:${item.ref.url}:${item.text}`).map(
            ({ key, item }) => (
              <li key={key} className="flex flex-col gap-1 [overflow-wrap:anywhere]">
                <span>{item.text}</span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <RefLink refValue={item.ref} />
                  <span className="font-mono text-[12px] text-muted">@{item.author}</span>
                </span>
              </li>
            ),
          )}
        </ul>
      )}
    </Card>
  );
}
