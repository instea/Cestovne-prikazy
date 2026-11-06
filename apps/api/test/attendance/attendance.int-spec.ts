import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LeaveState, LeaveType } from '@leaves/shared/leaves';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import {
  type AttendanceResponse,
  attendancePeriod,
} from '../../src/attendance/attendance.assembly';
import { AttendanceService } from '../../src/attendance/attendance.service';
import { Leave } from '../../src/leaves/leave.schema';
import { User } from '../../src/users/user.schema';
import { useHttpFakes } from '../mocks/http-fakes';
import { useTestApp } from '../support/app';
import { TEST_TOGGL } from '../support/env';
import { seedLeave, seedUser } from '../support/seed';

/**
 * ATT-04 against MongoDB 8 and the TST-02 SSO / Toggl fakes.
 * TODO(ATT-01): the same cases through `GET /api/attendence/:year/:month`.
 */
const fakes = useHttpFakes();
const ctx = useTestApp();

const GOLDEN = join(__dirname, 'golden');

/** One SSO directory record in the raw meta-API shape. */
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

const build = (year: number, month: number): Promise<AttendanceResponse> =>
  ctx().app.get(AttendanceService).build(attendancePeriod(year, month));

const togglRequests = () =>
  fakes.requests.filter((r) => r.url.includes('/search/time_entries'));

describe('AttendanceService (ATT-04)', () => {
  it('reproduces the March 2024 worked example byte-for-byte', async () => {
    const { app } = ctx();
    const anna = await seedUser(app, {
      email: 'anna.svoboda@instea.co',
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
      ssoUser('Anna', 'anna.svoboda@instea.co', {
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

    const result = await build(2024, 3);

    const golden = readFileSync(
      join(GOLDEN, 'attendance.2024-03.json'),
      'utf8',
    );
    expect(JSON.stringify(result)).toBe(golden.trimEnd());
    // Only Anna (employee with togglUserId) hits Toggl, for the whole month.
    expect(togglRequests().map((r) => r.body)).toEqual([
      { start_date: '2024-03-01', end_date: '2024-03-31', user_ids: [20] },
    ]);
  });

  it('skips an employee without togglUserId (no hang, no Toggl call)', async () => {
    const { app } = ctx();
    const cyril = await seedUser(app, { email: 'cyril.hang@instea.co' });
    await seedLeave(app, {
      requester: cyril,
      state: LeaveState.APPROVED,
      startDate: '2024-03-04',
    });
    fakes.sso.serve([
      ssoUser('Cyril', 'cyril.hang@instea.co', {
        togglWorkspaceId: '42',
        togglApiToken: TEST_TOGGL.apiToken,
        employee: '1',
      }),
      ssoUser('Dana', 'dana@instea.co', { ...toggl('3'), employee: '0' }),
    ]);

    const result = await build(2024, 3);

    expect(Object.keys(result.attendence)).toEqual(['Dana']);
    expect(togglRequests()).toEqual([]);
  });

  it('REJECTED and PENDING leaves only → every leave is empty', async () => {
    const { app } = ctx();
    const user = await seedUser(app, { email: 'rejected@instea.co' });
    await seedLeave(app, {
      requester: user,
      state: LeaveState.REJECTED,
      startDate: '2024-03-04',
      endDate: '2024-03-08',
    });
    await seedLeave(app, {
      requester: user,
      state: LeaveState.PENDING,
      startDate: '2024-03-11',
    });
    fakes.sso.serve([
      ssoUser('Rejected', 'rejected@instea.co', {
        ...toggl('13'),
        employee: '1',
      }),
    ]);
    fakes.toggl.servePages([[]]);

    const result = await build(2024, 3);

    expect(result.attendence.Rejected!.days.every((d) => d.leave === '')).toBe(
      true,
    );
  });

  it('a non-employee gets a zero entry with no Toggl call and no DB lookup', async () => {
    const { app } = ctx();
    const user = await seedUser(app, { email: 'contractor@instea.co' });
    await seedLeave(app, {
      requester: user,
      state: LeaveState.APPROVED,
      startDate: '2024-03-04',
    });
    fakes.sso.serve([
      ssoUser('Contractor', 'contractor@instea.co', {
        ...toggl('14'),
        employee: '0',
      }),
    ]);
    const users = app.get<Model<User>>(getModelToken(User.name));
    const leaves = app.get<Model<Leave>>(getModelToken(Leave.name));
    const userLookup = vi.spyOn(users, 'findOne');
    const leaveLookup = vi.spyOn(leaves, 'find');
    const before = togglRequests().length;

    try {
      const result = await build(2024, 3);
      expect(result.attendence.Contractor).toEqual({
        days: Array.from({ length: 31 }, () => ({ logged_time: 0, leave: '' })),
        total: 0,
      });
    } finally {
      vi.restoreAllMocks();
    }
    expect(togglRequests().length).toBe(before);
    expect(userLookup).not.toHaveBeenCalled();
    expect(leaveLookup).not.toHaveBeenCalled();
  });

  it('matches the SSO email exactly (case-sensitive)', async () => {
    const { app } = ctx();
    const user = await seedUser(app, { email: 'mixed.case@instea.co' });
    await seedLeave(app, {
      requester: user,
      state: LeaveState.APPROVED,
      startDate: '2024-03-04',
    });
    fakes.sso.serve([
      ssoUser('Mixed', 'Mixed.Case@instea.co', {
        ...toggl('11'),
        employee: '1',
      }),
    ]);
    fakes.toggl.servePages([[]]);

    const result = await build(2024, 3);

    expect(result.attendence.Mixed!.days.every((d) => d.leave === '')).toBe(
      true,
    );
  });

  it("counts a deactivated user's APPROVED leave", async () => {
    const { app } = ctx();
    const user = await seedUser(app, {
      email: 'gone@instea.co',
      active: false,
    });
    await seedLeave(app, {
      requester: user,
      state: LeaveState.APPROVED,
      startDate: '2024-03-04',
      type: LeaveType.PARENTAL,
    });
    fakes.sso.serve([
      ssoUser('Gone', 'gone@instea.co', { ...toggl('12'), employee: '1' }),
    ]);
    fakes.toggl.servePages([[]]);

    const result = await build(2024, 3);

    expect(result.attendence.Gone!.days[3]!.leave).toBe('I');
  });

  it('month 13 → January of next year, no leave codes', async () => {
    const { app } = ctx();
    const user = await seedUser(app, { email: 'overflow@instea.co' });
    await seedLeave(app, {
      requester: user,
      state: LeaveState.APPROVED,
      startDate: '2025-01-02',
    });
    fakes.sso.serve([
      ssoUser('Over', 'overflow@instea.co', { ...toggl('13'), employee: '1' }),
    ]);
    fakes.toggl.servePages([[]]);

    const result = await build(2024, 13);

    expect(result.start).toBe('2025-01-01');
    expect(result.end).toBe('2025-01-31');
    expect(result.attendence.Over!.days).toHaveLength(31);
    expect(result.attendence.Over!.days.every((d) => d.leave === '')).toBe(
      true,
    );
    expect(togglRequests()[0]?.body).toMatchObject({
      start_date: '2025-01-01',
      end_date: '2025-01-31',
    });
  });

  it('writes only the requested month of a multi-month leave, each day once', async () => {
    const { app } = ctx();
    const user = await seedUser(app, { email: 'long@instea.co' });
    await seedLeave(app, {
      requester: user,
      state: LeaveState.APPROVED,
      type: LeaveType.MATERNITY,
      startDate: '2024-01-02',
      endDate: '2025-01-31',
    });
    fakes.sso.serve([
      ssoUser('Long', 'long@instea.co', { ...toggl('14'), employee: '1' }),
    ]);
    fakes.toggl.servePages([[]]);

    const result = await build(2025, 1);

    const leaves = result.attendence.Long!.days.map((d) => d.leave);
    // 2025-01-01 (holiday), weekends empty; working days exactly 'I'.
    expect(leaves[0]).toBe('');
    expect(leaves[1]).toBe('I'); // Thu 2 Jan
    expect(leaves[3]).toBe(''); // Sat 4 Jan
    expect(new Set(leaves)).toEqual(new Set(['', 'I']));
  });
});
