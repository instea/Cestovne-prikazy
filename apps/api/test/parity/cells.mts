/**
 * MIG-03 attendance oracle: the `leave` value of every day of a month, as
 * each app must write it, simulated from the data each app sees. The
 * classifier excuses a `leave` diff only when the old value equals the
 * simulated old value AND the new value equals the simulated new value, and
 * the two simulations differ for an approved reason (classify.mts).
 *
 * Old (`server/service/attendenceService.js` at 193b89f), on the legacy
 * data in natural order:
 * - entries: SSO users with a `togglUserId`, keyed by it (a repeated id
 *   re-initializes the entry); renamed to the SSO name in JS key order
 *   (integer-like keys ascending, then insertion order), a later key wins a
 *   name collision;
 * - per SSO user with `employee === '1'` (and a `togglUserId`; without one
 *   the old app fails, see the baseline in `harness.mts`): the user with
 *   exactly that email, its APPROVED leaves overlapping the month, each
 *   walked from its start instant in steps of one day while `<=` its end
 *   instant; a day is written when its MONTH NUMBER is the requested one
 *   (any year) and it is an old working day;
 * - codes: ANNUAL `D8` / `D4` (half-day), SICKNESS `PN`, DOCTOR `L`, any
 *   other or missing type `I`; several joined with `", "`.
 *
 * New (functional spec §8, ATT-04), on the migrated data in `_id` order:
 * the same, but calendar dates, year AND month checked, WD-01 working days,
 * the migrated type.
 *
 * Independent of the app code on purpose: it is the oracle.
 */
import { eachDate, localDate, type SsoRecord } from './context.mts';

export interface CellUser {
  id: string;
  email: unknown;
}

/** A leave reduced to what attendance reads. */
export interface CellLeave {
  requesterId: unknown;
  /** Local start and end date (the month overlap query). */
  span: [string, string] | null;
  /** Calendar dates the app writes for, in order (old: `oldWalk`). */
  dates: string[];
  type: unknown;
  isHalfDay: boolean;
  state: unknown;
}

export interface SideData {
  users: readonly CellUser[];
  /** Old: natural order; new: `_id` order. */
  leaves: readonly CellLeave[];
  isWorkingDay: (date: string) => boolean;
  /** `true`: month number only (old); `false`: year and month (new). */
  monthOnly: boolean;
}

export type Cells = Map<string, string[]>;

/** Old leave code (`leaveTypeMap`, `|| OTHER`). */
export function leaveCode(type: unknown, isHalfDay: boolean): string {
  if (type === 'ANNUAL') return isHalfDay ? 'D4' : 'D8';
  if (type === 'SICKNESS') return 'PN';
  if (type === 'DOCTOR') return 'L';
  return 'I';
}

/** Entry key: the SSO value (a string in the directory) as a property key. */
const keyOf = (v: unknown): string =>
  typeof v === 'string' ? v : JSON.stringify(v);

const daysIn = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/** JS own-property order of object keys: array indexes ascending first. */
export function jsKeyOrder(keys: readonly string[]): string[] {
  const isIndex = (k: string) =>
    /^(0|[1-9]\d*)$/.test(k) && Number(k) < 2 ** 32 - 1;
  const idx = keys.filter(isIndex).sort((a, b) => Number(a) - Number(b));
  return [...idx, ...keys.filter((k) => !isIndex(k))];
}

/**
 * Leave codes per SSO name and day of `year`-`month`, or `null` when the
 * app would fail (a day outside the month's array).
 */
export function simulateCells(
  sso: readonly SsoRecord[],
  side: SideData,
  year: number,
  month: number,
): Cells | null {
  const n = daysIn(year, month);
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const last = `${year}-${String(month).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
  const entries = new Map<string, string[]>();
  const names = new Map<string, string>();
  for (const u of sso) {
    if (!u.togglUserId) continue;
    const key = keyOf(u.togglUserId);
    entries.set(key, new Array<string>(n).fill(''));
    names.set(key, String(u.name));
  }
  for (const u of sso) {
    if (u.employee !== '1' || !u.togglUserId) continue;
    if (typeof u.email !== 'string') continue;
    const user = side.users.find((x) => x.email === u.email);
    if (!user) continue;
    const days = entries.get(keyOf(u.togglUserId))!;
    for (const l of side.leaves) {
      if (l.requesterId !== user.id || l.state !== 'APPROVED') continue;
      if (!l.span || l.span[0] > last || l.span[1] < first) continue;
      for (const d of l.dates) {
        const m = Number(d.slice(5, 7));
        const y = Number(d.slice(0, 4));
        if (m !== month || (!side.monthOnly && y !== year)) continue;
        if (!side.isWorkingDay(d)) continue;
        const i = Number(d.slice(8, 10)) - 1;
        if (i >= n) return null;
        const code = leaveCode(l.type, l.isHalfDay);
        days[i] = days[i] ? `${days[i]}, ${code}` : code;
      }
    }
  }
  const out: Cells = new Map();
  for (const key of jsKeyOrder([...entries.keys()]))
    out.set(names.get(key)!, entries.get(key)!);
  return out;
}

/** Wall-clock time of an instant in `timeZone` (`HH:mm:ss.SSS`). */
function wallTime(d: Date, timeZone: string): string {
  const t = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(d);
  return `${t}.${String(d.getUTCMilliseconds()).padStart(3, '0')}`;
}

/**
 * The calendar dates the old loop visits: from the start instant in steps
 * of one local day while `<=` the end instant (so the end date is visited
 * only if its wall time is not before the start's).
 */
export function oldWalk(
  start: unknown,
  end: unknown,
  timeZone: string,
): string[] {
  const s = start instanceof Date ? start : new Date(String(start));
  const e = end instanceof Date ? end : new Date(String(end));
  const a = localDate(s, timeZone);
  const b = localDate(e, timeZone);
  if (!a || !b || a > b) return [];
  const dates = eachDate(a, b);
  if (wallTime(s, timeZone) > wallTime(e, timeZone)) dates.pop();
  return dates;
}
