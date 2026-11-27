/**
 * MIG-03 expected-diff classes. A diff with a class is reported but does
 * not fail the run; any unclassified diff does. Each class matches one safe
 * fix or intended change (ATT-01..04, WD-01, MIG-01):
 *
 * `leave` value classes (HOLIDAY_REFRESH, LEAVE_YEAR_CHECK,
 * MIGRATION_REPORT) need an exact prediction: both values equal the
 * simulated values of `cells.mts`, and the class is why they differ.
 *
 * - HOLIDAY_REFRESH: a `leave` value differs on a date whose working-day
 *   status differs between old `date-holidays` 1.2.0 SK (any holiday type)
 *   and WD-01 (pinned, public holidays only).
 * - HANG_FIX: the old app timed out in a month where an employee without
 *   `togglUserId` has an APPROVED leave on an (old) working day; new 200.
 *   The new answer is then compared with the old baseline app
 *   (`harness.mts`; diffs prefixed `baseline:`).
 * - MIGRATION_REPORT: a `leave` diff on a user/date covered by a leave or
 *   user the MIG-01 report lists as skipped or changed.
 * - NO_TOGGL_ID_SKIPPED: the old app sent a Toggl request with
 *   `user_ids: [null]` (employee without `togglUserId`); new sends none.
 *   If that made the old app answer 500 Toggl, the whole response, and the
 *   new answer is compared with the old baseline app.
 * - LEAVE_YEAR_CHECK: a `leave` diff for a user with an APPROVED leave
 *   spanning more than 11 months over the requested month (old checked the
 *   month number only).
 * - NON_FINITE_PARAM: a non-finite year/month (`Infinity`) — and, an
 *   extension of the spec's class, a finite value outside the JS Date range
 *   (`1e20`) — where the new app answers 400 with the old text.
 * - UNEXPECTED_ERROR_500: the old app hung in a month that is not a
 *   HANG_FIX month, the new app answers 500
 *   `{"message":"Internal server error"}`. In a HANG_FIX month the new app
 *   must answer 200; a 500 there stays an unexplained DIFF.
 * - TIMEOUT_REDIRECT_LIMIT: a fixture injected latency or redirects and the
 *   new app answers the old SSO / Toggl 500 text.
 * - CORS_HEADERS: old `Access-Control-Allow-Origin: *`, new none. Header
 *   notes do not change a request's status (only `Content-Type` is part of
 *   the comparison).
 *
 * Leave-list classes (`leave-list.mts`; MIGRATION_REPORT is shared):
 *
 * - LIST_ORDER: same leaves in a different order, and the new list is
 *   exactly in LST-01 order: `startDate` desc, `createdAt` desc, `id` asc
 *   (old: MongoDB natural order).
 * - NUMDAYS_RECOMPUTED: `numDays` differs on a leave whose MIG-01 finding
 *   `LEAVE_NUMDAYS_CHANGED` records exactly this old and new value.
 * - DENIED_EXPLICIT_ERROR: no or an invalid session, an unknown or removed
 *   user: old `getLeaves: null`, new 401 with the request's exact expected
 *   code (`AUTH_REQUIRED`, `ACCESS_TOKEN_INVALID`, `USER_DEACTIVATED`).
 * - USER_EMAIL_REMOVED: the old answer carried user `email`, the new one
 *   does not (one diff per answer, `$fields.user.email`; scenarios:
 *   `$result.approver.email`).
 * - MIGRATION_REPORT (list): a leave missing in the new list that MIG-01
 *   reports as skipped.
 *
 * Write-scenario classes (`scenarios.mts`; DENIED_EXPLICIT_ERROR is
 * shared, and there the step names the exact new status and code):
 *
 * - VALIDATION_REJECTED: the old app stored an invalid leave, the new one
 *   answers the step's exact 400 code; afterwards that leave is missing in
 *   the new list.
 * - UNKNOWN_ID_404: approve / reject of an unknown id: old resolver built an
 *   empty leave GraphQL could not return, new 404 `LEAVE_NOT_FOUND`.
 * - REQUESTER_DECISION_EMAIL: a new-only email equal to the predicted
 *   NOT-03 email (recipient, subject, every field, link).
 * - NEW_LEAVE_EMAIL_WORDING: in the new-leave email, exactly the heading
 *   typo fix, the readable type label or the `/approval` link.
 */
import type { AppResponse, Diff, OutgoingRequest } from './compare.mts';
import type { MockRecord } from './mock-server.mts';
import { monthKey, type ParityRequest } from './months.mts';

export const DIFF_CLASSES = [
  'HOLIDAY_REFRESH',
  'HANG_FIX',
  'MIGRATION_REPORT',
  'NO_TOGGL_ID_SKIPPED',
  'LEAVE_YEAR_CHECK',
  'NON_FINITE_PARAM',
  'UNEXPECTED_ERROR_500',
  'TIMEOUT_REDIRECT_LIMIT',
  'CORS_HEADERS',
  'LIST_ORDER',
  'NUMDAYS_RECOMPUTED',
  'DENIED_EXPLICIT_ERROR',
  'VALIDATION_REJECTED',
  'UNKNOWN_ID_404',
  'REQUESTER_DECISION_EMAIL',
  'NEW_LEAVE_EMAIL_WORDING',
  'USER_EMAIL_REMOVED',
] as const;
export type DiffClass = (typeof DIFF_CLASSES)[number];

/**
 * The approved change behind each class: row numbers of
 * docs/functional-spec.md §10 "Changes vs the old system". A class is a
 * normalization rule only because the change it hides was decided; a new
 * class needs a §10 row first (checked by classify.spec.ts).
 */
export const APPROVED_CHANGES: Readonly<Record<DiffClass, readonly number[]>> =
  {
    HOLIDAY_REFRESH: [6],
    HANG_FIX: [24],
    MIGRATION_REPORT: [28, 29],
    NO_TOGGL_ID_SKIPPED: [24],
    LEAVE_YEAR_CHECK: [25],
    NON_FINITE_PARAM: [26],
    UNEXPECTED_ERROR_500: [26],
    TIMEOUT_REDIRECT_LIMIT: [30],
    CORS_HEADERS: [27],
    LIST_ORDER: [19],
    NUMDAYS_RECOMPUTED: [2, 28],
    DENIED_EXPLICIT_ERROR: [9],
    VALIDATION_REJECTED: [1, 3],
    UNKNOWN_ID_404: [10],
    REQUESTER_DECISION_EMAIL: [13],
    NEW_LEAVE_EMAIL_WORDING: [14],
    USER_EMAIL_REMOVED: [31],
  };

/** Inclusive `YYYY-MM-DD` range. */
export interface DateRange {
  start: string;
  end: string;
}

export interface ClassifyContext {
  /** Dates whose working-day status differs between old and new rules. */
  holidayMismatch: ReadonlySet<string>;
  /** Effective months (`YYYY-MM`) where the old app is expected to hang. */
  hangMonths: ReadonlySet<string>;
  /** SSO name → APPROVED leaves spanning more than 11 months. */
  longLeaves: ReadonlyMap<string, readonly DateRange[]>;
  /**
   * SSO name → date ranges of leaves the MIG-01 report lists as skipped or
   * changed; `'all'` when the user record itself was skipped.
   */
  migrationReported: ReadonlyMap<string, readonly DateRange[] | 'all'>;
  /**
   * The `leave` value both apps must write for an SSO name on a date
   * (`cells.mts`), with the approved reason they differ; `null` when it
   * cannot be predicted (then no `leave` diff is excused).
   */
  predictLeave: (name: string, date: string) => LeavePrediction | null;
}

/** Simulated `leave` values of one day (see `cells.mts`). */
export interface LeavePrediction {
  old: string;
  new: string;
  /** Why they differ: LEAVE_YEAR_CHECK, HOLIDAY_REFRESH, MIGRATION_REPORT. */
  reason: DiffClass | null;
}

export const EMPTY_CONTEXT: ClassifyContext = {
  holidayMismatch: new Set(),
  hangMonths: new Set(),
  longLeaves: new Map(),
  migrationReported: new Map(),
  predictLeave: () => null,
};

export const INTERNAL_ERROR_BODY = '{"message":"Internal server error"}';
const PARAM_400_BODIES = new Set([
  '{"message":"Month is not a number."}',
  '{"message":"Year is not a number."}',
]);
const UPSTREAM_500_BODIES = new Set([
  '{"message":"Cannot get data from SSO, try again later."}',
  '{"message":"Cannot get data from Toggl, try again later."}',
]);
const TOGGL_500_BODY =
  '{"message":"Cannot get data from Toggl, try again later."}';

/** `attendence.<name>.days.<index>.leave` → name and 0-based day index. */
const LEAVE_PATH = /^attendence\.(.+)\.days\.(\d+)\.leave$/;

const sentNullUser = (r: { service: string; body: unknown }) =>
  r.service === 'toggl' &&
  typeof r.body === 'object' &&
  r.body !== null &&
  Array.isArray((r.body as { user_ids?: unknown }).user_ids) &&
  (r.body as { user_ids: unknown[] }).user_ids.some((id) => id === null);

export interface ClassifyInput {
  request: ParityRequest;
  oldRes: AppResponse;
  newRes: AppResponse;
  /** Response + request diffs (from `compare.mts`). */
  diffs: Diff[];
  oldRecords: readonly MockRecord[];
  newRecords: readonly MockRecord[];
  context: ClassifyContext;
}

const isBody = (r: AppResponse, status: number, bodies: ReadonlySet<string>) =>
  r.kind === 'response' && r.status === status && bodies.has(r.body);

/** A class for every diff of the request (whole-response rules). */
export function wholeResponseClass(input: ClassifyInput): DiffClass | null {
  const { request, oldRes, newRes, oldRecords, newRecords, context } = input;
  if (request.kind === 'non-finite' && isBody(newRes, 400, PARAM_400_BODIES))
    return 'NON_FINITE_PARAM';
  if (oldRes.kind === 'timeout') {
    const month = request.effective
      ? monthKey(request.effective.year, request.effective.month)
      : null;
    const hangMonth = month !== null && context.hangMonths.has(month);
    if (hangMonth && newRes.kind === 'response' && newRes.status === 200)
      return 'HANG_FIX';
    // A HANG_FIX month must answer 200: a 500 there is a regression of the
    // ATT-04 skip path, not an expected diff (spec: "other than HANG_FIX").
    if (!hangMonth && isBody(newRes, 500, new Set([INTERNAL_ERROR_BODY])))
      return 'UNEXPECTED_ERROR_500';
  }
  if (
    newRecords.some((r) => r.injected) &&
    isBody(newRes, 500, UPSTREAM_500_BODIES)
  )
    return 'TIMEOUT_REDIRECT_LIMIT';
  if (
    isBody(oldRes, 500, new Set([TOGGL_500_BODY])) &&
    oldRecords.some(sentNullUser) &&
    newRes.kind === 'response' &&
    newRes.status === 200
  )
    return 'NO_TOGGL_ID_SKIPPED';
  return null;
}

/**
 * Class of one `leave` value diff: only when the old value is exactly the
 * simulated old value, the new value exactly the simulated new value, and
 * the simulations differ for an approved reason.
 */
function leaveClass(
  name: string,
  date: string,
  d: Diff,
  context: ClassifyContext,
): DiffClass | null {
  const p = context.predictLeave(name, date);
  if (!p || d.old !== p.old || d.new !== p.new) return null;
  return p.reason;
}

/** Labels each diff with its expected class where one applies. */
export function classify(input: ClassifyInput): Diff[] {
  const whole = wholeResponseClass(input);
  return input.diffs.map((d) => {
    if (whole) return { ...d, class: whole };
    if (d.kind === 'request-old-only') {
      const rec = d.old as OutgoingRequest | undefined;
      if (rec && sentNullUser(rec))
        return { ...d, class: 'NO_TOGGL_ID_SKIPPED' };
      return d;
    }
    if (d.kind === 'value' && input.request.effective) {
      const m = LEAVE_PATH.exec(d.path);
      if (m) {
        const eff = input.request.effective;
        const day = Number(m[2]) + 1;
        const date = `${monthKey(eff.year, eff.month)}-${String(day).padStart(2, '0')}`;
        const cls = leaveClass(m[1]!, date, d, input.context);
        if (cls) return { ...d, class: cls };
      }
    }
    return d;
  });
}

/** CORS header note (reported per run, never fails). */
export function corsNote(
  oldRes: AppResponse,
  newRes: AppResponse,
): Diff | null {
  const a = oldRes.kind === 'response' ? oldRes.acao : null;
  const b = newRes.kind === 'response' ? newRes.acao : null;
  if (a === b) return null;
  return {
    kind: 'value',
    path: '$header.access-control-allow-origin',
    old: a,
    new: b,
    class: a === '*' && b === null ? 'CORS_HEADERS' : undefined,
  };
}

export type EntryStatus = 'EQUAL' | 'EXPECTED_DIFF' | 'DIFF' | 'ERROR';

/** EQUAL / EXPECTED_DIFF / DIFF from the classified diffs. */
export function statusOf(
  diffs: readonly Diff[],
): Exclude<EntryStatus, 'ERROR'> {
  if (diffs.length === 0) return 'EQUAL';
  return diffs.every((d) => d.class) ? 'EXPECTED_DIFF' : 'DIFF';
}
