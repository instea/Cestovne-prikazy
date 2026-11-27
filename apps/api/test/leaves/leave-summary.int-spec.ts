import { ErrorCode } from '@leaves/shared/enums';
import { LeaveState, LeaveType } from '@leaves/shared/leaves';
import { describe, expect, it } from 'vitest';
import { useTestApp } from '../support/app';
import { loginAs, startSession } from '../support/auth';
import { m2mAuth } from '../support/m2m';
import { seedLeave, seedUser } from '../support/seed';

/** SUM-01 `GET /api/leaves/summary` against MongoDB 8. */

const ctx = useTestApp();

async function bearer(options: Parameters<typeof seedUser>[1] = {}) {
  const user = await seedUser(ctx().app, options);
  const { accessToken } = await loginAs(ctx().app, user);
  return { user, headers: { Authorization: `Bearer ${accessToken}` } };
}

const get = (headers: Record<string, string>) =>
  ctx().request().get('/api/leaves/summary').set(headers);

describe('GET /api/leaves/summary (SUM-01)', () => {
  it("returns only the caller's APPROVED leaves, recomputed from the dates", async () => {
    const { app } = ctx();
    const { user, headers } = await bearer();
    const other = await seedUser(app);
    // Worked example: L1 PENDING, L3 REJECTED → 2018: 4, 2017: 3.
    await seedLeave(app, {
      requester: user,
      startDate: '2017-12-10',
      endDate: '2017-12-14',
      state: LeaveState.PENDING,
    });
    await seedLeave(app, {
      requester: user,
      startDate: '2017-12-27',
      endDate: '2018-01-05',
      state: LeaveState.APPROVED,
      numDays: 99, // stored value is not used
    });
    await seedLeave(app, {
      requester: user,
      startDate: '2018-01-10',
      endDate: '2018-01-14',
      state: LeaveState.REJECTED,
    });
    // Another user's APPROVED leaves never appear.
    await seedLeave(app, {
      requester: other,
      startDate: '2019-03-04',
      endDate: '2019-03-08',
      state: LeaveState.APPROVED,
      type: LeaveType.SICKNESS,
    });
    await seedLeave(app, {
      requester: other,
      startDate: '2017-12-11',
      endDate: '2017-12-11',
      state: LeaveState.APPROVED,
    });

    const res = await get(headers);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      years: [
        { year: 2018, byType: [{ type: 'ANNUAL', workDays: 4 }] },
        { year: 2017, byType: [{ type: 'ANNUAL', workDays: 3 }] },
      ],
    });
  });

  it('an admin sees only their own summary', async () => {
    const { app } = ctx();
    const { user, headers } = await bearer({ isAdmin: true });
    await seedLeave(app, {
      requester: user,
      startDate: '2026-11-04',
      endDate: '2026-11-04',
      isHalfDay: true,
      state: LeaveState.APPROVED,
    });
    expect((await get(headers)).body).toEqual({
      years: [{ year: 2026, byType: [{ type: 'ANNUAL', workDays: 0.5 }] }],
    });
  });

  it('only PENDING / REJECTED own leaves → years: []', async () => {
    const { app } = ctx();
    const { user, headers } = await bearer();
    await seedLeave(app, { requester: user, state: LeaveState.PENDING });
    await seedLeave(app, { requester: user, state: LeaveState.REJECTED });
    const res = await get(headers);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ years: [] });
  });

  it('no session → 401 AUTH_REQUIRED; m2m Basic → 401 AUTH_REQUIRED', async () => {
    for (const headers of [{}, { Authorization: m2mAuth() }] as Record<
      string,
      string
    >[]) {
      const res = await get(headers);
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ code: ErrorCode.AUTH_REQUIRED });
    }
  });

  it('deactivated → 401 USER_DEACTIVATED', async () => {
    const user = await seedUser(ctx().app, { active: false });
    const { accessToken } = await startSession(ctx().app, user);
    const res = await get({ Authorization: `Bearer ${accessToken}` });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: ErrorCode.USER_DEACTIVATED });
  });
});
