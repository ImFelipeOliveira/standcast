import type { HistoryEntry } from '@standcast/orchestrator';
import { useT } from '../../i18n';
import { RefLink } from '../hoje/RefLink';

export type HistoryTab = 'digests' | 'search' | 'shipped';

export type HistorySearch = {
  team: string;
  tab: HistoryTab;
  date?: string;
  q?: string;
  from?: string;
  to?: string;
};

export function keyed<T>(items: T[], base: (item: T) => string): [string, T][] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const key = base(item);
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    return [`${key}#${count}`, item];
  });
}

export const entryKey = (entry: HistoryEntry) =>
  `${entry.author}:${entry.text}:${entry.ref?.url ?? ''}`;

export function Entry({ entry }: { entry: HistoryEntry }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[14px]">
      <span>
        <span className="mr-2 font-mono text-[12px] text-muted">@{entry.author}</span>
        {entry.text}
      </span>
      {entry.ref ? <RefLink refValue={entry.ref} /> : null}
    </li>
  );
}

export function RangeFields({ from, to }: { from?: string; to?: string }) {
  const t = useT();
  const field =
    'min-h-11 rounded-md border border-border-strong bg-surface px-2.5 font-mono text-base text-text desk:min-h-9 desk:text-[13px]';
  return (
    <>
      <label className="flex flex-col gap-1 text-[12px] text-muted">
        {t('history.from')}
        <input type="date" name="from" defaultValue={from} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-[12px] text-muted">
        {t('history.to')}
        <input type="date" name="to" defaultValue={to} className={field} />
      </label>
    </>
  );
}

export function readRange(form: HTMLFormElement): { from?: string; to?: string } {
  const data = new FormData(form);
  const from = String(data.get('from') ?? '');
  const to = String(data.get('to') ?? '');
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
}
