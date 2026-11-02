import type { Lang } from '../../i18n';

function formatter(lang: Lang, options: Intl.DateTimeFormatOptions, timeZone?: string) {
  try {
    return new Intl.DateTimeFormat(lang, { ...options, timeZone });
  } catch {
    return new Intl.DateTimeFormat(lang, options);
  }
}

export function formatTime(lang: Lang, value: string, timeZone: string): string {
  return formatter(lang, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, timeZone).format(
    new Date(value),
  );
}

function calendarDate(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

export function formatDay(lang: Lang, date: string): string {
  const text = formatter(lang, { weekday: 'long', day: 'numeric', month: 'long' }, 'UTC').format(
    calendarDate(date),
  );
  return text.charAt(0).toLocaleUpperCase(lang) + text.slice(1);
}

export function formatShortDate(lang: Lang, date: string): string {
  return formatter(lang, { day: '2-digit', month: '2-digit' }, 'UTC').format(calendarDate(date));
}

export function initials(login: string): string {
  return (
    login
      .replace(/[^a-z0-9]/gi, '')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
}

export function keyed<T>(items: T[], keyOf: (item: T) => string): { key: string; item: T }[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = keyOf(item);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return { key: count === 0 ? base : `${base}#${count}`, item };
  });
}
