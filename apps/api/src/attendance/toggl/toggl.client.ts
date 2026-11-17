import { TZDate } from '@date-fns/tz';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { APP_CONFIG } from '../../config/config.module';
import type { AppConfig } from '../../config/env.schema';
import { discard } from '../../common/discard-body';
import type { FetchFn } from '../sso/sso.client';

/** Any Toggl failure; ATT-01 maps it to the old 500 Toggl message. */
export class TogglUnavailableError extends Error {
  static readonly MESSAGE = 'Cannot get data from Toggl, try again later.';

  constructor(readonly reason: string) {
    super(TogglUnavailableError.MESSAGE);
    this.name = 'TogglUnavailableError';
  }
}

export const TOGGL_TIMEOUT_MS = 30_000;
/** Pause after every page, including the last one (old code). */
export const TOGGL_PAGE_DELAY_MS = 500;
const MAX_REDIRECTS = 5;

export const TOGGL_FETCH = Symbol('TOGGL_FETCH');
/** Test-only override of the 500 ms page pause; production uses `setTimeout`. */
export const TOGGL_SLEEP = Symbol('TOGGL_SLEEP');
export type SleepFn = (ms: number) => Promise<void>;

const defaultSleep: SleepFn = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** The SSO attributes one Toggl search needs (ATT-02 record, values as delivered). */
export interface TogglUser {
  togglWorkspaceId?: unknown;
  togglUserId?: unknown;
  togglApiToken?: unknown;
}

/** One detailed time entry, in response order. Values as Toggl sent them. */
export interface TogglEntry {
  /** `row.user_id`: Toggl's user, not necessarily the SSO user processed. */
  userId: unknown;
  seconds: unknown;
  start: unknown;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

/**
 * Old `parseInt(x)` (no radix) on a value as delivered; `NaN` serializes as
 * `null` in the JSON body, like old.
 */
const oldParseInt = (v: unknown): number => parseInt(String(v));

/** Search body, key order `start_date`, `end_date`, `user_ids`(, `first_row_number`). */
export function buildSearchBody(
  user: TogglUser,
  startString: string,
  endString: string,
  nextRowNumber: string | null,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    start_date: startString,
    end_date: endString,
    user_ids: [oldParseInt(user.togglUserId)],
  };
  if (nextRowNumber) body.first_row_number = oldParseInt(nextRowNumber);
  return body;
}

/** `Basic base64(<togglApiToken>:api_token)` (superagent `.auth(token, 'api_token')`). */
export function togglAuthorization(token: unknown): string {
  return `Basic ${Buffer.from(`${String(token)}:api_token`).toString('base64')}`;
}

/**
 * Old paging rule: a header equal to the one just sent, or absent/empty,
 * stops; any other value (including `"0"`) is the next `first_row_number`.
 */
export function nextRowNumber(
  header: string | null,
  previous: string | null,
): string | null {
  return header === previous || !header ? null : header;
}

/** Validate one response page and flatten it into entries in response order. */
export function parsePage(body: unknown): TogglEntry[] {
  if (!Array.isArray(body))
    throw new TogglUnavailableError('body is not an array');
  const entries: TogglEntry[] = [];
  for (const row of body as unknown[]) {
    if (!isObject(row)) throw new TogglUnavailableError('row is not an object');
    if (!Array.isArray(row.time_entries))
      throw new TogglUnavailableError('row time_entries is not an array');
    for (const entry of row.time_entries as unknown[]) {
      // Old `timeEntry.seconds` throws only for null/undefined; a primitive
      // entry (e.g. `5`) gives undefined seconds and start, like old.
      if (entry === null || entry === undefined)
        throw new TogglUnavailableError('time entry is null');
      const fields = Object(entry) as Record<string, unknown>;
      entries.push({
        userId: row.user_id,
        seconds: fields.seconds,
        start: fields.start,
      });
    }
  }
  return entries;
}

/**
 * Per-entry hours, `seconds / 60 / 60` in that order (bit-identical to old):
 * `null` gives 0, missing or non-numeric gives `NaN` (preserved).
 */
export function entryHours(seconds: unknown): number {
  return (seconds as number) / 60 / 60;
}

/** ISO date(-time) without a UTC offset: moment read it as wall time in the default zone. */
const LOCAL_ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ][\d:.,]*)?$/;

const isEmpty = (v: object): boolean =>
  Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0;

/**
 * 0-based day-of-month of `start` in `timeZone` (month/year ignored, like
 * old). Entries crossing midnight stay on their start day. Like old
 * `moment(start)`: missing `start` (and an empty object/array) is "now"
 * from `now()`, a number is epoch milliseconds. `NaN` (old invalid moment)
 * when `start` cannot be parsed, is `null` or a boolean. moment's non-empty
 * unit-object/array forms are not reproduced (Toggl never sends them): `NaN`.
 */
export function entryDayIndex(
  start: unknown,
  timeZone: string,
  now: () => Date,
): number {
  if (typeof start === 'string') {
    const local = LOCAL_ISO.exec(start);
    if (local) return Number(local[3]) - 1;
    return new TZDate(start, timeZone).getDate() - 1;
  }
  if (typeof start === 'number')
    return new TZDate(start, timeZone).getDate() - 1;
  if (start === undefined || (isObject(start) && isEmpty(start)))
    return new TZDate(now().getTime(), timeZone).getDate() - 1;
  return NaN;
}

/** The per-user slice of the attendance record ATT-04 builds. */
export interface TogglTotals {
  days: { logged_time: number }[];
  total: number;
}

/**
 * Old accumulation: `days[day - 1].logged_time += h`, then `total += h`,
 * addressed by Toggl's `user_id`. A `user_id` that is not a listed
 * `togglUserId`, or a day outside the days array, is the old TypeError and
 * becomes `TogglUnavailableError`. `now` is the injected `CLOCK` (for an
 * entry without `start`, see `entryDayIndex`).
 */
export function addEntry(
  attendance: Readonly<Record<string, TogglTotals>>,
  entry: TogglEntry,
  timeZone: string,
  now: () => Date,
): void {
  const key = String(entry.userId);
  const target = Object.hasOwn(attendance, key) ? attendance[key] : undefined;
  if (!target) throw new TogglUnavailableError('user_id is not listed');
  const day = target.days[entryDayIndex(entry.start, timeZone, now)];
  if (!day) throw new TogglUnavailableError('entry day is out of range');
  const hours = entryHours(entry.seconds);
  day.logged_time += hours;
  target.total += hours;
}

type TogglConfig = Pick<AppConfig, 'TOGGL_REPORTS_BASE_URL'>;

/** Toggl Reports API v3 `search/time_entries` client (ATT-03). */
@Injectable()
export class TogglClient {
  private readonly logger = new Logger(TogglClient.name);
  private readonly fetchFn: FetchFn;
  private readonly sleep: SleepFn;

  constructor(
    @Inject(APP_CONFIG) private readonly config: TogglConfig,
    @Optional() @Inject(TOGGL_FETCH) fetchFn?: FetchFn,
    @Optional() @Inject(TOGGL_SLEEP) sleep?: SleepFn,
  ) {
    this.fetchFn = fetchFn ?? ((url, init) => fetch(url, init));
    this.sleep = sleep ?? defaultSleep;
  }

  /**
   * All detailed entries of `user` between `startString` and `endString`
   * (`YYYY-MM-DD`, both inclusive), page by page in response order, with a
   * 500 ms pause after every page. Nothing (no call, no pause) when
   * `togglWorkspaceId` is falsy. Throws `TogglUnavailableError` on any failure.
   * The month range comes from ATT-04 `monthRange` (covered end to end by
   * `test/attendance/attendance.int-spec.ts`).
   */
  async *timeEntries(
    user: TogglUser,
    startString: string,
    endString: string,
  ): AsyncGenerator<TogglEntry, void, undefined> {
    if (!user.togglWorkspaceId) return;
    let next: string | null = null;
    do {
      const body = buildSearchBody(user, startString, endString, next);
      const { page, header } = await this.fetchPage(user, body);
      yield* page;
      next = nextRowNumber(header, next);
      await this.sleep(TOGGL_PAGE_DELAY_MS);
    } while (next);
  }

  private async fetchPage(
    user: TogglUser,
    body: Record<string, unknown>,
  ): Promise<{ page: TogglEntry[]; header: string | null }> {
    try {
      const { json, header } = await this.request(user, body);
      return { page: parsePage(json), header };
    } catch (e) {
      const error =
        e instanceof TogglUnavailableError
          ? e
          : new TogglUnavailableError(errorClass(e));
      // Never log the token, the Authorization header or the body.
      this.logger.warn(`Toggl unavailable: ${error.reason}`);
      throw error;
    }
  }

  private async request(
    user: TogglUser,
    payload: Record<string, unknown>,
  ): Promise<{ json: unknown; header: string | null }> {
    const base = this.config.TOGGL_REPORTS_BASE_URL.replace(/\/+$/, '');
    // Encoded so an odd SSO value cannot change the path; numeric ids are unchanged.
    const workspace = encodeURIComponent(String(user.togglWorkspaceId));
    let url = new URL(`${base}/workspace/${workspace}/search/time_entries`);
    const origin = url.origin;
    const authorization = togglAuthorization(user.togglApiToken);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TOGGL_TIMEOUT_MS);
    try {
      let method = 'POST';
      let body: string | undefined = JSON.stringify(payload);
      for (let redirects = 0; ; redirects++) {
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        if (url.origin === origin) headers.Authorization = authorization;
        const res = await this.fetchFn(url, {
          method,
          headers,
          body,
          redirect: 'manual',
          signal: controller.signal,
        });
        const location = res.headers.get('location');
        if (res.status >= 300 && res.status < 400 && location) {
          await discard(res);
          if (redirects === MAX_REDIRECTS)
            throw new TogglUnavailableError('too many redirects');
          // superagent: 301/302/303 continue as GET without a body.
          if ([301, 302, 303].includes(res.status)) {
            method = 'GET';
            body = undefined;
          }
          url = new URL(location, url);
          continue;
        }
        if (!res.ok) {
          await discard(res);
          throw new TogglUnavailableError(`HTTP ${res.status}`);
        }
        if (!/[/+]json\b/i.test(res.headers.get('content-type') ?? '')) {
          await discard(res);
          throw new TogglUnavailableError('response is not JSON');
        }
        let json: unknown;
        try {
          json = JSON.parse(await res.text()) as unknown;
        } catch {
          throw new TogglUnavailableError('invalid JSON');
        }
        return { json, header: res.headers.get('x-next-row-number') };
      }
    } finally {
      clearTimeout(timer);
    }
  }
}

function errorClass(e: unknown): string {
  return e instanceof Error ? e.name : typeof e;
}
