import { getModelToken } from '@nestjs/mongoose';
import { LeaveState, LeaveType } from '@leaves/shared/leaves';
import type { Model } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { CLOCK, type Clock } from '../../src/common/clock';
import { APP_CONFIG } from '../../src/config/config.module';
import type { AppConfig } from '../../src/config/env.schema';
import { Leave } from '../../src/leaves/leave.schema';
import { User } from '../../src/users/user.schema';
import { useTestApp } from '../support/app';
import { loginAs } from '../support/auth';
import { TEST_M2M } from '../support/env';
import { m2mAuth } from '../support/m2m';
import { seedLeave, seedUser } from '../support/seed';
import { TestClock } from '../support/test-clock';

describe('TestClock', () => {
  it('starts at the given instant and only moves when told to', () => {
    const clock = new TestClock('2026-12-21T08:00:00Z');
    expect(clock.now().toISOString()).toBe('2026-12-21T08:00:00.000Z');
    clock.advance(90_000);
    expect(clock.now().toISOString()).toBe('2026-12-21T08:01:30.000Z');
    clock.set('2027-01-01T00:00:00+01:00');
    expect(clock.now().toISOString()).toBe('2026-12-31T23:00:00.000Z');
  });

  it('returns a copy, so callers cannot move the clock by mutation', () => {
    const clock = new TestClock('2026-01-01T00:00:00Z');
    clock.now().setUTCFullYear(2030);
    expect(clock.now().getUTCFullYear()).toBe(2026);
  });

  it('rejects an invalid date', () => {
    expect(() => new TestClock('nope')).toThrow(/invalid date/i);
  });
});

describe('createTestApp (full AppModule)', () => {
  const ctx = useTestApp({ env: { DEFAULT_TIMEZONE: 'Europe/Prague' } });

  it('injects the controllable TestClock as CLOCK', () => {
    const clock = ctx().app.get<Clock>(CLOCK);
    expect(clock).toBe(ctx().clock);
    const before = clock.now().getTime();
    ctx().clock.advance(1000);
    expect(clock.now().getTime()).toBe(before + 1000);
  });

  it('applies env overrides and points SMTP at Mailpit', () => {
    const config = ctx().app.get<AppConfig>(APP_CONFIG);
    expect(config.NODE_ENV).toBe('test');
    expect(config.DEFAULT_TIMEZONE).toBe('Europe/Prague');
    expect(config.AUTH_GOOGLE_VERIFIER).toBe('fake');
    expect(config.SMTP_HOST).toBe(ctx().mail.smtpHost);
    expect(config.SMTP_PORT).toBe(ctx().mail.smtpPort);
    expect(config.SMTP_USER).toBeTruthy();
    expect(config.SMTP_PASSWORD).toBeTruthy();
    expect(config.MONGO_URL).toMatch(/\/test_[0-9a-f]{32}\?/);
  });

  it('serves HTTP through supertest', async () => {
    const res = await ctx().request().get('/health-check');
    expect(res.status).toBe(200);
  });

  it('seedUser stores an active non-admin user with unique id/email by default', async () => {
    const a = await seedUser(ctx().app);
    const b = await seedUser(ctx().app);
    expect(a).toMatchObject({ isAdmin: false, active: true });
    expect(a.deactivatedAt).toBeNull();
    expect(a.id).not.toBe(b.id);
    expect(a.email).not.toBe(b.email);
    const Users = ctx().app.get<Model<User>>(getModelToken(User.name));
    expect(await Users.countDocuments({ id: { $in: [a.id, b.id] } })).toBe(2);
  });

  it('seedUser({ isAdmin, active: false }) stores an admin deactivated at clock time', async () => {
    const u = await seedUser(ctx().app, { isAdmin: true, active: false });
    expect(u).toMatchObject({ isAdmin: true, active: false });
    expect(u.deactivatedAt?.getTime()).toBe(ctx().clock.now().getTime());
  });

  it('seedLeave stores a leave with numDays computed by the work-day rules', async () => {
    const user = await seedUser(ctx().app);
    const leave = await seedLeave(ctx().app, {
      requester: user,
      startDate: '2026-12-21',
      endDate: '2026-12-27',
    });
    // Mon 21 – Sun 27: 24., 25., 26. are holidays, 26./27. weekend.
    expect(leave).toMatchObject({
      requesterId: user.id,
      startDate: '2026-12-21',
      endDate: '2026-12-27',
      numDays: 3,
      isHalfDay: false,
      type: LeaveType.ANNUAL,
      state: LeaveState.PENDING,
      approverId: null,
    });
    const Leaves = ctx().app.get<Model<Leave>>(getModelToken(Leave.name));
    expect(await Leaves.countDocuments({ id: leave.id })).toBe(1);
  });

  it('seedLeave accepts state, type, half-day and approver', async () => {
    const [user, admin] = [
      await seedUser(ctx().app),
      await seedUser(ctx().app, { isAdmin: true }),
    ];
    const leave = await seedLeave(ctx().app, {
      requester: user,
      startDate: '2026-12-22',
      endDate: '2026-12-22',
      isHalfDay: true,
      type: LeaveType.DOCTOR,
      state: LeaveState.APPROVED,
      approver: admin,
    });
    expect(leave).toMatchObject({
      numDays: 0.5,
      type: LeaveType.DOCTOR,
      state: LeaveState.APPROVED,
      approverId: admin.id,
    });
  });
});

describe('m2mAuth', () => {
  it('builds the Basic header from the test M2M credentials', () => {
    const expected = Buffer.from(
      `${TEST_M2M.username}:${TEST_M2M.password}`,
    ).toString('base64');
    expect(m2mAuth()).toBe(`Basic ${expected}`);
  });

  it('accepts explicit credentials (passwords may contain ":")', () => {
    expect(m2mAuth({ username: 'a', password: 'b:c' })).toBe(
      `Basic ${Buffer.from('a:b:c').toString('base64')}`,
    );
  });
});

describe('loginAs', () => {
  const ctx = useTestApp();

  it('logs a seeded user in through POST /api/auth/google', async () => {
    const user = await seedUser(ctx().app, { isAdmin: true });
    const { accessToken, refreshToken } = await loginAs(ctx().app, user);
    expect(refreshToken).not.toBe('');
    const me = await ctx()
      .request()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ id: user.id, isAdmin: true });
  });
});
