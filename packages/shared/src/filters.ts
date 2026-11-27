/**
 * LST-02 leave list filters: requester, month and year multiselects, matched
 * per calendar-year segment of a leave (port of the old
 * `angular/src/app/leaves/leaveFilter.ts`). Pure functions, used client-side
 * by the list and the calendar view.
 */
import type { LeaveDto, UserRefDto } from './dto.js';
import { formatUserRef } from './users.js';
import type { IsoDate } from './workdays.js';

/**
 * Selected filter values. Months are 0 = January … 11 = December. Missing
 * keys and empty arrays mean "no restriction".
 */
export interface LeaveListFilter {
  requesterIds?: string[];
  months?: number[];
  years?: number[];
}

/** The leave fields the filter looks at. */
export interface FilterableLeave {
  requesterId: string;
  startDate: IsoDate;
  endDate: IsoDate;
}

/** The part of a leave that falls into one calendar year (months 0–11). */
export interface YearSegment {
  year: number;
  startMonth: number;
  endMonth: number;
}

/** A filter option: id plus (for requesters) the display label. */
export interface FilterOption<T> {
  id: T;
}

export interface RequesterOption extends FilterOption<string> {
  label: string;
}

const yearOf = (date: IsoDate): number => Number(date.slice(0, 4));
/** 0-based month of a `YYYY-MM-DD` date, without timezone conversion. */
const monthOf = (date: IsoDate): number => Number(date.slice(5, 7)) - 1;

/**
 * One segment per calendar year from the start year to the end year: the
 * first starts at the start month, the last ends at the end month, middle
 * years cover 0–11. Empty when the start year is after the end year.
 */
export function splitByYear(
  startDate: IsoDate,
  endDate: IsoDate,
): YearSegment[] {
  const startYear = yearOf(startDate);
  const endYear = yearOf(endDate);
  const segments: YearSegment[] = [];
  for (let year = startYear; year <= endYear; year++) {
    segments.push({
      year,
      startMonth: year === startYear ? monthOf(startDate) : 0,
      endMonth: year === endYear ? monthOf(endDate) : 11,
    });
  }
  return segments;
}

const isSet = <T>(values: T[] | undefined): values is T[] =>
  values !== undefined && values.length > 0;

/**
 * Old `isMatchingFilter` rules: requester must be selected (if any are);
 * some year segment must be in the selected years (if any); some segment
 * whose year passes the year filter must cover a selected month (if any).
 */
export function isMatchingFilter(
  leave: FilterableLeave,
  filter: LeaveListFilter | null | undefined,
): boolean {
  if (!filter) return true;
  const { requesterIds, months, years } = filter;
  if (isSet(requesterIds) && !requesterIds.includes(leave.requesterId))
    return false;

  const segments = splitByYear(leave.startDate, leave.endDate);
  const inYears = (segment: YearSegment) =>
    !isSet(years) || years.includes(segment.year);
  if (isSet(years) && !segments.some(inYears)) return false;

  if (isSet(months)) {
    return segments.some(
      (segment) =>
        inYears(segment) &&
        months.some((m) => segment.startMonth <= m && m <= segment.endMonth),
    );
  }
  return true;
}

/** `FilterableLeave` view of a `LeaveDto` (a missing requester has id ''). */
export function toFilterableLeave(
  leave: Pick<LeaveDto, 'requester' | 'startDate' | 'endDate'>,
): FilterableLeave {
  return {
    requesterId: leave.requester?.id ?? '',
    startDate: leave.startDate,
    endDate: leave.endDate,
  };
}

/** The 12 month options, `{ id: 0 }` (January) … `{ id: 11 }` (December). */
export function makeMonthOptions(): FilterOption<number>[] {
  return Array.from({ length: 12 }, (_, id) => ({ id }));
}

export interface RequesterOptionsConfig {
  /** Display label; default `formatUserRef` (EN suffixes). */
  label?: (requester: UserRefDto) => string;
  /** Locale of the label sort (the UI language); default runtime locale. */
  locale?: string;
}

/**
 * Unique requesters of `leaves` by id, sorted by label (locale compare).
 * Leaves without a requester (defensive `null`) give no option.
 */
export function makeRequesterOptions(
  leaves: Pick<LeaveDto, 'requester'>[],
  config: RequesterOptionsConfig = {},
): RequesterOption[] {
  const { label = (r: UserRefDto) => formatUserRef(r), locale } = config;
  const byId = new Map<string, RequesterOption>();
  for (const { requester } of leaves) {
    if (requester && !byId.has(requester.id))
      byId.set(requester.id, { id: requester.id, label: label(requester) });
  }
  const collator = new Intl.Collator(locale);
  return [...byId.values()].sort(
    (a, b) => collator.compare(a.label, b.label) || (a.id < b.id ? -1 : 1),
  );
}

/**
 * Unique start and end years of all leaves plus `currentYear`, descending.
 * Middle years of a multi-year leave are not added (old rule).
 */
export function makeYearOptions(
  leaves: Pick<LeaveDto, 'startDate' | 'endDate'>[],
  currentYear: number,
): FilterOption<number>[] {
  const years = new Set<number>([currentYear]);
  for (const leave of leaves) {
    years.add(yearOf(leave.startDate));
    years.add(yearOf(leave.endDate));
  }
  return [...years].sort((a, b) => b - a).map((id) => ({ id }));
}
