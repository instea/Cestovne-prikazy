/**
 * DATA-02 leave enums and labels. The API and DB always store codes; labels
 * are UI-only (web i18n keys `leaveType.<CODE>` / `leaveState.<CODE>`), except
 * the EN labels below, which emails use (NOT-*).
 */
import { ErrorCode } from './enums.js';
import { isIsoDate, type IsoDate } from './workdays.js';

export type { IsoDate };

/** Leave types. Declaration order is the display order. */
export enum LeaveType {
  ANNUAL = 'ANNUAL',
  SICKNESS = 'SICKNESS',
  DOCTOR = 'DOCTOR',
  MATERNITY = 'MATERNITY',
  PARENTAL = 'PARENTAL',
  CARING = 'CARING',
}

export enum LeaveState {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

/** All leave types in display order. */
export const LEAVE_TYPES: readonly LeaveType[] = Object.freeze(
  Object.values(LeaveType),
);

/** All leave states in display order. */
export const LEAVE_STATES: readonly LeaveState[] = Object.freeze(
  Object.values(LeaveState),
);

/**
 * EN type labels: the single English source for emails (NOT-02 / NOT-03).
 * Must equal `leaveType.*` in the web EN catalog (tested there).
 */
export const LEAVE_TYPE_LABELS_EN: Readonly<Record<LeaveType, string>> = {
  ANNUAL: 'Annual leave',
  SICKNESS: 'Sick leave',
  DOCTOR: 'Doctor visit',
  MATERNITY: 'Maternity leave',
  PARENTAL: 'Parental leave',
  CARING: 'Caring for a relative at home',
};

/** EN state labels; must equal `leaveState.*` in the web EN catalog. */
export const LEAVE_STATE_LABELS_EN: Readonly<Record<LeaveState, string>> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

/** Error codes of the leave date rules (`leaveDateRuleError`). */
export type LeaveDateRuleError =
  | typeof ErrorCode.LEAVE_END_BEFORE_START
  | typeof ErrorCode.LEAVE_HALF_DAY_MULTIPLE_DAYS;

/** Error codes of the new-leave rules (`newLeaveRuleError`, LV-01 / LV-02). */
export type NewLeaveRuleError =
  LeaveDateRuleError | typeof ErrorCode.LEAVE_TOO_LONG;

/** Messages of the leave rules (old UI strings, LV-01; LEAVE_TOO_LONG is new). */
export const LEAVE_DATE_RULE_MESSAGES: Readonly<
  Record<NewLeaveRuleError, string>
> = {
  LEAVE_END_BEFORE_START: 'Start date must not be greater than end date',
  LEAVE_TOO_LONG: 'Leave must be shorter than 2 years',
  LEAVE_HALF_DAY_MULTIPLE_DAYS:
    'Half day option is allowed only within single day',
};

/**
 * Cross-field leave rules (DATA-02), shared by the Leave schema, LV-01 and
 * MIG-01. Both dates must already be valid `YYYY-MM-DD` dates (string compare
 * is valid for that format). When both rules fail, END_BEFORE_START wins.
 * The new-leave limits (`newLeaveRuleError`) are not part of it: they bind
 * what users enter, not the stored or migrated data.
 */
export function leaveDateRuleError(leave: {
  startDate: IsoDate;
  endDate: IsoDate;
  isHalfDay: boolean;
}): LeaveDateRuleError | null {
  if (leave.endDate < leave.startDate) return ErrorCode.LEAVE_END_BEFORE_START;
  if (leave.isHalfDay && leave.startDate !== leave.endDate)
    return ErrorCode.LEAVE_HALF_DAY_MULTIPLE_DAYS;
  return null;
}

/** Earliest date a new leave may start or end on (inclusive). */
export const LEAVE_MIN_DATE: IsoDate = '2000-01-01';
/** Latest date a new leave may start or end on (inclusive). */
export const LEAVE_MAX_DATE: IsoDate = '2100-12-31';
/** A new leave must be shorter than this many calendar years. */
export const LEAVE_MAX_YEARS = 2;

/** Date fields of a new leave (LV-01 body, LV-02 form). */
export type LeaveDateField = 'startDate' | 'endDate';

/**
 * Per-field check of a new leave date (LV-01 / LV-02): `null` when `value`
 * is a real `YYYY-MM-DD` date within LEAVE_MIN_DATE..LEAVE_MAX_DATE, else the
 * message (the API answers it as 400 `VALIDATION_FAILED`).
 */
export function leaveDateFieldError(
  field: LeaveDateField,
  value: unknown,
): string | null {
  if (!isIsoDate(value)) return `${field} must be a date in YYYY-MM-DD format`;
  if (value < LEAVE_MIN_DATE || value > LEAVE_MAX_DATE)
    return `${field} must be between ${LEAVE_MIN_DATE} and ${LEAVE_MAX_DATE}`;
  return null;
}

const isLeapYear = (y: number): boolean =>
  (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * The first end date that makes a leave from `startDate` too long:
 * `startDate` + LEAVE_MAX_YEARS calendar years (2026-03-01 → 2028-03-01, so
 * 2028-02-29 is the last allowed end date). A 29 February start maps to
 * 28 February when the target year is not a leap year (2028-02-29 →
 * 2030-02-28, last allowed end 2030-02-27), as date-fns `addYears`, Java
 * `plusYears` and PostgreSQL intervals do: the leave never exceeds the
 * period. `startDate` must be a valid `YYYY-MM-DD` date.
 */
export function leaveEndDateLimit(startDate: IsoDate): IsoDate {
  const year = Number(startDate.slice(0, 4)) + LEAVE_MAX_YEARS;
  let monthDay = startDate.slice(4);
  if (monthDay === '-02-29' && !isLeapYear(year)) monthDay = '-02-28';
  return `${String(year).padStart(4, '0')}${monthDay}`;
}

/**
 * Cross-field rules of a new leave (LV-01, reused by the LV-02 form), after
 * every `leaveDateFieldError` passed. Precedence: END_BEFORE_START, then
 * TOO_LONG (`endDate` not before `leaveEndDateLimit(startDate)`), then
 * HALF_DAY_MULTIPLE_DAYS.
 */
export function newLeaveRuleError(leave: {
  startDate: IsoDate;
  endDate: IsoDate;
  isHalfDay: boolean;
}): NewLeaveRuleError | null {
  const rule = leaveDateRuleError(leave);
  if (rule === ErrorCode.LEAVE_END_BEFORE_START) return rule;
  if (leave.endDate >= leaveEndDateLimit(leave.startDate))
    return ErrorCode.LEAVE_TOO_LONG;
  return rule;
}
