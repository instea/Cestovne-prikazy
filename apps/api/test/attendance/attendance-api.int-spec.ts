import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LeaveState, LeaveType } from '@leaves/shared/leaves';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { Response } from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Leave } from '../../src/leaves/leave.schema';
import { useHttpFakes } from '../mocks/http-fakes';
import { useTestApp } from '../support/app';
import { startSession } from '../support/auth';
import { TEST_M2M, TEST_TOGGL } from '../support/env';
import { m2mAuth } from '../support/m2m';
import { seedLeave, seedUser } from '../support/seed';
import type { AttendanceResponse } from '../../src/attendance/attendance.assembly';

/**
 * ATT-01: `GET /api/attendence/:year/:month` through Nest, against MongoDB 8
 * and the TST-02 SSO / Toggl fakes. Bodies are compared as exact bytes.
 */
const fakes = useHttpFakes();
const ctx = useTestApp();

const JSON_TYPE = 'application/json; charset=utf-8';
const SSO_ERROR = '{"message":"Cannot get data from SSO, try again later."}';
const TOGGL_ERROR =
  '{"message":"Cannot get data from Toggl, try again later."}';

function ssoUser(
  name: string,
  email: string,
  keys: Record<string, string>,
): unknown {
  return {
    name,
    email,
    keys: Object.entries(keys).map(([key, value]) => ({ key, value })),
  };
}

const toggl = (togglUserId: string) => ({
  togglUserId,
  togglWorkspaceId: '42',
  togglApiToken: TEST_TOGGL.apiToken,
});

const basic = (user: string, pass: string) =>
  `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

const get = (path: string, authorization?: string) => {
  const req = ctx().request().get(path);
  return authorization ? req.set('Authorization', authorization) : req;
};

const togglBodies = () =>
  fakes.requests
    .filter((r) => r.url.includes('/search/time_entries'))
    .map((r) => r.body);

const bodyOf = (res: Response) => res.body as AttendanceResponse;

function expectEmpty401(res: Response): void {
  expect(res.status).toBe(401);
  expect(res.text).toBe('');
  expect(res.headers['www-authenticate']).toBeUndefined();
}

function expectJson(res: Response, status: number, text: string): void {
  expect(res.status).toBe(status);
  expect(res.headers['content-type']).toBe(JSON_TYPE);
  expect(res.text).toBe(text);
}

/** One listed employee with no Toggl entries: a cheap valid 200. */
function serveOneEmployee(): void {
  fakes.sso.serve([
    ssoUser('Ema', 'ema@instea.co', { ...toggl('5'), employee: '1' }),
  ]);
  fakes.toggl.servePages([[]]);
}

describe('GET /api/attendence/:year/:month — authentication', () => {
  beforeEach(serveOneEmployee);

  it('no Authorization header → 401, empty body, no WWW-Authenticate', async () => {
    expectEmpty401(await get('/api/attendence/2024/3'));
    expect(fakes.requests).toEqual([]);
  });

  it('a valid app Bearer token → 401', async () => {
    const { app } = ctx();
    const admin = await seedUser(app, { isAdmin: true });
    const { accessToken } = await startSession(app, admin);
    expectEmpty401(
      await get('/api/attendence/2024/3', `Bearer ${accessToken}`),
    );
  });

  it('correct username, wrong password → 401', async () => {
    expectEmpty401(
      await get('/api/attendence/2024/3', basic(TEST_M2M.username, 'wrong')),
    );
  });

  it('wrong username, correct password → 401', async () => {
    expectEmpty401(
      await get('/api/attendence/2024/3', basic('wrong', TEST_M2M.password)),
    );
  });

  it('auth is checked before the params (bad params, no auth → 401)', async () => {
    expectEmpty401(await get('/api/attendence/abc/abc'));
  });

  it('a password containing ":" → 200 (split at the first colon)', async () => {
    expect(TEST_M2M.password).toContain(':');
    const res = await get('/api/attendence/2024/3', m2mAuth());
    expect(res.status).toBe(200);
  });

  it('lowercase scheme "basic" → 200', async () => {
    const header = m2mAuth().replace(/^Basic/, 'basic');
    expect((await get('/api/attendence/2024/3', header)).status).toBe(200);
  });

  it('M2M credentials do not open other /api routes', async () => {
    const res = await get('/api/auth/me', m2mAuth());
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ statusCode: 401, code: 'AUTH_REQUIRED' });
  });
});

describe('GET /api/attendence — M2M_PASSWORD unset', () => {
  const unset = useTestApp({ env: { M2M_PASSWORD: undefined } });

  it('username with an empty password → 401', async () => {
    const res = await unset()
      .request()
      .get('/api/attendence/2024/3')
      .set('Authorization', basic(TEST_M2M.username, ''));
    expectEmpty401(res);
  });
});

describe('GET /api/attendence/:year/:month — params', () => {
  beforeEach(serveOneEmployee);

  it('month "abc" → 400 Month is not a number.', async () => {
    expectJson(
      await get('/api/attendence/2024/abc', m2mAuth()),
      400,
      '{"message":"Month is not a number."}',
    );
  });

  it('year "abc", month 3 → 400 Year is not a number.', async () => {
    expectJson(
      await get('/api/attendence/abc/3', m2mAuth()),
      400,
      '{"message":"Year is not a number."}',
    );
  });

  it('both invalid → the month message', async () => {
    expectJson(
      await get('/api/attendence/abc/abc', m2mAuth()),
      400,
      '{"message":"Month is not a number."}',
    );
  });

  it('non-finite month (Infinity, 1e400) → 400 (safe fix)', async () => {
    for (const month of ['Infinity', '1e400']) {
      expectJson(
        await get(`/api/attendence/2024/${month}`, m2mAuth()),
        400,
        '{"message":"Month is not a number."}',
      );
    }
    expect(fakes.requests).toEqual([]);
  });

  it('a trailing slash is accepted', async () => {
    const res = await get('/api/attendence/2024/3/', m2mAuth());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ start: '2024-03-01', end: '2024-03-31' });
  });

  it('other methods are not served (404)', async () => {
    const res = await ctx()
      .request()
      .post('/api/attendence/2024/3')
      .set('Authorization', m2mAuth());
    expect(res.status).toBe(404);
  });
});

describe('GET /api/attendence/:year/:month — month overflow (preserved quirk)', () => {
  it('2024/13 → January 2025, Toggl dates for January 2025, no leave codes', async () => {
    const { app } = ctx();
    const ema = await seedUser(app, { email: 'ema.jan@instea.co' });
    await seedLeave(app, {
      requester: ema,
      state: LeaveState.APPROVED,
      startDate: '2025-01-07',
    });
    fakes.sso.serve([
      ssoUser('Ema', 'ema.jan@instea.co', { ...toggl('5'), employee: '1' }),
    ]);
    fakes.toggl.servePages([[]]);

    const res = await get('/api/attendence/2024/13', m2mAuth());

    expect(res.status).toBe(200);
    const body = bodyOf(res);
    expect(body.start).toBe('2025-01-01');
    expect(body.end).toBe('2025-01-31');
    const days = body.attendence.Ema!.days;
    expect(days).toHaveLength(31);
    expect(days.every((d) => d.leave === '')).toBe(true);
    expect(togglBodies()).toEqual([
      { start_date: '2025-01-01', end_date: '2025-01-31', user_ids: [5] },
    ]);
  });

  it('2024/0 → December 2023, no leave codes', async () => {
    const { app } = ctx();
    const ema = await seedUser(app, { email: 'ema.dec@instea.co' });
    await seedLeave(app, {
      requester: ema,
      state: LeaveState.APPROVED,
      startDate: '2023-12-04',
    });
    fakes.sso.serve([
      ssoUser('Ema', 'ema.dec@instea.co', { ...toggl('5'), employee: '1' }),
    ]);
    fakes.toggl.servePages([[]]);

    const res = await get('/api/attendence/2024/0', m2mAuth());

    expect(res.status).toBe(200);
    const body = bodyOf(res);
    expect(body.start).toBe('2023-12-01');
    expect(body.end).toBe('2023-12-31');
    const days = body.attendence.Ema!.days;
    expect(days).toHaveLength(31);
    expect(days.every((d) => d.leave === '')).toBe(true);
  });
});

describe('GET /api/attendence/:year/:month — success contract', () => {
  it('reproduces the March 2024 worked example byte-for-byte', async () => {
    const { app } = ctx();
    const anna = await seedUser(app, {
      email: 'anna.http@instea.co',
      firstName: 'Anna',
      surname: 'Svoboda',
    });
    const approved = { requester: anna, state: LeaveState.APPROVED };
    await seedLeave(app, {
      ...approved,
      startDate: '2024-03-05',
      isHalfDay: true,
      type: LeaveType.ANNUAL,
    });
    await seedLeave(app, {
      ...approved,
      startDate: '2024-03-05',
      type: LeaveType.DOCTOR,
    });
    await seedLeave(app, {
      ...approved,
      startDate: '2024-03-08',
      endDate: '2024-03-11',
      type: LeaveType.SICKNESS,
    });
    await seedLeave(app, {
      requester: anna,
      startDate: '2024-03-12',
      type: LeaveType.ANNUAL,
    });
    fakes.sso.serve([
      ssoUser('Anna', 'anna.http@instea.co', {
        ...toggl('20'),
        employee: '1',
        contractType: 'TPP',
      }),
      ssoUser('Boris', 'boris@instea.co', { ...toggl('7'), employee: '0' }),
      ssoUser('Cyril', 'cyril@instea.co', { employee: '1' }),
    ]);
    fakes.toggl.servePages([
      [
        {
          user_id: 20,
          time_entries: [{ seconds: 3600, start: '2024-03-04T09:00:00+01:00' }],
        },
      ],
    ]);

    const res = await get('/api/attendence/2024/3', m2mAuth());

    const golden = readFileSync(
      join(__dirname, 'golden', 'attendance.2024-03.json'),
      'utf8',
    );
    expectJson(res, 200, golden.trimEnd());
  });

  it('calls Toggl per employee sequentially, in SSO order', async () => {
    fakes.sso.serve([
      ssoUser('Zed', 'zed@instea.co', { ...toggl('30'), employee: '1' }),
      ssoUser('Amy', 'amy@instea.co', { ...toggl('4'), employee: '1' }),
    ]);
    fakes.toggl.servePages([[]]);

    const res = await get('/api/attendence/2024/3', m2mAuth());

    expect(res.status).toBe(200);
    expect(
      togglBodies().map((b) => (b as { user_ids: number[] }).user_ids),
    ).toEqual([[30], [4]]);
    // Output keys follow numeric togglUserId order, not SSO order.
    expect(Object.keys(bodyOf(res).attendence)).toEqual(['Amy', 'Zed']);
  });

  it('employee without togglUserId but with leaves → 200, no entry (no hang)', async () => {
    const { app } = ctx();
    const cyril = await seedUser(app, { email: 'cyril.http@instea.co' });
    await seedLeave(app, {
      requester: cyril,
      state: LeaveState.APPROVED,
      startDate: '2024-03-04',
    });
    fakes.sso.serve([
      ssoUser('Cyril', 'cyril.http@instea.co', {
        togglWorkspaceId: '42',
        togglApiToken: TEST_TOGGL.apiToken,
        employee: '1',
      }),
    ]);

    const res = await get('/api/attendence/2024/3', m2mAuth());

    expectJson(
      res,
      200,
      '{"start":"2024-03-01","end":"2024-03-31","attendence":{}}',
    );
  });
});

describe('GET /api/attendence/:year/:month — upstream and internal errors', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('SSO fails → 500 SSO message', async () => {
    fakes.sso.fail({ status: 502 });
    expectJson(await get('/api/attendence/2024/3', m2mAuth()), 500, SSO_ERROR);
  });

  it.each([
    ['429', { status: 429 }],
    ['402', { status: 402 }],
    ['500', { status: 500 }],
    [
      'a non-array body',
      { status: 200, contentType: 'application/json', body: '{}' },
    ],
  ])(
    'Toggl %s → 500 Toggl message, no partial data',
    async (_name, failure) => {
      serveOneEmployee();
      fakes.toggl.fail(failure);
      expectJson(
        await get('/api/attendence/2024/3', m2mAuth()),
        500,
        TOGGL_ERROR,
      );
    },
  );

  it('a Toggl row for an unlisted user_id → 500 Toggl message', async () => {
    serveOneEmployee();
    fakes.toggl.servePages([
      [
        {
          user_id: 999,
          time_entries: [{ seconds: 60, start: '2024-03-04T09:00:00+01:00' }],
        },
      ],
    ]);
    expectJson(
      await get('/api/attendence/2024/3', m2mAuth()),
      500,
      TOGGL_ERROR,
    );
  });

  it('Toggl fails for the second employee → 500, no partial data', async () => {
    fakes.sso.serve([
      ssoUser('One', 'one@instea.co', { ...toggl('1'), employee: '1' }),
      ssoUser('Two', 'two@instea.co', {
        ...toggl('2'),
        togglApiToken: 'rejected-token',
        employee: '1',
      }),
    ]);
    fakes.toggl.servePages([[]]);
    expectJson(
      await get('/api/attendence/2024/3', m2mAuth()),
      500,
      TOGGL_ERROR,
    );
  });

  it('a DB failure during the leave lookup → 500 Internal server error, promptly', async () => {
    const { app } = ctx();
    await seedUser(app, { email: 'ema@instea.co' });
    serveOneEmployee();
    const leaves = app.get<Model<Leave>>(getModelToken(Leave.name));
    vi.spyOn(leaves, 'find').mockImplementation(() => {
      throw new Error('MongoNetworkError: connection lost');
    });

    const started = Date.now();
    const res = await get('/api/attendence/2024/3', m2mAuth());

    expectJson(res, 500, '{"message":"Internal server error"}');
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});

describe('GET /api/attendence — no CORS headers', () => {
  const dev = useTestApp({ env: { NODE_ENV: 'development' } });
  const ORIGIN = 'http://localhost:5173';

  it('the attendance route sends no CORS headers for the app origin', async () => {
    const res = await dev()
      .request()
      .get('/api/attendence/2024/3')
      .set('Origin', ORIGIN);
    expectEmpty401(res);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('app routes still answer CORS for the app origin', async () => {
    const res = await dev()
      .request()
      .get('/health-check')
      .set('Origin', ORIGIN);
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
  });
});
