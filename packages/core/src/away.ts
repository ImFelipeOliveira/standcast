import type { Language } from './config';
import { formatDate, t } from './i18n';

export const MAX_AWAY_DAYS = 90;

const DAY_MS = 86_400_000;

function toDay(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const date = new Date(time);
  if (date.toISOString().slice(0, 10) !== value) return null;
  return Math.round(time / DAY_MS);
}

export function validateAwayPeriod(input: {
  from: string;
  until: string;
  today: string;
}): 'ok' | 'invalid_away_period' {
  const from = toDay(input.from);
  const until = toDay(input.until);
  const today = toDay(input.today);
  if (from === null || until === null || today === null) return 'invalid_away_period';
  if (until < from || from < today) return 'invalid_away_period';
  if (until - from + 1 > MAX_AWAY_DAYS) return 'invalid_away_period';
  return 'ok';
}

export function buildAwayNotice(
  lang: Language,
  input: {
    by: string;
    from: string;
    until: string;
    periodId: string;
    org: string;
    action: 'marked' | 'cancelled';
  },
): string {
  return t(lang, `away.notice.${input.action}`, {
    by: input.by,
    from: formatDate(lang, input.from),
    until: formatDate(lang, input.until),
    id: input.periodId,
    org: input.org,
  });
}
