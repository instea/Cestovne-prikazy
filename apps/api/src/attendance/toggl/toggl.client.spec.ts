import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FetchFn } from '../sso/sso.client';
import {
  addEntry,
  buildSearchBody,
  entryDayIndex,
  entryHours,
  nextRowNumber,
  parsePage,
  TOGGL_PAGE_DELAY_MS,
  TOGGL_TIMEOUT_MS,
  togglAuthorization,
  TogglClient,
  type TogglEntry,
  type TogglTotals,
  TogglUnavailableError,
  type TogglUser,
} from './toggl.client';

const BASE = 'https://toggl.example/reports/api/v3';
const TZ = 'Europe/Bratislava';
/** Injected clock: 2024-03-15 10:00 CET. */
const NOW = () => new Date('2024-03-15T09:00:00Z');
const user: TogglUser = {
  togglWorkspaceId: '42',
  togglUserId: '1001',
  togglApiToken: 'secret-token',
};

const json = (
  body: unknown,
  headers: Record<string, string> = {},
  status = 200,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

const page = (userId: number, ...seconds: number[]) => [
  {
    user_id: userId,
    time_entries: seconds.map((s) => ({
      seconds: s,
      start: '2024-03-04T08:00:00+01:00',
    })),
  },
];

/** Sleeper that records each pause and the number of calls made before it. */
function recorder() {
  const log: string[] = [];
  const sleep = vi.fn((ms: number) => {
    log.push(`sleep ${ms}`);
    return Promise.resolve();
  });
  return { log, sleep };
}

function client(fetchFn: FetchFn, sleep = recorder().sleep) {
  return new TogglClient({ TOGGL_REPORTS_BASE_URL: BASE }, fetchFn, sleep);
}

async function collect(it: AsyncIterable<TogglEntry>): Promise<TogglEntry[]> {
  const out: TogglEntry[] = [];
  for await (const e of it) out.push(e);
  return out;
}

const bodies = (fetchFn: ReturnType<typeof vi.fn<FetchFn>>) =>
  fetchFn.mock.calls.map(
    ([, init]) => JSON.parse(init?.body as string) as unknown,
  );

// TODO(ATT-04): month-range criterion end to end: a March request must send
// `start_date` '2024-03-01' and `end_date` '2024-03-31' (these tests pass
// the strings in already computed).
describe('buildSearchBody', () => {
  it('keeps key order start_date, end_date, user_ids', () => {
    const body = buildSearchBody(user, '2024-03-01', '2024-03-31', null);
    expect(JSON.stringify(body)).toBe(
      '{"start_date":"2024-03-01","end_date":"2024-03-31","user_ids":[1001]}',
    );
  });

  it('appends first_row_number as a number on later pages', () => {
    const body = buildSearchBody(user, '2024-03-01', '2024-03-31', '51');
    expect(Object.keys(body)).toEqual([
      'start_date',
      'end_date',
      'user_ids',
      'first_row_number',
    ]);
    expect(body.first_row_number).toBe(51);
  });

  it('sends first_row_number 0 for header "0"', () => {
    expect(buildSearchBody(user, 'a', 'b', '0').first_row_number).toBe(0);
  });

  it('serializes a missing togglUserId as null (parseInt NaN)', () => {
    const body = buildSearchBody({}, 'a', 'b', null);
    expect(JSON.stringify(body.user_ids)).toBe('[null]');
  });

  it('uses old parseInt semantics', () => {
    expect(
      buildSearchBody({ togglUserId: '12abc' }, 'a', 'b', null).user_ids,
    ).toEqual([12]);
    expect(
      buildSearchBody({ togglUserId: 7 }, 'a', 'b', null).user_ids,
    ).toEqual([7]);
  });
});

describe('togglAuthorization', () => {
  it('is Basic base64(<token>:api_token)', () => {
    expect(togglAuthorization('secret-token')).toBe(
      `Basic ${Buffer.from('secret-token:api_token').toString('base64')}`,
    );
  });
});

describe('nextRowNumber', () => {
  it.each([
    [null, null, null],
    [null, '51', null],
    ['', null, null],
    ['51', null, '51'],
    ['51', '51', null],
    ['101', '51', '101'],
    ['0', null, '0'],
    ['0', '0', null],
  ])('header %j after %j gives %j', (header, previous, expected) => {
    expect(nextRowNumber(header, previous)).toBe(expected);
  });
});

describe('parsePage', () => {
  it('flattens rows into entries in response order', () => {
    expect(
      parsePage([
        {
          user_id: 1,
          time_entries: [
            { seconds: 1, start: 'a' },
            { seconds: 2, start: 'b' },
          ],
        },
        { user_id: 2, time_entries: [{ seconds: 3, start: 'c', extra: true }] },
      ]),
    ).toEqual([
      { userId: 1, seconds: 1, start: 'a' },
      { userId: 1, seconds: 2, start: 'b' },
      { userId: 2, seconds: 3, start: 'c' },
    ]);
  });

  it.each([
    ['an object', {}],
    ['null', null],
    ['a null row', [null]],
    ['a row without time_entries', [{ user_id: 1 }]],
    ['time_entries not an array', [{ user_id: 1, time_entries: {} }]],
    ['a null entry', [{ user_id: 1, time_entries: [null] }]],
  ])('rejects %s', (_, body) => {
    expect(() => parsePage(body)).toThrow(TogglUnavailableError);
  });

  it('accepts a primitive entry with undefined seconds and start (old)', () => {
    expect(parsePage([{ user_id: 1, time_entries: [5, 'x'] }])).toEqual([
      { userId: 1, seconds: undefined, start: undefined },
      { userId: 1, seconds: undefined, start: undefined },
    ]);
  });
});

describe('entryHours', () => {
  it('computes seconds / 60 / 60 (two divisions, in that order)', () => {
    expect(entryHours(5400)).toBe(1.5);
    // Bit-identical to the old expression, not seconds / 3600.
    for (const s of [1, 7, 61, 3599, 12345, 99999])
      expect(Object.is(entryHours(s), s / 60 / 60)).toBe(true);
  });

  it('gives 0 for null and NaN for missing or non-numeric seconds', () => {
    expect(entryHours(null)).toBe(0);
    expect(entryHours(undefined)).toBeNaN();
    expect(entryHours('abc')).toBeNaN();
    expect(JSON.stringify({ h: entryHours(undefined) })).toBe('{"h":null}');
  });
});

describe('entryDayIndex', () => {
  it.each([
    ['2024-03-04T08:00:00+01:00', TZ, 3],
    // Timezone quirk: CEST 2024-04-01 00:30 is day index 0.
    ['2024-03-31T22:30:00Z', TZ, 0],
    ['2024-03-31T21:59:59Z', TZ, 30],
    // DST start (last Sunday of March): 01:00Z is 03:00 CEST.
    ['2024-03-31T00:59:00Z', TZ, 30],
    ['2024-03-31T01:00:00Z', TZ, 30],
    // DST end (last Sunday of October): 01:00Z is 02:00 CET.
    ['2024-10-27T00:30:00Z', TZ, 26],
    ['2024-10-27T22:59:00Z', TZ, 26],
    ['2024-10-27T23:00:00Z', TZ, 27],
    // Other offsets in the entry string.
    ['2024-03-04T23:30:00-05:00', TZ, 4],
    ['2024-03-05T06:00:00+09:00', TZ, 3],
    ['2024-03-04T23:30:00Z', 'UTC', 3],
    ['2024-03-04T23:30:00Z', 'America/New_York', 3],
    // No offset: wall time in the default zone (moment default tz).
    ['2024-03-04T23:30:00', TZ, 3],
    ['2024-03-04', TZ, 3],
  ])('%s in %s is day index %d', (start, tz, expected) => {
    expect(entryDayIndex(start, tz, NOW)).toBe(expected);
  });

  it('gives NaN for an unparseable start (old invalid moment)', () => {
    for (const start of ['not a date', '', null, true, false, [2024, 2, 4]])
      expect(entryDayIndex(start, TZ, NOW)).toBeNaN();
  });

  it('reads a missing start, {} or [] as now in the zone (old moment())', () => {
    for (const start of [undefined, {}, []])
      expect(entryDayIndex(start, TZ, NOW)).toBe(14);
    // 2024-03-15 23:30Z is already 2024-03-16 in Bratislava.
    const late = () => new Date('2024-03-15T23:30:00Z');
    expect(entryDayIndex(undefined, TZ, late)).toBe(15);
    expect(entryDayIndex(undefined, 'UTC', late)).toBe(14);
  });

  it('reads a numeric start as epoch milliseconds (old moment(number))', () => {
    expect(entryDayIndex(0, TZ, NOW)).toBe(0);
    expect(entryDayIndex(Date.parse('2024-03-03T23:30:00Z'), TZ, NOW)).toBe(3);
  });
});

describe('addEntry', () => {
  const attendance = (days = 31): Record<string, TogglTotals> => ({
    '1001': {
      days: Array.from({ length: days }, () => ({ logged_time: 0 })),
      total: 0,
    },
  });

  it('sums entries by start day (spec example)', () => {
    const a = attendance();
    addEntry(
      a,
      { userId: 1001, seconds: 3600, start: '2024-03-04T08:00:00+01:00' },
      TZ,
      NOW,
    );
    addEntry(
      a,
      { userId: 1001, seconds: 5400, start: '2024-03-04T13:00:00+01:00' },
      TZ,
      NOW,
    );
    expect(a['1001']!.days[3]!.logged_time).toBe(2.5);
    expect(a['1001']!.total).toBe(2.5);
  });

  it('keeps a midnight-crossing entry on its start day', () => {
    const a = attendance();
    addEntry(
      a,
      { userId: 1001, seconds: 7200, start: '2024-03-04T23:30:00+01:00' },
      TZ,
      NOW,
    );
    expect(a['1001']!.days[3]!.logged_time).toBe(2);
    expect(a['1001']!.days[4]!.logged_time).toBe(0);
  });

  it('propagates NaN for missing seconds (preserved)', () => {
    const a = attendance();
    addEntry(
      a,
      { userId: 1001, seconds: undefined, start: '2024-03-04T08:00:00Z' },
      TZ,
      NOW,
    );
    expect(a['1001']!.total).toBeNaN();
  });

  it('puts an entry without start on today with NaN hours (old)', () => {
    const a = attendance();
    for (const e of parsePage([{ user_id: 1001, time_entries: [5] }]))
      addEntry(a, e, TZ, NOW);
    expect(a['1001']!.days[14]!.logged_time).toBeNaN();
    expect(a['1001']!.total).toBeNaN();
  });

  it.each([
    [
      'a user_id that is not listed',
      { userId: 999, seconds: 1, start: '2024-03-04T08:00:00Z' },
    ],
    [
      'a prototype key as user_id',
      { userId: 'constructor', seconds: 1, start: '2024-03-04T08:00:00Z' },
    ],
    ['an unparseable start', { userId: 1001, seconds: 1, start: 'x' }],
  ])('throws TogglUnavailableError for %s', (_, entry) => {
    expect(() => addEntry(attendance(), entry, TZ, NOW)).toThrow(
      TogglUnavailableError,
    );
  });

  it('throws when the day index is beyond the days array', () => {
    expect(() =>
      addEntry(
        attendance(28),
        { userId: 1001, seconds: 1, start: '2024-03-30T08:00:00Z' },
        TZ,
        NOW,
      ),
    ).toThrow(TogglUnavailableError);
  });
});

describe('TogglClient.timeEntries', () => {
  afterEach(() => vi.useRealTimers());

  it('makes no call and no pause without togglWorkspaceId', async () => {
    const fetchFn = vi.fn<FetchFn>();
    const { sleep } = recorder();
    for (const ws of [undefined, '', null]) {
      await expect(
        collect(
          client(fetchFn, sleep).timeEntries(
            { ...user, togglWorkspaceId: ws },
            'a',
            'b',
          ),
        ),
      ).resolves.toEqual([]);
    }
    expect(fetchFn).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
  });

  it('sends POST with JSON body, Basic auth and Accept to the workspace URL', async () => {
    const fetchFn = vi.fn<FetchFn>(() =>
      Promise.resolve(json(page(1001, 3600))),
    );
    await collect(
      client(fetchFn).timeEntries(user, '2024-03-01', '2024-03-31'),
    );
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(String(url)).toBe(`${BASE}/workspace/42/search/time_entries`);
    expect(init?.method).toBe('POST');
    expect(init?.redirect).toBe('manual');
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe(
      `Basic ${Buffer.from('secret-token:api_token').toString('base64')}`,
    );
    expect(headers.get('accept')).toBe('application/json');
    expect(headers.get('content-type')).toBe('application/json');
    expect(init?.body).toBe(
      '{"start_date":"2024-03-01","end_date":"2024-03-31","user_ids":[1001]}',
    );
  });

  it('accepts a base URL with a trailing slash', async () => {
    const fetchFn = vi.fn<FetchFn>(() => Promise.resolve(json([])));
    const c = new TogglClient(
      { TOGGL_REPORTS_BASE_URL: `${BASE}/` },
      fetchFn,
      recorder().sleep,
    );
    await collect(c.timeEntries(user, 'a', 'b'));
    expect(String(fetchFn.mock.calls[0]![0])).toBe(
      `${BASE}/workspace/42/search/time_entries`,
    );
  });

  it('one page without X-Next-Row-Number: one call, then one 500 ms pause', async () => {
    const { log, sleep } = recorder();
    const fetchFn = vi.fn<FetchFn>(() => {
      log.push('fetch');
      return Promise.resolve(json(page(1001, 3600, 5400)));
    });
    const entries = await collect(
      client(fetchFn, sleep).timeEntries(user, 'a', 'b'),
    );
    expect(entries).toEqual([
      { userId: 1001, seconds: 3600, start: '2024-03-04T08:00:00+01:00' },
      { userId: 1001, seconds: 5400, start: '2024-03-04T08:00:00+01:00' },
    ]);
    expect(log).toEqual(['fetch', `sleep ${TOGGL_PAGE_DELAY_MS}`]);
  });

  it('stops when the header repeats (51, 51: two calls)', async () => {
    const fetchFn = vi
      .fn<FetchFn>()
      .mockResolvedValueOnce(json(page(1001, 1), { 'X-Next-Row-Number': '51' }))
      .mockResolvedValueOnce(
        json(page(1001, 2), { 'X-Next-Row-Number': '51' }),
      );
    const { sleep } = recorder();
    await collect(client(fetchFn, sleep).timeEntries(user, 'a', 'b'));
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('51 then absent: two calls, the second with first_row_number 51', async () => {
    const fetchFn = vi
      .fn<FetchFn>()
      .mockResolvedValueOnce(json(page(1001, 1), { 'X-Next-Row-Number': '51' }))
      .mockResolvedValueOnce(json(page(1001, 2)));
    await collect(client(fetchFn).timeEntries(user, 'a', 'b'));
    expect(bodies(fetchFn)).toEqual([
      { start_date: 'a', end_date: 'b', user_ids: [1001] },
      {
        start_date: 'a',
        end_date: 'b',
        user_ids: [1001],
        first_row_number: 51,
      },
    ]);
  });

  it('paging example 51, 101, absent: three calls, three pauses, entries in order', async () => {
    const { log, sleep } = recorder();
    const responses = [
      json(page(1001, 1), { 'X-Next-Row-Number': '51' }),
      json(page(1001, 2), { 'X-Next-Row-Number': '101' }),
      json(page(1001, 3)),
    ];
    const fetchFn = vi.fn<FetchFn>(() => {
      log.push('fetch');
      return Promise.resolve(responses.shift()!);
    });
    const entries = await collect(
      client(fetchFn, sleep).timeEntries(user, 'a', 'b'),
    );
    expect(entries.map((e) => e.seconds)).toEqual([1, 2, 3]);
    expect(
      bodies(fetchFn).map(
        (b) => (b as { first_row_number?: number }).first_row_number,
      ),
    ).toEqual([undefined, 51, 101]);
    expect(log).toEqual([
      'fetch',
      'sleep 500',
      'fetch',
      'sleep 500',
      'fetch',
      'sleep 500',
    ]);
  });

  it('continues on header "0" with first_row_number 0', async () => {
    const fetchFn = vi
      .fn<FetchFn>()
      .mockResolvedValueOnce(json([], { 'X-Next-Row-Number': '0' }))
      .mockResolvedValueOnce(json([]));
    await collect(client(fetchFn).timeEntries(user, 'a', 'b'));
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(bodies(fetchFn)[1]).toMatchObject({ first_row_number: 0 });
  });

  it('pauses 500 ms with real setTimeout by default (fake timers)', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn<FetchFn>(() => Promise.resolve(json([])));
    const c = new TogglClient({ TOGGL_REPORTS_BASE_URL: BASE }, fetchFn);
    let done = false;
    const pending = collect(c.timeEntries(user, 'a', 'b')).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(TOGGL_PAGE_DELAY_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(done).toBe(true);
  });

  it.each([401, 402, 429, 500])(
    'throws on HTTP %d without pausing',
    async (status) => {
      const { sleep } = recorder();
      const fetchFn = () => Promise.resolve(json({}, {}, status));
      await expect(
        collect(client(fetchFn, sleep).timeEntries(user, 'a', 'b')),
      ).rejects.toThrow(TogglUnavailableError);
      expect(sleep).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['a non-array body', () => json({})],
    [
      'a text/html body',
      () => new Response('[]', { headers: { 'Content-Type': 'text/html' } }),
    ],
    [
      'invalid JSON',
      () =>
        new Response('[', { headers: { 'Content-Type': 'application/json' } }),
    ],
    ['a row without time_entries', () => json([{ user_id: 1 }])],
  ])('throws on %s', async (_, response) => {
    await expect(
      collect(
        client(() => Promise.resolve(response())).timeEntries(user, 'a', 'b'),
      ),
    ).rejects.toThrow(TogglUnavailableError);
  });

  it('throws on a network error and never logs the token', async () => {
    const warn = vi.fn();
    const c = client(() =>
      Promise.reject(new TypeError('fetch failed secret-token')),
    );
    (c as unknown as { logger: { warn: typeof warn } }).logger.warn = warn;
    await expect(collect(c.timeEntries(user, 'a', 'b'))).rejects.toThrow(
      TogglUnavailableError,
    );
    expect(warn).toHaveBeenCalledWith('Toggl unavailable: TypeError');
    const auth = togglAuthorization('secret-token');
    for (const [msg] of warn.mock.calls as [string][]) {
      expect(msg).not.toContain('secret-token');
      expect(msg).not.toContain(auth);
    }
  });

  it('wraps a non-Error rejection', async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- testing a non-Error rejection
      collect(client(() => Promise.reject('boom')).timeEntries(user, 'a', 'b')),
    ).rejects.toThrow(TogglUnavailableError);
  });

  it('times out after 30 s per request', async () => {
    vi.useFakeTimers();
    const hanging: FetchFn = (_url, init) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new Error('aborted')),
        );
      });
    const pending = collect(client(hanging).timeEntries(user, 'a', 'b'));
    const assertion = expect(pending).rejects.toThrow(TogglUnavailableError);
    await vi.advanceTimersByTimeAsync(TOGGL_TIMEOUT_MS);
    await assertion;
  });

  it('starts a fresh 30 s timeout for every page', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const fetchFn: FetchFn = () => {
      calls++;
      const response =
        calls === 1 ? json([], { 'X-Next-Row-Number': '2' }) : json([]);
      return new Promise((resolve) =>
        setTimeout(() => resolve(response), TOGGL_TIMEOUT_MS - 1),
      );
    };
    const pending = collect(client(fetchFn).timeEntries(user, 'a', 'b'));
    await vi.advanceTimersByTimeAsync(2 * TOGGL_TIMEOUT_MS);
    await expect(pending).resolves.toEqual([]);
    expect(calls).toBe(2);
  });

  it('follows up to 5 redirects; 301/302/303 continue as GET without a body', async () => {
    let n = 0;
    const fetchFn = vi.fn<FetchFn>(() =>
      Promise.resolve(
        n++ < 5
          ? new Response(null, {
              status: 302,
              headers: { Location: `/hop/${n}` },
            })
          : json(page(1001, 60)),
      ),
    );
    await expect(
      collect(client(fetchFn).timeEntries(user, 'a', 'b')),
    ).resolves.toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(6);
    const [url, init] = fetchFn.mock.calls[5]!;
    expect(String(url)).toBe('https://toggl.example/hop/5');
    expect(init?.method).toBe('GET');
    expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).get('content-type')).toBeNull();
  });

  it('keeps method and body on 307/308', async () => {
    const fetchFn = vi
      .fn<FetchFn>()
      .mockResolvedValueOnce(
        new Response(null, { status: 307, headers: { Location: '/a' } }),
      )
      .mockResolvedValueOnce(
        new Response(null, { status: 308, headers: { Location: '/b' } }),
      )
      .mockResolvedValueOnce(json([]));
    await collect(client(fetchFn).timeEntries(user, 'a', 'b'));
    const init = fetchFn.mock.calls[2]![1];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(fetchFn.mock.calls[0]![1]?.body);
  });

  it('throws on the 6th redirect', async () => {
    const fetchFn = vi.fn<FetchFn>(() =>
      Promise.resolve(
        new Response(null, { status: 301, headers: { Location: '/again' } }),
      ),
    );
    await expect(
      collect(client(fetchFn).timeEntries(user, 'a', 'b')),
    ).rejects.toThrow(TogglUnavailableError);
    expect(fetchFn).toHaveBeenCalledTimes(6);
  });

  it('drops Authorization on a redirect to another origin', async () => {
    const fetchFn = vi
      .fn<FetchFn>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 307,
          headers: { Location: 'https://other.example/x' },
        }),
      )
      .mockResolvedValueOnce(json([]));
    await collect(client(fetchFn).timeEntries(user, 'a', 'b'));
    expect(
      new Headers(fetchFn.mock.calls[1]![1]?.headers).get('authorization'),
    ).toBeNull();
  });

  it('cancels the unread body on redirects and failed responses', async () => {
    const responses = [
      new Response('moved', { status: 307, headers: { Location: '/a' } }),
      new Response('busy', { status: 429 }),
    ];
    const cancels = responses.map((r) => vi.spyOn(r.body!, 'cancel'));
    const fetchFn = vi.fn<FetchFn>();
    for (const r of responses) fetchFn.mockResolvedValueOnce(r);
    await expect(
      collect(client(fetchFn).timeEntries(user, 'a', 'b')),
    ).rejects.toThrow(TogglUnavailableError);
    for (const cancel of cancels) expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('cancels the unread body of a non-JSON response', async () => {
    const res = new Response('<html>', {
      headers: { 'Content-Type': 'text/html' },
    });
    const cancel = vi.spyOn(res.body!, 'cancel');
    await expect(
      collect(client(() => Promise.resolve(res)).timeEntries(user, 'a', 'b')),
    ).rejects.toThrow(TogglUnavailableError);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('encodes togglWorkspaceId as one path segment', async () => {
    const fetchFn = vi.fn<FetchFn>(() => Promise.resolve(json([])));
    await collect(
      client(fetchFn).timeEntries(
        { ...user, togglWorkspaceId: '../42#?x' },
        'a',
        'b',
      ),
    );
    expect(String(fetchFn.mock.calls[0]![0])).toBe(
      `${BASE}/workspace/..%2F42%23%3Fx/search/time_entries`,
    );
  });

  it('accumulates a multi-page response with addEntry', async () => {
    const fetchFn = vi
      .fn<FetchFn>()
      .mockResolvedValueOnce(
        json(page(1001, 3600), { 'X-Next-Row-Number': '2' }),
      )
      .mockResolvedValueOnce(json(page(1001, 5400)));
    const a: Record<string, TogglTotals> = {
      '1001': {
        days: Array.from({ length: 31 }, () => ({ logged_time: 0 })),
        total: 0,
      },
    };
    for await (const e of client(fetchFn).timeEntries(
      user,
      '2024-03-01',
      '2024-03-31',
    ))
      addEntry(a, e, TZ, NOW);
    expect(a['1001']!.days[3]!.logged_time).toBe(2.5);
    expect(a['1001']!.total).toBe(2.5);
  });
});
