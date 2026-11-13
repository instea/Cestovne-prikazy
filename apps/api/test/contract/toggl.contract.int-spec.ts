import { describe, expect, it } from 'vitest';
import {
  addEntry,
  entryDayIndex,
  entryHours,
  type TogglEntry,
  type TogglTotals,
  TogglClient,
  TogglUnavailableError,
  TOGGL_PAGE_DELAY_MS,
} from '../../src/attendance/toggl/toggl.client';
import { useHttpFakes } from '../mocks/http-fakes';
import { TEST_TOGGL } from '../support/env';

/**
 * TST-04 Toggl Reports v3 contract: each versioned fixture
 * (`packages/shared/test-fixtures/contracts/toggl.*.json`) is served by the
 * HTTP fake and read by the real `TogglClient`. Pinned per fixture: the
 * entry sequence, the number of calls, the `first_row_number` sequence and
 * the number of 500 ms pauses, or `TogglUnavailableError`. The fake
 * rejects any request that leaves the documented request contract.
 * Response schema: array of
 * `{ user_id: number, time_entries: Array<{ seconds: number, start: string }> }`.
 */
const fakes = useHttpFakes();

const TZ = 'Europe/Bratislava';
const USER = {
  togglUserId: '1001',
  togglWorkspaceId: '42',
  togglApiToken: TEST_TOGGL.apiToken,
};
const SEARCH_URL = `${TEST_TOGGL.baseUrl}/workspace/42/search/time_entries`;
const basic = (user: string, pass: string) =>
  `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

/** Reads every entry with a counting sleep instead of the 500 ms pause. */
async function read(
  user: Record<string, unknown> = USER,
  start = '2026-12-01',
  end = '2026-12-31',
): Promise<{ entries: TogglEntry[]; sleeps: number[] }> {
  const sleeps: number[] = [];
  const client = new TogglClient(
    { TOGGL_REPORTS_BASE_URL: TEST_TOGGL.baseUrl },
    undefined,
    (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
  );
  const entries: TogglEntry[] = [];
  for await (const entry of client.timeEntries(user, start, end))
    entries.push(entry);
  return { entries, sleeps };
}

const searches = () =>
  fakes.requests.filter((r) => r.url.includes('/search/time_entries'));
const firstRows = () =>
  searches().map(
    (r) => (r.body as Record<string, unknown>).first_row_number ?? null,
  );

const entry = (seconds: unknown, start: string, userId = 1001): TogglEntry => ({
  userId,
  seconds,
  start,
});

describe('Toggl contract: request', () => {
  it('POST search/time_entries with Basic base64(token:api_token) and the exact JSON body', async () => {
    await read();
    const [req] = searches();
    expect(req!.method).toBe('POST');
    expect(req!.url).toBe(SEARCH_URL);
    expect(req!.headers.authorization).toBe(
      basic(TEST_TOGGL.apiToken, 'api_token'),
    );
    expect(req!.headers['content-type']).toBe('application/json');
    // Key order is part of the contract (old superagent body).
    expect(Object.keys(req!.body as object)).toEqual([
      'start_date',
      'end_date',
      'user_ids',
    ]);
    expect(req!.body).toEqual({
      start_date: '2026-12-01',
      end_date: '2026-12-31',
      user_ids: [1001],
    });
  });

  it('a wrong token → the fake answers 401 → TogglUnavailableError', async () => {
    await expect(read({ ...USER, togglApiToken: 'wrong' })).rejects.toThrow(
      TogglUnavailableError,
    );
    expect(searches().map((r) => r.status)).toEqual([401]);
  });

  it('no togglWorkspaceId → no request, no pause', async () => {
    const { entries, sleeps } = await read({ ...USER, togglWorkspaceId: '' });
    expect(entries).toEqual([]);
    expect(sleeps).toEqual([]);
    expect(searches()).toHaveLength(0);
  });

  const valid = {
    start_date: '2026-12-01',
    end_date: '2026-12-31',
    user_ids: [1001],
  };
  it.each([
    ['an extra key', { ...valid, extra: 1 }, 'unknown key extra'],
    ['page_size', { ...valid, page_size: 50 }, 'unknown key page_size'],
    [
      'string user_ids',
      { ...valid, user_ids: ['1001'] },
      'user_ids is not an array of integers',
    ],
    [
      'a non-integer first_row_number',
      { ...valid, first_row_number: '2' },
      'first_row_number is not an integer',
    ],
    [
      'a date that is not YYYY-MM-DD',
      { ...valid, start_date: '2026-12-01T00:00:00Z' },
      'start_date is not YYYY-MM-DD',
    ],
  ])('the fake rejects a body with %s (400)', async (_label, body, why) => {
    const res = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: {
        Authorization: basic(TEST_TOGGL.apiToken, 'api_token'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(why);
  });

  it('the fake rejects a body that is not sent as application/json (400)', async () => {
    const res = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: {
        Authorization: basic(TEST_TOGGL.apiToken, 'api_token'),
        'Content-Type': 'text/plain',
      },
      body: JSON.stringify(valid),
    });
    expect(res.status).toBe(400);
  });
});

describe('Toggl contract: paging per fixture', () => {
  it.each([
    // [fixture, calls' first_row_number, pauses, entry seconds in order]
    ['toggl.single-page.json', [null], 1, [28800, 14400]],
    ['toggl.three-pages.json', [null, 2, 3], 3, [3600, 7200, 1800]],
    // The second page repeats the header just sent: paging stops.
    ['toggl.repeated-header.json', [null, 2], 2, [3600, 3600]],
  ])('%s', async (fixture, rows, pauses, seconds) => {
    fakes.toggl.serve(fixture);
    const { entries, sleeps } = await read();
    expect(firstRows()).toEqual(rows);
    expect(sleeps).toEqual(Array(pauses).fill(TOGGL_PAGE_DELAY_MS));
    expect(entries.map((e) => e.seconds)).toEqual(seconds);
    expect(entries.every((e) => e.userId === 1001)).toBe(true);
  });
});

describe('Toggl contract: entries per fixture (Europe/Bratislava days)', () => {
  const now = () => new Date('2026-12-15T12:00:00Z');
  const days = (entries: TogglEntry[]) =>
    entries.map((e) => entryDayIndex(e.start, TZ, now) + 1);

  it('toggl.dst-boundary.json: local day across both DST switches', async () => {
    fakes.toggl.serve('toggl.dst-boundary.json');
    const { entries } = await read({ ...USER }, '2024-03-01', '2024-03-31');
    // 23:30Z on the 30th is 00:30 on the 31st (CET); 22:30Z on the 31st is
    // 00:30 on April 1st (CEST) → day 1 (month ignored, old quirk).
    expect(days(entries)).toEqual([31, 31, 31, 1, 27, 27]);
  });

  it('toggl.midnight-crossing.json: an entry stays on its start day', async () => {
    fakes.toggl.serve('toggl.midnight-crossing.json');
    const { entries } = await read();
    expect(entries).toEqual([entry(7200, '2026-12-04T23:00:00+01:00')]);
    expect(days(entries)).toEqual([4]);
  });

  it('toggl.outside-month-local.json: UTC outside, local inside / next month', async () => {
    fakes.toggl.serve('toggl.outside-month-local.json');
    const { entries } = await read();
    // 2026-11-30T23:30Z is Dec 1st locally; 2026-12-31T23:30Z is Jan 1st
    // locally and lands on day 1 (month ignored, old quirk).
    expect(days(entries)).toEqual([1, 1]);
  });

  it('toggl.nan-seconds.json: a missing seconds value is NaN hours (JSON null)', async () => {
    fakes.toggl.serve('toggl.nan-seconds.json');
    const { entries } = await read();
    expect(entries.map((e) => entryHours(e.seconds))).toEqual([NaN, 1]);
  });

  it('toggl.unknown-user.json: a user_id that is not listed → TogglUnavailableError', async () => {
    fakes.toggl.serve('toggl.unknown-user.json');
    const { entries } = await read();
    const attendance: Record<string, TogglTotals> = {
      '1001': {
        days: Array.from({ length: 31 }, () => ({ logged_time: 0 })),
        total: 0,
      },
    };
    expect(() => addEntry(attendance, entries[0]!, TZ, now)).toThrow(
      expect.objectContaining({
        name: 'TogglUnavailableError',
        reason: 'user_id is not listed',
      }) as Error,
    );
  });
});

describe('Toggl contract: error injection', () => {
  it.each([
    ['401', { status: 401 }, 'HTTP 401'],
    ['402', { status: 402 }, 'HTTP 402'],
    ['429', { status: 429 }, 'HTTP 429'],
    ['500', { status: 500 }, 'HTTP 500'],
    [
      'a non-JSON body',
      { status: 200, contentType: 'text/html', body: '<html></html>' },
      'response is not JSON',
    ],
    [
      'invalid JSON',
      { status: 200, contentType: 'application/json', body: '[{' },
      'invalid JSON',
    ],
    [
      'a non-array body',
      { status: 200, contentType: 'application/json', body: '{"data":[]}' },
      'body is not an array',
    ],
  ])(
    '%s → TogglUnavailableError, one call, no pause',
    async (_l, res, reason) => {
      fakes.toggl.fail(res);
      const sleeps: number[] = [];
      const client = new TogglClient(
        { TOGGL_REPORTS_BASE_URL: TEST_TOGGL.baseUrl },
        undefined,
        (ms) => {
          sleeps.push(ms);
          return Promise.resolve();
        },
      );
      const run = async () => {
        const entries = client.timeEntries(USER, '2026-12-01', '2026-12-31');
        while (!(await entries.next()).done);
      };
      await expect(run()).rejects.toMatchObject({
        name: 'TogglUnavailableError',
        message: TogglUnavailableError.MESSAGE,
        reason,
      });
      expect(searches()).toHaveLength(1);
      expect(sleeps).toEqual([]);
    },
  );
});
