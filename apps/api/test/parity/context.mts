/**
 * MIG-03: builds the classifier context from the dataset (legacy `users`
 * and `leaves` as the old app sees them), the SSO answer, both apps'
 * non-working-day rules and the MIG-01 migration report.
 */
import { type Cells, type SideData, simulateCells } from './cells.mts';
import type {
  ClassifyContext,
  DateRange,
  DiffClass,
  LeavePrediction,
} from './classify.mts';
import { monthKey } from './months.mts';

export interface LegacyUserDoc {
  id?: unknown;
  email?: unknown;
}

export interface LegacyLeaveDoc {
  id?: unknown;
  requesterId?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  state?: unknown;
}

/** SSO record flattened like the old `getUserDataFromSSO`. */
export type SsoRecord = Record<string, unknown> & {
  name?: unknown;
  email?: unknown;
};

export interface MigrationFinding {
  code: string;
  collection: 'users' | 'leaves';
  recordId: string | null;
  action: string;
  details?: Record<string, unknown> | null;
}

export interface ContextInput {
  sso: readonly SsoRecord[];
  users: readonly LegacyUserDoc[];
  leaves: readonly LegacyLeaveDoc[];
  timezone: string;
  /** Old app: weekend or any `date-holidays` 1.2.0 SK holiday. */
  oldNonWorking: ReadonlySet<string>;
  /** New app (WD-01). */
  newIsWorkingDay: (date: string) => boolean;
  /** Every date the old non-working set was computed for. */
  dates: readonly string[];
  findings?: readonly MigrationFinding[];
  /**
   * What each app's attendance reads (`cells.mts`): old legacy data with
   * old working days, new migrated data with WD-01. Without it no `leave`
   * diff can be predicted, so none is excused.
   */
  cells?: { old: SideData; new: SideData };
}

/** Flattens the SSO answer like the old app (`keys` override fields). */
export function flattenSso(body: unknown): SsoRecord[] {
  if (!Array.isArray(body)) return [];
  return body.map((u: { name?: unknown; email?: unknown; keys?: unknown }) => {
    const out: SsoRecord = { name: u?.name, email: u?.email };
    if (Array.isArray(u?.keys))
      for (const kv of u.keys as { key: string; value: unknown }[])
        out[kv.key] = kv.value;
    return out;
  });
}

/** `YYYY-MM-DD` of an instant in `timeZone`. */
export function localDate(value: unknown, timeZone: string): string | null {
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Every `YYYY-MM-DD` from `start` to `end` inclusive. */
export function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const monthIndex = (date: string) =>
  Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;

const REPORTED_ACTIONS = new Set(['skipped', 'migrated-with-default']);
/** Warnings that change a migrated leave's dates. */
const REPORTED_CODES = new Set(['LEAVE_DATE_NOT_LOCAL_MIDNIGHT']);

export function buildContext(input: ContextInput): ClassifyContext {
  const tz = input.timezone;
  const usersByEmail = new Map<string, LegacyUserDoc>();
  for (const u of input.users)
    if (typeof u.email === 'string') usersByEmail.set(u.email, u);
  const usersById = new Map<string, LegacyUserDoc>();
  for (const u of input.users) usersById.set(String(u.id), u);
  const leavesById = new Map<string, LegacyLeaveDoc>();
  for (const l of input.leaves) leavesById.set(String(l.id), l);

  const rangeOf = (l: LegacyLeaveDoc): DateRange | null => {
    const start = localDate(l.startDate, tz);
    const end = localDate(l.endDate, tz);
    return start && end && start <= end ? { start, end } : null;
  };
  const approvedOf = (userId: unknown) =>
    input.leaves.filter(
      (l) => l.requesterId === userId && l.state === 'APPROVED',
    );
  /** SSO names whose (exact, case-sensitive) email is the user's. */
  const namesOf = (user: LegacyUserDoc) =>
    input.sso.filter((s) => s.email === user.email).map((s) => String(s.name));

  const holidayMismatch = new Set<string>();
  for (const d of input.dates)
    if (input.oldNonWorking.has(d) === input.newIsWorkingDay(d))
      holidayMismatch.add(d);

  // Old hang: an employee without togglUserId whose APPROVED leave overlaps
  // the month and has an (old) working day with that month number (the old
  // loop checks the month number only).
  const hangMonths = new Set<string>();
  for (const s of input.sso) {
    if (s.employee !== '1' || s.togglUserId) continue;
    const user = usersByEmail.get(String(s.email));
    if (!user) continue;
    for (const l of approvedOf(user.id)) {
      const r = rangeOf(l);
      if (!r) continue;
      const working = eachDate(r.start, r.end).filter(
        (d) => !input.oldNonWorking.has(d),
      );
      for (let i = monthIndex(r.start); i <= monthIndex(r.end); i++) {
        const month = (i % 12) + 1;
        if (working.some((d) => Number(d.slice(5, 7)) === month))
          hangMonths.add(monthKey(Math.floor(i / 12), month));
      }
    }
  }

  const longLeaves = new Map<string, DateRange[]>();
  for (const s of input.sso) {
    const user = usersByEmail.get(String(s.email));
    if (!user) continue;
    for (const l of approvedOf(user.id)) {
      const r = rangeOf(l);
      if (r && monthIndex(r.end) - monthIndex(r.start) >= 12) {
        const name = String(s.name);
        longLeaves.set(name, [...(longLeaves.get(name) ?? []), r]);
      }
    }
  }

  const migrationReported = new Map<string, DateRange[] | 'all'>();
  for (const f of input.findings ?? []) {
    if (!REPORTED_ACTIONS.has(f.action) && !REPORTED_CODES.has(f.code))
      continue;
    if (f.collection === 'users' && f.action === 'skipped') {
      const user = f.recordId ? usersById.get(f.recordId) : undefined;
      if (user)
        for (const name of namesOf(user)) migrationReported.set(name, 'all');
    } else if (f.collection === 'leaves' && f.recordId) {
      const leave = leavesById.get(f.recordId);
      const user = leave ? usersById.get(String(leave.requesterId)) : undefined;
      const r = leave ? rangeOf(leave) : null;
      if (!user || !r) continue;
      for (const name of namesOf(user)) {
        const prev = migrationReported.get(name);
        if (prev !== 'all') migrationReported.set(name, [...(prev ?? []), r]);
      }
    }
  }

  const predictLeave = cellPredictor(input, holidayMismatch, migrationReported);
  return {
    holidayMismatch,
    hangMonths,
    longLeaves,
    migrationReported,
    predictLeave,
  };
}

/**
 * `predictLeave` from three simulations per month: old (month number
 * only), old with the year checked, and new. The reason the old and new
 * values differ: the year check, else a holiday mismatch on that date,
 * else a MIG-01 finding on a leave of that user covering the date.
 */
function cellPredictor(
  input: ContextInput,
  holidayMismatch: ReadonlySet<string>,
  migrationReported: ReadonlyMap<string, readonly DateRange[] | 'all'>,
): (name: string, date: string) => LeavePrediction | null {
  const cells = input.cells;
  if (!cells) return () => null;
  const cache = new Map<
    string,
    { old: Cells | null; oldYear: Cells | null; new: Cells | null }
  >();
  const sims = (y: number, m: number) => {
    const key = `${y}-${m}`;
    let hit = cache.get(key);
    if (!hit) {
      hit = {
        old: simulateCells(input.sso, cells.old, y, m),
        oldYear: simulateCells(
          input.sso,
          { ...cells.old, monthOnly: false },
          y,
          m,
        ),
        new: simulateCells(input.sso, cells.new, y, m),
      };
      cache.set(key, hit);
    }
    return hit;
  };
  return (name, date) => {
    const s = sims(Number(date.slice(0, 4)), Number(date.slice(5, 7)));
    const i = Number(date.slice(8, 10)) - 1;
    const old = s.old?.get(name)?.[i];
    const oldYear = s.oldYear?.get(name)?.[i];
    const now = s.new?.get(name)?.[i];
    if (old === undefined || oldYear === undefined || now === undefined)
      return null;
    let reason: DiffClass | null = null;
    if (old !== oldYear) reason = 'LEAVE_YEAR_CHECK';
    else if (holidayMismatch.has(date)) reason = 'HOLIDAY_REFRESH';
    else {
      const rep = migrationReported.get(name);
      if (rep === 'all' || rep?.some((r) => date >= r.start && date <= r.end))
        reason = 'MIGRATION_REPORT';
    }
    return { old, new: now, reason };
  };
}
