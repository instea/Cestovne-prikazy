import { type IsoDate, LeaveType } from '@leaves/shared/leaves';
import { isIsoDate, isWorkingDay } from '@leaves/shared/workdays';
import type { SsoUser } from './sso/sso.client';

/**
 * ATT-04 pure assembly of the attendance object, 1:1 with the old
 * `server/service/attendenceService.js` output: same key order, numbers,
 * empty values and name-keyed collisions. Plain objects (not `Map`) on
 * purpose: JS object key order (integer-like keys ascending, then insertion
 * order) is part of the contract.
 */

export interface AttendanceDay {
  logged_time: number;
  leave: string;
}

/** Key order `days`, `total`, `contractType` (absent when SSO has none). */
export interface AttendanceEntry {
  days: AttendanceDay[];
  total: number;
  contractType?: unknown;
}

/** Top-level key order `start`, `end`, `attendence`. */
export interface AttendanceResponse {
  start: string;
  end: string;
  attendence: Record<string, AttendanceEntry>;
}

/** Effective month (ATT-01 normalization) and whether leave codes apply. */
export interface AttendancePeriod {
  year: number;
  /** 1–12. */
  month: number;
  /** Raw month param was an integer in 1–12 (old quirk, ATT-01). */
  leaveCodes: boolean;
}

export interface MonthRange {
  startString: IsoDate;
  endString: IsoDate;
  daysInMonth: number;
}

/**
 * ATT-01 normalization of finite numeric params (old `Date#setMonth`
 * overflow): `2024/13` → 2025-01, `2024/0` → 2023-12, `2024/1.5` → 2024-01.
 * Leave codes only when the raw month is an integer 1–12.
 */
export function attendancePeriod(
  year: number,
  month: number,
): AttendancePeriod {
  const y = Math.trunc(year);
  const mi = Math.trunc(month - 1);
  return {
    year: y + Math.floor(mi / 12),
    month: (((mi % 12) + 12) % 12) + 1,
    leaveCodes: Number.isInteger(month) && month >= 1 && month <= 12,
  };
}

const pad = (n: number, width: number) =>
  n < 0
    ? `-${String(-n).padStart(width, '0')}`
    : String(n).padStart(width, '0');

export function monthRange(year: number, month: number): MonthRange {
  const last = new Date(0);
  last.setUTCFullYear(year, month, 0); // day 0 of next month = last day
  const daysInMonth = last.getUTCDate();
  const ym = `${pad(year, 4)}-${pad(month, 2)}`;
  return {
    startString: `${ym}-01`,
    endString: `${ym}-${pad(daysInMonth, 2)}`,
    daysInMonth,
  };
}

/**
 * Old `attendence[togglUserId]`: JS property-key coercion of the value as
 * delivered (Toggl's `user_id` is matched with the same `String()`).
 */
export function entryKey(togglUserId: unknown): string {
  return String(togglUserId);
}

/** Internal state: entries keyed by `togglUserId`, plus their names. */
export interface AttendanceDraft {
  entries: Record<string, AttendanceEntry>;
  names: Record<string, unknown>;
}

/**
 * Old init: every listed SSO user (truthy `togglUserId`, any `employee`), in
 * SSO order, gets all-zero days. A duplicate `togglUserId` re-initializes
 * the same entry and its name wins.
 */
export function initDraft(
  users: readonly SsoUser[],
  daysInMonth: number,
): AttendanceDraft {
  const entries: Record<string, AttendanceEntry> = {};
  const names: Record<string, unknown> = {};
  for (const user of users) {
    if (!user.togglUserId) continue;
    const key = entryKey(user.togglUserId);
    const entry: AttendanceEntry = {
      days: Array.from({ length: daysInMonth }, () => ({
        logged_time: 0,
        leave: '',
      })),
      total: 0,
    };
    if (user.contractType !== undefined) entry.contractType = user.contractType;
    entries[key] = entry;
    names[key] = user.name;
  }
  return { entries, names };
}

/** ANNUAL `D8` / `D4` (half-day), SICKNESS `PN`, DOCTOR `L`, other `I`. */
export function leaveCode(type: string, isHalfDay: boolean): string {
  switch (type as LeaveType) {
    case LeaveType.ANNUAL:
      return isHalfDay ? 'D4' : 'D8';
    case LeaveType.SICKNESS:
      return 'PN';
    case LeaveType.DOCTOR:
      return 'L';
    default:
      return 'I';
  }
}

export function appendLeaveCode(day: AttendanceDay, code: string): void {
  day.leave = day.leave === '' ? code : `${day.leave}, ${code}`;
}

const MS_PER_DAY = 86_400_000;

function nextDay(date: IsoDate): IsoDate {
  return new Date(Date.parse(`${date}T00:00:00Z`) + MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

/** Days of `[startDate, endDate]` inside the range (year and month checked). */
export function clippedDates(
  leave: { startDate: IsoDate; endDate: IsoDate },
  range: Pick<MonthRange, 'startString' | 'endString'>,
): IsoDate[] {
  const from =
    leave.startDate > range.startString ? leave.startDate : range.startString;
  const to = leave.endDate < range.endString ? leave.endDate : range.endString;
  const out: IsoDate[] = [];
  for (let d = from; d <= to; d = nextDay(d)) out.push(d);
  return out;
}

/** The leave fields the assembly reads. */
export interface AttendanceLeave {
  startDate: IsoDate;
  endDate: IsoDate;
  type: string;
  isHalfDay: boolean;
}

/**
 * Writes the codes of APPROVED `leaves` (already in `_id` order) into
 * `entry` on the working days (WD-01) of the range.
 */
export function applyLeaves(
  entry: AttendanceEntry,
  leaves: readonly AttendanceLeave[],
  range: MonthRange,
  workingDay: (date: IsoDate) => boolean = isWorkingDay,
): void {
  // Guard for absurd years (no 4-digit dates): no stored leave can match.
  if (!isIsoDate(range.startString) || !isIsoDate(range.endString)) return;
  for (const leave of leaves) {
    const code = leaveCode(leave.type, leave.isHalfDay);
    for (const date of clippedDates(leave, range)) {
      if (!workingDay(date)) continue;
      const day = entry.days[Number(date.slice(8, 10)) - 1];
      if (day) appendLeaveCode(day, code);
    }
  }
}

/**
 * Old rename loop: walk the draft in JS key order and re-key by
 * `String(name)`; a later duplicate name overwrites the value, the key keeps
 * the first position.
 */
export function keyByName(
  draft: AttendanceDraft,
): Record<string, AttendanceEntry> {
  const out: Record<string, AttendanceEntry> = {};
  for (const key of Object.keys(draft.entries)) {
    out[String(draft.names[key])] = draft.entries[key]!;
  }
  return out;
}
