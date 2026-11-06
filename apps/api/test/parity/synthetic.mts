/**
 * MIG-03 synthetic dataset (committed, CI): old-shaped `users` / `leaves`
 * documents (as in MongoDB 3.6: Date instants at local midnight in the
 * requester's browser, `_id` ObjectIds, `degrees`, `address`, `approved`,
 * `__v`), the SSO directory, and a generator for the Toggl fixtures of any
 * month list. Placeholders only (`PARITY_…`), no real data.
 *
 * Edge cases covered (expected class in brackets):
 * - Anna: several codes on one day ("D4, L"), weekend skip, PENDING /
 *   REJECTED / missing state ignored, month and year boundaries, SK
 *   holidays, dates where old and new holiday data disagree
 *   [HOLIDAY_REFRESH], a non-midnight stored instant (reported by MIG-01,
 *   same output), three-page Toggl answers with fractional hours.
 * - Boris: listed non-employee (zero entry, no Toggl / DB access).
 * - Cyril: employee without `togglUserId` and without workspace, with an
 *   APPROVED leave in June 2024 [HANG_FIX in that month].
 * - Dana: APPROVED leave spanning 13 months [LEAVE_YEAR_CHECK], no
 *   `contractType`, two-page Toggl answers.
 * - Eva ×2: duplicate SSO names (key collision, later id wins).
 * - Filip: employee with workspace but without `togglUserId`: the old app
 *   sends `user_ids: [null]` [NO_TOGGL_ID_SKIPPED].
 * - Hana: SSO email differs in case from the stored one (no leaves).
 * - Ivan: leave without `type` (old `I`, new `D8`) and a half-day leave
 *   over two days (skipped by MIG-01) [MIGRATION_REPORT].
 * - A leave of a removed user (MIG-01 placeholder), not in SSO.
 */
import { TZDate } from '@date-fns/tz';
import type { FixtureSet, TogglFixture } from './fixtures.mts';
import { daysOf } from './months.mts';

export const TIMEZONE = 'Europe/Bratislava';
export const PLACEHOLDER = {
  ssoUsername: 'PARITY_SSO_USER',
  ssoPassword: 'PARITY_SSO_PASSWORD',
  togglToken: 'PARITY_TOGGL_TOKEN',
} as const;
export const WORKSPACE_ID = '111';

/**
 * What the old app sends as `start_date` / `end_date` for a non-finite year
 * (`Infinity/1`, `1e20/3`): moment 2.19 keeps the date "valid" after
 * `.year(Infinity)` and formats the NaN fields (observed in the harness).
 */
export const OLD_NON_FINITE_DATE = '-0NaN--NaN--NaN';

interface SsoUser {
  name: string;
  email: string;
  keys: Record<string, string>;
}

interface LegacyUser {
  id: string;
  email: string;
  firstName: string;
  surname: string;
  approved?: boolean;
  isAdmin?: boolean;
}

interface LegacyLeave {
  id: string;
  requesterId: string;
  approverId?: string;
  start: string;
  end: string;
  type?: string;
  state?: string;
  isHalfDay?: boolean;
  numDays?: number;
  /** Store this exact instant instead of local midnight (both dates). */
  instant?: string;
}

const toggl = (userId: string, extra: Record<string, string> = {}) => ({
  togglUserId: userId,
  togglWorkspaceId: WORKSPACE_ID,
  togglApiToken: PLACEHOLDER.togglToken,
  employee: '1',
  ...extra,
});

export const SSO_USERS: SsoUser[] = [
  {
    name: 'Anna Nováková',
    email: 'anna.novakova@instea.co',
    keys: toggl('20', { contractType: 'TPP' }),
  },
  {
    name: 'Boris Biely',
    email: 'boris.biely@instea.co',
    keys: { togglUserId: '7', employee: '0', contractType: 'Dohoda' },
  },
  {
    name: 'Cyril Čierny',
    email: 'cyril.cierny@instea.co',
    keys: { employee: '1', contractType: 'TPP' },
  },
  { name: 'Dana Dlhá', email: 'dana.dlha@instea.co', keys: toggl('35') },
  {
    name: 'Eva',
    email: 'eva.prva@instea.co',
    keys: toggl('5', { contractType: 'TPP' }),
  },
  {
    name: 'Eva',
    email: 'eva.druha@instea.co',
    keys: toggl('9', { contractType: 'SZČO' }),
  },
  {
    name: 'Filip Fiala',
    email: 'filip.fiala@instea.co',
    keys: {
      togglWorkspaceId: WORKSPACE_ID,
      togglApiToken: PLACEHOLDER.togglToken,
      employee: '1',
    },
  },
  {
    name: 'Hana Malá',
    email: 'Hana.Mala@instea.co',
    keys: toggl('41', { contractType: 'TPP' }),
  },
  {
    name: 'Ivan Iný',
    email: 'ivan.iny@instea.co',
    keys: toggl('50', { contractType: 'TPP' }),
  },
];

export const LEGACY_USERS: LegacyUser[] = [
  {
    id: '1001',
    email: 'anna.novakova@instea.co',
    firstName: 'Anna',
    surname: 'Nováková',
    isAdmin: true,
  },
  {
    id: '1002',
    email: 'boris.biely@instea.co',
    firstName: 'Boris',
    surname: 'Biely',
  },
  {
    id: '1003',
    email: 'cyril.cierny@instea.co',
    firstName: 'Cyril',
    surname: 'Čierny',
  },
  {
    id: '1004',
    email: 'dana.dlha@instea.co',
    firstName: 'Dana',
    surname: 'Dlhá',
    approved: false,
  },
  {
    id: '1005',
    email: 'eva.prva@instea.co',
    firstName: 'Eva',
    surname: 'Prvá',
  },
  {
    id: '1006',
    email: 'eva.druha@instea.co',
    firstName: 'Eva',
    surname: 'Druhá',
  },
  {
    id: '1008',
    email: 'hana.mala@instea.co',
    firstName: 'Hana',
    surname: 'Malá',
  },
  {
    id: '1009',
    email: 'ivan.iny@instea.co',
    firstName: 'Ivan',
    surname: 'Iný',
  },
];

const A = '1001';
export const LEGACY_LEAVES: LegacyLeave[] = [
  // Anna: two codes on one day, in insertion order.
  {
    id: 'l-a-01',
    requesterId: A,
    approverId: A,
    start: '2024-03-05',
    end: '2024-03-05',
    type: 'ANNUAL',
    state: 'APPROVED',
    isHalfDay: true,
    numDays: 0.5,
  },
  {
    id: 'l-a-02',
    requesterId: A,
    approverId: A,
    start: '2024-03-05',
    end: '2024-03-05',
    type: 'DOCTOR',
    state: 'APPROVED',
    numDays: 1,
  },
  {
    id: 'l-a-03',
    requesterId: A,
    approverId: A,
    start: '2024-03-08',
    end: '2024-03-11',
    type: 'SICKNESS',
    state: 'APPROVED',
    numDays: 2,
  },
  {
    id: 'l-a-04',
    requesterId: A,
    start: '2024-03-12',
    end: '2024-03-12',
    type: 'ANNUAL',
    state: 'PENDING',
    numDays: 1,
  },
  {
    id: 'l-a-05',
    requesterId: A,
    approverId: A,
    start: '2024-03-13',
    end: '2024-03-13',
    type: 'ANNUAL',
    state: 'REJECTED',
    numDays: 1,
  },
  {
    id: 'l-a-06',
    requesterId: A,
    approverId: A,
    start: '2024-07-29',
    end: '2024-08-02',
    type: 'ANNUAL',
    state: 'APPROVED',
    numDays: 5,
  },
  {
    id: 'l-a-07',
    requesterId: A,
    start: '2024-10-07',
    end: '2024-10-07',
    type: 'ANNUAL',
    numDays: 1,
  },
  {
    id: 'l-a-08',
    requesterId: A,
    approverId: A,
    start: '2024-10-14',
    end: '2024-10-14',
    type: 'DOCTOR',
    state: 'APPROVED',
    numDays: 1,
    instant: '2024-10-14T08:00:00.000Z',
  },
  // Dates where old date-holidays 1.2.0 and WD-01 may disagree.
  {
    id: 'l-a-09',
    requesterId: A,
    approverId: A,
    start: '2025-09-01',
    end: '2025-09-01',
    type: 'ANNUAL',
    state: 'APPROVED',
    numDays: 1,
  },
  {
    id: 'l-a-10',
    requesterId: A,
    approverId: A,
    start: '2025-11-17',
    end: '2025-11-17',
    type: 'ANNUAL',
    state: 'APPROVED',
    numDays: 1,
  },
  {
    id: 'l-a-11',
    requesterId: A,
    approverId: A,
    start: '2025-12-22',
    end: '2026-01-02',
    type: 'ANNUAL',
    state: 'APPROVED',
    numDays: 6,
  },
  {
    id: 'l-a-12',
    requesterId: A,
    approverId: A,
    start: '2026-04-02',
    end: '2026-04-07',
    type: 'ANNUAL',
    state: 'APPROVED',
    numDays: 3,
  },
  {
    id: 'l-a-13',
    requesterId: A,
    approverId: A,
    start: '2026-02-02',
    end: '2026-02-06',
    type: 'PARENTAL',
    state: 'APPROVED',
    numDays: 5,
  },
  {
    id: 'l-a-14',
    requesterId: A,
    approverId: A,
    start: '2026-03-02',
    end: '2026-03-02',
    type: 'CARING',
    state: 'APPROVED',
    numDays: 1,
  },
  {
    id: 'l-a-15',
    requesterId: A,
    approverId: A,
    start: '2026-11-02',
    end: '2026-11-04',
    type: 'ANNUAL',
    state: 'APPROVED',
    numDays: 3,
  },
  // Cyril: no togglUserId → old hangs in June 2024.
  {
    id: 'l-c-01',
    requesterId: '1003',
    approverId: A,
    start: '2024-06-10',
    end: '2024-06-12',
    type: 'ANNUAL',
    state: 'APPROVED',
    numDays: 3,
  },
  // Dana: 13 months (January appears twice).
  {
    id: 'l-d-01',
    requesterId: '1004',
    approverId: A,
    start: '2024-01-15',
    end: '2025-01-20',
    type: 'MATERNITY',
    state: 'APPROVED',
    numDays: 263,
  },
  {
    id: 'l-d-02',
    requesterId: '1004',
    approverId: A,
    start: '2026-10-12',
    end: '2026-10-16',
    type: 'SICKNESS',
    state: 'APPROVED',
    numDays: 5,
  },
  // Duplicate names.
  {
    id: 'l-e-01',
    requesterId: '1005',
    approverId: A,
    start: '2025-02-10',
    end: '2025-02-10',
    type: 'DOCTOR',
    state: 'APPROVED',
    numDays: 1,
  },
  {
    id: 'l-e-02',
    requesterId: '1006',
    approverId: A,
    start: '2025-02-11',
    end: '2025-02-11',
    type: 'ANNUAL',
    state: 'APPROVED',
    numDays: 1,
  },
  // Hana: SSO email differs in case → no leaves in either app.
  {
    id: 'l-h-01',
    requesterId: '1008',
    approverId: A,
    start: '2025-05-05',
    end: '2025-05-05',
    type: 'ANNUAL',
    state: 'APPROVED',
    numDays: 1,
  },
  // Ivan: missing type, half-day over two days (MIG-01 skips it).
  {
    id: 'l-i-01',
    requesterId: '1009',
    approverId: A,
    start: '2024-04-08',
    end: '2024-04-08',
    state: 'APPROVED',
    numDays: 1,
  },
  {
    id: 'l-i-02',
    requesterId: '1009',
    approverId: A,
    start: '2024-04-15',
    end: '2024-04-16',
    type: 'ANNUAL',
    state: 'APPROVED',
    isHalfDay: true,
    numDays: 1.5,
  },
  // Removed user (MIG-01 placeholder), not in SSO.
  {
    id: 'l-x-01',
    requesterId: '9999',
    approverId: A,
    start: '2024-05-06',
    end: '2024-05-06',
    type: 'ANNUAL',
    state: 'APPROVED',
    numDays: 1,
  },
];

/** Earliest leave start (the month set starts there). */
export const EARLIEST_LEAVE = LEGACY_LEAVES.map((l) => l.start).sort()[0]!;

/** Instant of local midnight of `date` in `TIMEZONE` (old browser value). */
export function localMidnight(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(new TZDate(y, m - 1, d, TIMEZONE).getTime()).toISOString();
}

/** Deterministic ObjectId: 8 hex timestamp + 16 hex counter. */
const oid = (seconds: number, n: number) =>
  seconds.toString(16).padStart(8, '0') + n.toString(16).padStart(16, '0');

const BASE_SECONDS = Date.UTC(2017, 10, 1) / 1000;

/** MongoDB Extended JSON (relaxed, `mongoimport --jsonArray`) documents. */
export function legacyDocuments(): { users: unknown[]; leaves: unknown[] } {
  const users = LEGACY_USERS.map((u, i) => ({
    _id: { $oid: oid(BASE_SECONDS + i * 86400, i + 1) },
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    surname: u.surname,
    degrees: '',
    address: '',
    isAdmin: u.isAdmin ?? false,
    approved: u.approved ?? true,
    __v: 0,
  }));
  const leaves = LEGACY_LEAVES.map((l, i) => {
    const doc: Record<string, unknown> = {
      _id: { $oid: oid(BASE_SECONDS + 100 * 86400 + i * 3600, 1000 + i) },
      id: l.id,
      requesterId: l.requesterId,
      startDate: { $date: l.instant ?? localMidnight(l.start) },
      endDate: { $date: l.instant ?? localMidnight(l.end) },
      isHalfDay: l.isHalfDay ?? false,
      numDays: l.numDays ?? 1,
      __v: 0,
    };
    if (l.approverId) doc.approverId = l.approverId;
    if (l.type) doc.type = l.type;
    if (l.state) doc.state = l.state;
    return doc;
  });
  return { users, leaves };
}

/** The SSO meta API answer (`[{ name, email, keys: [{ key, value }] }]`). */
export function ssoBody(users: readonly SsoUser[] = SSO_USERS): unknown[] {
  return users.map((u) => ({
    name: u.name,
    email: u.email,
    keys: Object.entries(u.keys).map(([key, value]) => ({ key, value })),
  }));
}

interface Row {
  user_id: number;
  time_entries: { seconds: number; start: string }[];
}

/** Deterministic time entries of one user in one month. */
function monthRows(userId: number, year: number, month: number): Row[] {
  const days = daysOf(year, month);
  const pick = (n: number) => days[Math.min(n, days.length) - 1]!;
  const seconds = (d: number) => 3600 * (((userId + month + d) % 7) + 1);
  const rows: Row[] = [2, 10, 20].map((d) => ({
    user_id: userId,
    time_entries: [{ seconds: seconds(d), start: `${pick(d)}T08:00:00Z` }],
  }));
  // Fractional hours, summed in entry order (3 × 1000 s).
  rows.push({
    user_id: userId,
    time_entries: [1, 2, 3].map((k) => ({
      seconds: 1000,
      start: `${pick(3)}T0${k}:30:00Z`,
    })),
  });
  // UTC evening → next local day (midnight crossing in Europe/Bratislava).
  rows.push({
    user_id: userId,
    time_entries: [{ seconds: 5400, start: `${pick(9)}T23:30:00Z` }],
  });
  // Last UTC hour of the month: first local day of the next month (outside
  // the month locally, a known shared quirk, kept 1:1).
  rows.push({
    user_id: userId,
    time_entries: [
      { seconds: 1800, start: `${days[days.length - 1]}T23:15:00Z` },
    ],
  });
  return rows;
}

/** Splits rows into `pages` pages with `X-Next-Row-Number` chaining. */
function paged(
  key: Omit<TogglFixture['key'], 'firstRowNumber'>,
  rows: Row[],
  pages: number,
): TogglFixture[] {
  const size = Math.ceil(rows.length / pages);
  const out: TogglFixture[] = [];
  for (let p = 0; p < pages; p++) {
    const first = p * size + 1;
    const next = first + size;
    const last = p === pages - 1;
    out.push({
      key: { ...key, firstRowNumber: p === 0 ? null : first },
      response: {
        status: 200,
        headers: last ? {} : { 'X-Next-Row-Number': String(next) },
        body: rows.slice(p * size, p * size + size),
      },
    });
  }
  return out;
}

const PAGES: Record<string, number> = { '20': 3, '35': 2 };

/**
 * Toggl fixtures for every listed employee with a workspace, for each
 * month (`YYYY-MM-01`..last day), plus `extraRanges` (e.g. the old app's
 * requests for non-finite params, `OLD_NON_FINITE_DATE`) answered with `[]`.
 */
export function togglFixtures(
  months: readonly { year: number; month: number }[],
  extraRanges: readonly { startDate: string; endDate: string }[] = [],
  users: readonly SsoUser[] = SSO_USERS,
): TogglFixture[] {
  const out: TogglFixture[] = [];
  for (const u of users) {
    if (u.keys.employee !== '1' || !u.keys.togglWorkspaceId) continue;
    const id = u.keys.togglUserId;
    // Old `[parseInt(undefined)]` → `[null]` in JSON.
    const userIds = id ? [Number.parseInt(id, 10)] : [null];
    const base = {
      workspaceId: u.keys.togglWorkspaceId,
      userIds,
      token: u.keys.togglApiToken ?? '',
    };
    for (const { year, month } of months) {
      const days = daysOf(year, month);
      const key = {
        ...base,
        startDate: days[0]!,
        endDate: days[days.length - 1]!,
      };
      if (!id) {
        out.push({
          key: { ...key, firstRowNumber: null },
          response: { status: 200, body: [] },
        });
        continue;
      }
      out.push(
        ...paged(key, monthRows(Number(id), year, month), PAGES[id] ?? 1),
      );
    }
    for (const r of extraRanges)
      out.push({
        key: { ...base, ...r, firstRowNumber: null },
        response: { status: 200, body: [] },
      });
  }
  return out;
}

export function syntheticFixtureSet(
  months: readonly { year: number; month: number }[],
  extraRanges: readonly { startDate: string; endDate: string }[] = [],
): FixtureSet {
  return {
    sso: {
      username: PLACEHOLDER.ssoUsername,
      password: PLACEHOLDER.ssoPassword,
      response: { status: 200, body: ssoBody() },
    },
    toggl: togglFixtures(months, extraRanges),
  };
}
