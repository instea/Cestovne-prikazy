/**
 * LST-03 calendar view: requester colours and the mapping of leaves to
 * FullCalendar all-day events (port of the old `leaves-calendar.component.ts`
 * and `color.service.ts`, with a deterministic per-user colour).
 */
import type { LeaveDto } from './dto.js';
import { LeaveState, LeaveType } from './leaves.js';
import { colorIndex, formatUserRef } from './users.js';
import type { FormatUserNameOptions } from './users.js';
import type { IsoDate } from './workdays.js';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * The old palette (`color.service.ts:3-19`) of `USER_COLOR_COUNT` (15)
 * colours; index = `colorIndex`.
 */
export const USER_COLORS: readonly Readonly<Rgb>[] = Object.freeze(
  (
    [
      [134, 182, 201], // #86b6c9
      [207, 159, 144], // #cf9f90
      [173, 194, 109], // #adc26d
      [67, 173, 212], // #43add4
      [209, 147, 218], // #d193da
      [254, 205, 143], // #fecd8f
      [167, 226, 120], // #a7e278
      [210, 198, 190], // #d2c6be
      [31, 192, 191], // #1fc0bf
      [247, 195, 210], // #f7c3d2
      [255, 135, 50], // #ff8732
      [197, 183, 171], // #c5b7ab
      [167, 221, 152], // #a7dd98
      [226, 243, 202], // #e2f3ca
      [133, 234, 245], // #85eaf5
    ] as const
  ).map(([r, g, b]) => Object.freeze({ r, g, b })),
);

/**
 * Stable calendar colour of a user: the same on every device, session and
 * filter (key = `User.id`, never the email, which anonymization may change).
 */
export function colorForUser(userId: string): Rgb {
  return { ...USER_COLORS[colorIndex(userId)]! };
}

/** `rgb(r,g,b)` for APPROVED, `rgba(r,g,b,0.5)` otherwise (old rule). */
export function leaveColor(
  color: Rgb,
  state: LeaveState | `${LeaveState}`,
): string {
  const { r, g, b } = color;
  return state === LeaveState.APPROVED
    ? `rgb(${r},${g},${b})`
    : `rgba(${r},${g},${b},0.5)`;
}

/**
 * Type letter in the event title: the first letter of the code, the same in
 * the SK and EN UI (LST-03 title format `<Full Name> [1/2 ](<letter>)`).
 */
export const LEAVE_TYPE_LETTERS: Readonly<Record<LeaveType, string>> = {
  ANNUAL: 'A',
  SICKNESS: 'S',
  DOCTOR: 'D',
  MATERNITY: 'M',
  PARENTAL: 'P',
  CARING: 'C',
};

/** `date` plus `days` calendar days, as `YYYY-MM-DD` (no timezone involved). */
export function addDays(date: IsoDate, days: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/** A read-only all-day FullCalendar event (`EventInput` subset). */
export interface CalendarEvent {
  id: string;
  title: string;
  allDay: true;
  start: IsoDate;
  /** Exclusive: the day after the leave's `endDate`. */
  end: IsoDate;
  /**
   * Background and border colour (FullCalendar 7 `color`); the text colour
   * is the calendar-wide opaque `eventContrastColor`.
   */
  color: string;
}

export interface CalendarEventOptions extends FormatUserNameOptions {
  /** Half-day marker before the type letter (default `1/2`). */
  halfDay?: string;
}

type CalendarLeave = Pick<
  LeaveDto,
  'id' | 'requester' | 'startDate' | 'endDate' | 'isHalfDay' | 'type' | 'state'
>;

/**
 * Event of one leave: title `Jana Nová (A)` / `Jana Nová 1/2 (D)` /
 * `Peter Starý (deactivated) (S)` (`Deleted <id>` for a missing user), colour of the requester with alpha 1 for
 * APPROVED and 0.5 otherwise, `end` = `endDate` + 1 day (exclusive).
 */
export function toCalendarEvent(
  leave: CalendarLeave,
  options: CalendarEventOptions = {},
): CalendarEvent {
  const { halfDay = '1/2', ...nameOptions } = options;
  const name = formatUserRef(leave.requester, nameOptions);
  const marker = leave.isHalfDay ? `${halfDay} ` : '';
  // A missing requester (`null`, defensive) is keyed by '' like the filters.
  const color = leaveColor(
    colorForUser(leave.requester?.id ?? ''),
    leave.state,
  );
  return {
    id: leave.id,
    title: `${name} ${marker}(${LEAVE_TYPE_LETTERS[leave.type]})`,
    allDay: true,
    start: leave.startDate,
    end: addDays(leave.endDate, 1),
    color,
  };
}

/** Visible events: the (already filtered) leaves without REJECTED ones. */
export function toCalendarEvents(
  leaves: readonly CalendarLeave[],
  options: CalendarEventOptions = {},
): CalendarEvent[] {
  return leaves
    .filter((leave) => leave.state !== LeaveState.REJECTED)
    .map((leave) => toCalendarEvent(leave, options));
}
