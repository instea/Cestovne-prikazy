import Holidays from 'date-holidays';

/** Calendar date as `YYYY-MM-DD`. No time, no timezone. */
export type IsoDate = string;

export interface LeaveDays {
  startDate: IsoDate;
  endDate: IsoDate;
  isHalfDay: boolean;
}

const MS_PER_DAY = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse `YYYY-MM-DD` to a day number (days since 1970-01-01, UTC).
 * Throws `RangeError` for malformed or non-existent dates (e.g. `2026-02-30`).
 */
function toDayNumber(date: IsoDate): number {
  const m = ISO_DATE.exec(date);
  if (!m) throw new RangeError(`Invalid date: ${JSON.stringify(date)}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid date: ${JSON.stringify(date)}`);
  }
  return ms / MS_PER_DAY;
}

/** `true` for a `YYYY-MM-DD` string that names a real calendar date. */
export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string') return false;
  try {
    toDayNumber(value);
    return true;
  } catch {
    return false;
  }
}

function fromDayNumber(dayNumber: number): IsoDate {
  return new Date(dayNumber * MS_PER_DAY).toISOString().slice(0, 10);
}

const holidaysSk = new Holidays('SK');
const holidayCache = new Map<number, Set<IsoDate>>();

/**
 * SK public holidays of `year` (date-holidays, `type === 'public'` only).
 * Observances are working days. Cached per year.
 */
export function publicHolidays(year: number): Set<IsoDate> {
  let set = holidayCache.get(year);
  if (!set) {
    set = new Set(
      holidaysSk
        .getHolidays(year)
        .filter((h) => h.type === 'public')
        .map((h) => h.date.slice(0, 10)),
    );
    holidayCache.set(year, set);
  }
  return set;
}

function isWorkingDayNumber(dayNumber: number): boolean {
  // 1970-01-01 was a Thursday; 0 = Sunday … 6 = Saturday.
  const weekday = (((dayNumber + 4) % 7) + 7) % 7;
  if (weekday === 0 || weekday === 6) return false;
  const date = fromDayNumber(dayNumber);
  return !publicHolidays(Number(date.slice(0, 4))).has(date);
}

/** Monday–Friday and not a Slovak public holiday. */
export function isWorkingDay(date: IsoDate): boolean {
  return isWorkingDayNumber(toDayNumber(date));
}

/** Working days in `[start, end]` inclusive; 0 when `end < start`. */
export function countWorkingDays(start: IsoDate, end: IsoDate): number {
  const from = toDayNumber(start);
  const to = toDayNumber(end);
  let count = 0;
  for (let d = from; d <= to; d++) {
    if (isWorkingDayNumber(d)) count++;
  }
  return count;
}

/**
 * Work days of a leave: working days in `[startDate, endDate]`, minus 0.5 for
 * a half-day. A half-day on a non-working day gives 0, never −0.5. The
 * half-day rule itself (single day only) is validated by the API, not here.
 */
export function leaveWorkDays({
  startDate,
  endDate,
  isHalfDay,
}: LeaveDays): number {
  const count = countWorkingDays(startDate, endDate);
  return isHalfDay && count > 0 ? count - 0.5 : count;
}
