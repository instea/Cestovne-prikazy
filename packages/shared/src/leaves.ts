/**
 * DATA-02 leave enums and labels. The API and DB always store codes; labels
 * are UI-only (web i18n keys `leaveType.<CODE>` / `leaveState.<CODE>`), except
 * the EN labels below, which emails use (NOT-*).
 */
import { ErrorCode } from './enums.js';
import type { IsoDate } from './workdays.js';

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

/** Messages of the leave date rules (old UI strings, LV-01). */
export const LEAVE_DATE_RULE_MESSAGES: Readonly<
  Record<LeaveDateRuleError, string>
> = {
  LEAVE_END_BEFORE_START: 'Start date must not be greater than end date',
  LEAVE_HALF_DAY_MULTIPLE_DAYS:
    'Half day option is allowed only within single day',
};

/**
 * Cross-field leave rules (DATA-02), shared by the Leave schema, LV-01 and
 * MIG-01. Both dates must already be valid `YYYY-MM-DD` dates (string compare
 * is valid for that format). When both rules fail, END_BEFORE_START wins.
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
