import type { IsoDate } from '@leaves/shared/workdays';
import { format } from 'date-fns';
import { ApiError } from '../api/errors';
import { DEFAULT_TIMEZONE } from '../config/timezone';
import { currentLanguage, dateLocale, i18n, type Language } from '.';
import type en from './locales/en.json';

/** NFR-13 date patterns per locale. */
const PATTERNS = {
  en: { date: 'MMM d, yyyy', timestamp: 'MMM d, yyyy HH:mm' },
  sk: { date: 'd. M. yyyy', timestamp: 'd. M. yyyy H:mm' },
} as const satisfies Record<Language, unknown>;

/** Calendar date (`YYYY-MM-DD`) as a local date, without timezone shifting. */
function calendarDate(date: IsoDate): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y!, m! - 1, d);
}

/** `Nov 4, 2026` / `4. 11. 2026`. */
export function formatDate(
  date: IsoDate,
  lang: Language = currentLanguage(),
): string {
  return format(calendarDate(date), PATTERNS[lang].date, {
    locale: dateLocale(lang),
  });
}

/** `Nov 4, 2026 - Nov 6, 2026` / `4. 11. 2026 - 6. 11. 2026`. */
export function formatDateRange(
  start: IsoDate,
  end: IsoDate,
  lang: Language = currentLanguage(),
): string {
  return `${formatDate(start, lang)} - ${formatDate(end, lang)}`;
}

/** Standalone month name for `month` 1–12: `November` / `november`. */
export function monthName(
  month: number,
  lang: Language = currentLanguage(),
): string {
  return format(new Date(2000, month - 1, 1), 'LLLL', {
    locale: dateLocale(lang),
  });
}

/** Wall-clock parts of `instant` in `timeZone` (no tz library needed). */
function wallClock(instant: Date, timeZone: string): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  return new Date(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );
}

/** ISO instant in `DEFAULT_TIMEZONE`: `Nov 4, 2026 10:15` / `4. 11. 2026 10:15`. */
export function formatTimestamp(
  iso: string,
  lang: Language = currentLanguage(),
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  return format(wallClock(new Date(iso), timeZone), PATTERNS[lang].timestamp, {
    locale: dateLocale(lang),
  });
}

/** Work days etc.: EN `2.5`, SK `2,5`. */
export function formatNumber(
  n: number,
  lang: Language = currentLanguage(),
): string {
  return new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(n);
}

/** `errors.<code>` in the active language; unknown codes → `errors.UNKNOWN`. */
export function translateErrorCode(code: string): string {
  if (!i18n.exists(`errors.${code}`)) return i18n.t('errors.UNKNOWN');
  return i18n.t(`errors.${code}` as `errors.${keyof typeof en.errors}`);
}

/** Translated text for any thrown value (API errors by code). */
export function errorMessage(error: unknown): string {
  return error instanceof ApiError
    ? translateErrorCode(error.code)
    : i18n.t('errors.UNKNOWN');
}

// TODO(LST-03): FullCalendar `locale` = `en` (built in) or
// `@fullcalendar/core/locales/sk`; EN week starts Sunday, SK Monday.
