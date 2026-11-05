import { describe, expect, it, vi } from 'vitest';
import {
  TogglClient,
  type TogglEntry,
  TogglUnavailableError,
} from '../../src/attendance/toggl/toggl.client';
import { useHttpFakes } from '../mocks/http-fakes';
import { TEST_TOGGL } from '../support/env';

/**
 * ATT-03: the real TogglClient over HTTP against the TST-02 Toggl fake.
 * TODO(ATT-01): end-to-end via the attendance endpoint (two employees,
 * sequential order, total delays with fake timers), and that Toggl 429, 402,
 * 500, a non-array body, and a row whose user_id is not a listed togglUserId
 * each give 500 'Cannot get data from Toggl, try again later.'.
 */
const fakes = useHttpFakes();

const user = {
  togglWorkspaceId: '42',
  togglUserId: '1001',
  togglApiToken: TEST_TOGGL.apiToken,
};

function client() {
  const sleep = vi.fn(() => Promise.resolve());
  const c = new TogglClient(
    { TOGGL_REPORTS_BASE_URL: TEST_TOGGL.baseUrl },
    undefined,
    sleep,
  );
  return { c, sleep };
}

async function collect(it: AsyncIterable<TogglEntry>): Promise<TogglEntry[]> {
  const out: TogglEntry[] = [];
  for await (const e of it) out.push(e);
  return out;
}

describe('TogglClient against the Toggl fake', () => {
  it('reads the single-page fixture with one call and one pause', async () => {
    const { c, sleep } = client();
    const entries = await collect(
      c.timeEntries(user, '2026-12-01', '2026-12-31'),
    );
    expect(entries).toEqual([
      { userId: 1001, seconds: 28800, start: '2026-12-21T08:00:00+01:00' },
      { userId: 1001, seconds: 14400, start: '2026-12-22T09:00:00+01:00' },
    ]);
    expect(fakes.requests).toHaveLength(1);
    expect(fakes.requests[0]).toMatchObject({
      method: 'POST',
      url: `${TEST_TOGGL.baseUrl}/workspace/42/search/time_entries`,
      body: {
        start_date: '2026-12-01',
        end_date: '2026-12-31',
        user_ids: [1001],
      },
      status: 200,
    });
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('follows X-Next-Row-Number across pages in order', async () => {
    const row = (seconds: number) => ({
      user_id: 1001,
      time_entries: [{ seconds, start: '2026-12-21T08:00:00+01:00' }],
    });
    fakes.toggl.servePages([[row(1), row(2)], [row(3)], [row(4)]]);
    const { c, sleep } = client();
    const entries = await collect(
      c.timeEntries(user, '2026-12-01', '2026-12-31'),
    );
    expect(entries.map((e) => e.seconds)).toEqual([1, 2, 3, 4]);
    expect(fakes.requests.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(
      fakes.requests.map(
        (r) => (r.body as { first_row_number?: number }).first_row_number,
      ),
    ).toEqual([undefined, 3, 4]);
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it.each([402, 429, 500])(
    'maps HTTP %d to TogglUnavailableError',
    async (status) => {
      fakes.toggl.fail({ status });
      await expect(
        collect(client().c.timeEntries(user, '2026-12-01', '2026-12-31')),
      ).rejects.toThrow(TogglUnavailableError);
    },
  );

  it('maps a non-array body to TogglUnavailableError', async () => {
    fakes.toggl.servePages([{ error: 'nope' }]);
    await expect(
      collect(client().c.timeEntries(user, '2026-12-01', '2026-12-31')),
    ).rejects.toThrow(TogglUnavailableError);
    expect(fakes.requests[0]?.status).toBe(200);
  });

  it('maps a wrong token (401) to TogglUnavailableError', async () => {
    await expect(
      collect(
        client().c.timeEntries(
          { ...user, togglApiToken: 'wrong' },
          '2026-12-01',
          '2026-12-31',
        ),
      ),
    ).rejects.toThrow(TogglUnavailableError);
    expect(fakes.requests[0]?.status).toBe(401);
  });
});
