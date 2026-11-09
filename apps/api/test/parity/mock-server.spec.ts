import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { basicAuth } from '../mocks/contract.mts';
import type { FixtureSet } from './fixtures.mts';
import {
  type RunningMock,
  startMockServer,
  UNMATCHED_STATUS,
} from './mock-server.mts';

const SSO_AUTH = basicAuth('PARITY_SSO_USER', 'PARITY_SSO_PASSWORD');
const TOGGL_AUTH = basicAuth('PARITY_TOGGL_TOKEN', 'api_token');
const PATH = '/reports/api/v3/workspace/111/search/time_entries';

const fixtures: FixtureSet = {
  sso: {
    username: 'PARITY_SSO_USER',
    password: 'PARITY_SSO_PASSWORD',
    response: { status: 200, body: [{ name: 'A', email: 'a@x', keys: [] }] },
  },
  toggl: [
    {
      key: {
        workspaceId: '111',
        userIds: [20],
        startDate: '2024-03-01',
        endDate: '2024-03-31',
        firstRowNumber: null,
        token: 'PARITY_TOGGL_TOKEN',
      },
      response: {
        status: 200,
        headers: { 'X-Next-Row-Number': '3' },
        body: [{ user_id: 20, time_entries: [] }],
      },
    },
    {
      key: {
        workspaceId: '111',
        userIds: [20],
        startDate: '2024-03-01',
        endDate: '2024-03-31',
        firstRowNumber: 3,
        token: 'PARITY_TOGGL_TOKEN',
      },
      response: { status: 200, body: [] },
    },
    {
      key: {
        workspaceId: '111',
        userIds: [null],
        startDate: '2024-04-01',
        endDate: '2024-04-30',
        firstRowNumber: null,
        token: 'PARITY_TOGGL_TOKEN',
      },
      response: { status: 200, body: [], redirects: 2 },
    },
    {
      key: {
        workspaceId: '111',
        userIds: [35],
        startDate: '2024-04-01',
        endDate: '2024-04-30',
        firstRowNumber: null,
        token: 'PARITY_TOGGL_TOKEN',
      },
      response: { status: 200, body: [], delayMs: 50 },
    },
  ],
};

describe('parity mock server (MIG-03)', () => {
  let mock: RunningMock;
  const url = (app: 'old' | 'new', path: string) =>
    `http://127.0.0.1:${mock.ports[app]}${path}`;
  const control = (path: string, init?: RequestInit) =>
    fetch(`http://127.0.0.1:${mock.controlPort}${path}`, init);
  const toggl = (app: 'old' | 'new', body: unknown, auth = TOGGL_AUTH) =>
    fetch(url(app, PATH), {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  beforeAll(async () => {
    mock = await startMockServer({
      host: '127.0.0.1',
      controlPort: 0,
      apps: [
        { name: 'old', port: 0 },
        { name: 'new', port: 0 },
      ],
    });
    const loaded = await control('/__fixtures', {
      method: 'POST',
      body: JSON.stringify(fixtures),
    });
    expect(loaded.status).toBe(204);
  });
  afterAll(() => mock.close());
  beforeEach(async () => {
    await control('/__reset', { method: 'POST' });
  });

  it('serves SSO only with the exact Basic credentials; a mismatch counts as unmatched', async () => {
    expect(
      (
        await fetch(url('old', '/sso'), {
          headers: { Authorization: SSO_AUTH },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await fetch(url('old', '/sso'), {
          headers: { Authorization: TOGGL_AUTH },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await fetch(url('old', '/sso'), {
          method: 'POST',
          headers: { Authorization: SSO_AUTH },
        })
      ).status,
    ).toBe(401);
    // Wrong credentials would make both apps return the same SSO error and
    // compare EQUAL: the harness must see them as unmatched.
    expect(
      mock.records.map((r) => [r.status, r.unmatched, r.reason ?? null]),
    ).toEqual([
      [200, false, null],
      [401, true, 'SSO credentials do not match the fixture set'],
      [401, true, 'SSO method POST (expected GET)'],
    ]);
  });

  it('answers Toggl by exact key, with paging headers', async () => {
    const first = await toggl('new', {
      start_date: '2024-03-01',
      end_date: '2024-03-31',
      user_ids: [20],
    });
    expect(first.status).toBe(200);
    expect(first.headers.get('x-next-row-number')).toBe('3');
    const second = await toggl('new', {
      start_date: '2024-03-01',
      end_date: '2024-03-31',
      user_ids: [20],
      first_row_number: 3,
    });
    expect(await second.json()).toEqual([]);
  });

  it('answers an unknown key with 599 and records it as unmatched', async () => {
    const res = await toggl('old', {
      start_date: '2024-05-01',
      end_date: '2024-05-31',
      user_ids: [20],
    });
    expect(res.status).toBe(UNMATCHED_STATUS);
    expect(mock.records).toMatchObject([
      { app: 'old', service: 'toggl', unmatched: true, status: 599 },
    ]);
  });

  it('requires the token:api_token Basic auth on Toggl; a mismatch counts as unmatched', async () => {
    const body = {
      start_date: '2024-03-01',
      end_date: '2024-03-31',
      user_ids: [20],
    };
    expect(
      (await toggl('old', body, basicAuth('PARITY_TOGGL_TOKEN', 'x'))).status,
    ).toBe(401);
    expect((await toggl('new', body, 'Bearer PARITY_TOGGL_TOKEN')).status).toBe(
      401,
    );
    expect(mock.records).toMatchObject([
      {
        app: 'old',
        service: 'toggl',
        status: 401,
        unmatched: true,
        reason: 'Toggl auth is not Basic <token>:api_token',
      },
      { app: 'new', service: 'toggl', status: 401, unmatched: true },
    ]);
  });

  it('serves the old app known-bad [null] request from a fixture and records the contract problem', async () => {
    const res = await toggl('old', {
      start_date: '2024-04-01',
      end_date: '2024-04-30',
      user_ids: [null],
    });
    expect(res.status).toBe(200);
    // Two injected redirect hops, then the answer (fetch follows 307 with the body).
    expect(mock.records.map((r) => [r.status, r.injected ?? null])).toEqual([
      [307, 'redirect'],
      [307, 'redirect'],
      [200, null],
    ]);
    expect(mock.records[0]!.contractProblem).toBe(
      'user_ids is not an array of integers',
    );
  });

  it('injects latency and attributes every request to its app', async () => {
    const started = Date.now();
    await toggl('new', {
      start_date: '2024-04-01',
      end_date: '2024-04-30',
      user_ids: [35],
    });
    expect(Date.now() - started).toBeGreaterThanOrEqual(45);
    await fetch(url('old', '/sso'), { headers: { Authorization: SSO_AUTH } });
    const listed = (await (await control('/__requests')).json()) as {
      records: { app: string; injected?: string }[];
    };
    expect(listed.records.map((r) => [r.app, r.injected ?? null])).toEqual([
      ['new', 'delay'],
      ['old', null],
    ]);
  });
});
