import { getModelToken } from '@nestjs/mongoose';
import { ErrorCode } from '@leaves/shared/enums';
import { LeaveState, LeaveType } from '@leaves/shared/leaves';
import type { Model } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuditLog } from '../../src/audit/audit-log.schema';
import { Leave } from '../../src/leaves/leave.schema';
import { MailService } from '../../src/mail/mail.service';
import { User } from '../../src/users/user.schema';
import { type TestApp, useTestApp } from '../support/app';
import { loginAs, startSession } from '../support/auth';
import { m2mAuth } from '../support/m2m';
import { seedLeave, seedUser, type SeedUserOptions } from '../support/seed';

/**
 * LV-03 `DELETE /api/leaves/:id` against MongoDB 8: owner in every state,
 * non-owner 403, admin any leave, 404 before 403, hard delete with a
 * `LEAVE_DELETED` snapshot (NFR-06) in the same transaction, no email.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

const leavesOf = (ctx: TestApp) =>
  ctx.app.get<Model<Leave>>(getModelToken(Leave.name));
const auditOf = (ctx: TestApp) =>
  ctx.app.get<Model<AuditLog>>(getModelToken(AuditLog.name));

describe('DELETE /api/leaves/:id (LV-03)', () => {
  const ctx = useTestApp();

  async function caller(options: SeedUserOptions = {}) {
    const user = await seedUser(ctx().app, options);
    const { accessToken } =
      options.active === false
        ? await startSession(ctx().app, user)
        : await loginAs(ctx().app, user);
    return { user, headers: { Authorization: `Bearer ${accessToken}` } };
  }

  const del = (id: string, headers: Record<string, string> = {}) =>
    ctx().request().delete(`/api/leaves/${id}`).set(headers);

  /** The leave still exists and no audit entry targets it. */
  async function expectUntouched(id: string) {
    expect(await leavesOf(ctx()).exists({ id })).toBeTruthy();
    expect(await auditOf(ctx()).countDocuments({ targetId: id })).toBe(0);
  }

  it.each([LeaveState.PENDING, LeaveState.APPROVED, LeaveState.REJECTED])(
    'the owner deletes their own %s leave: 204, document removed, LEAVE_DELETED snapshot',
    async (state) => {
      ctx().clock.set('2026-11-10T08:00:00.000Z');
      const { user, headers } = await caller();
      const admin = await seedUser(ctx().app, { isAdmin: true });
      const leave = await seedLeave(ctx().app, {
        requester: user,
        approver: state === LeaveState.PENDING ? null : admin,
        startDate: '2026-12-21',
        endDate: '2026-12-23',
        type: LeaveType.DOCTOR,
        state,
      });

      const res = await del(leave.id, headers);
      expect(res.status).toBe(204);
      expect(res.text).toBe('');
      expect(await leavesOf(ctx()).exists({ id: leave.id })).toBeNull();

      const entries = await auditOf(ctx()).find({ targetId: leave.id }).lean();
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        at: new Date('2026-11-10T08:00:00.000Z'),
        actorType: 'user',
        actorId: user.id,
        action: 'LEAVE_DELETED',
        targetType: 'LEAVE',
        targetId: leave.id,
      });
      expect(entries[0]!.details).toStrictEqual({
        before: {
          id: leave.id,
          requesterId: user.id,
          approverId: state === LeaveState.PENDING ? null : admin.id,
          startDate: '2026-12-21',
          endDate: '2026-12-23',
          isHalfDay: false,
          type: LeaveType.DOCTOR,
          state,
          numDays: 3,
        },
      });
    },
  );

  it('a second delete of the same leave → 404 LEAVE_NOT_FOUND, no second entry', async () => {
    const { user, headers } = await caller();
    const leave = await seedLeave(ctx().app, { requester: user });
    expect((await del(leave.id, headers)).status).toBe(204);
    const again = await del(leave.id, headers);
    expect(again.status).toBe(404);
    expect(again.body).toEqual({
      statusCode: 404,
      code: ErrorCode.LEAVE_NOT_FOUND,
      message: 'Leave not found',
    });
    expect(await auditOf(ctx()).countDocuments({ targetId: leave.id })).toBe(1);
  });

  it("another user's leave → 403 FORBIDDEN; the leave still exists", async () => {
    const owner = await seedUser(ctx().app);
    const leave = await seedLeave(ctx().app, {
      requester: owner,
      state: LeaveState.APPROVED,
    });
    const { headers } = await caller();
    const res = await del(leave.id, headers);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      statusCode: 403,
      code: ErrorCode.FORBIDDEN,
      message: 'You can delete only your own leaves',
    });
    await expectUntouched(leave.id);
  });

  it("an admin deletes another user's APPROVED leave → 204, actor = admin", async () => {
    const owner = await seedUser(ctx().app);
    const leave = await seedLeave(ctx().app, {
      requester: owner,
      state: LeaveState.APPROVED,
    });
    const { user: admin, headers } = await caller({ isAdmin: true });
    expect((await del(leave.id, headers)).status).toBe(204);
    expect(await leavesOf(ctx()).exists({ id: leave.id })).toBeNull();
    const entry = await auditOf(ctx()).findOne({ targetId: leave.id }).lean();
    expect(entry).toMatchObject({
      actorId: admin.id,
      action: 'LEAVE_DELETED',
      details: { before: { requesterId: owner.id, state: 'APPROVED' } },
    });
  });

  it('an admin deletes their own leave → 204', async () => {
    const { user: admin, headers } = await caller({ isAdmin: true });
    const leave = await seedLeave(ctx().app, { requester: admin });
    expect((await del(leave.id, headers)).status).toBe(204);
  });

  it('an admin deletes a leave of a deactivated requester → 204, snapshot', async () => {
    const owner = await seedUser(ctx().app, { active: false });
    const leave = await seedLeave(ctx().app, {
      requester: owner,
      state: LeaveState.APPROVED,
    });
    const { user: admin, headers } = await caller({ isAdmin: true });
    expect((await del(leave.id, headers)).status).toBe(204);
    expect(await leavesOf(ctx()).exists({ id: leave.id })).toBeNull();
    const entries = await auditOf(ctx()).find({ targetId: leave.id }).lean();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorId: admin.id,
      action: 'LEAVE_DELETED',
      details: { before: { requesterId: owner.id, state: 'APPROVED' } },
    });
  });

  it('an admin deletes a leave of an anonymized requester → 204, snapshot', async () => {
    const owner = await seedUser(ctx().app, { active: false });
    await ctx()
      .app.get<Model<User>>(getModelToken(User.name))
      .updateOne(
        { id: owner.id },
        {
          anonymizedAt: ctx().clock.now(),
          firstName: 'Anonymized',
          surname: 'User',
          email: `anonymized-${owner.id}@invalid.instea.co`,
        },
      );
    const leave = await seedLeave(ctx().app, { requester: owner });
    const { user: admin, headers } = await caller({ isAdmin: true });
    expect((await del(leave.id, headers)).status).toBe(204);
    expect(await leavesOf(ctx()).exists({ id: leave.id })).toBeNull();
    const entries = await auditOf(ctx()).find({ targetId: leave.id }).lean();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorId: admin.id,
      action: 'LEAVE_DELETED',
      details: { before: { requesterId: owner.id, state: 'PENDING' } },
    });
  });

  it('unknown id → 404 LEAVE_NOT_FOUND, also for a non-owner (404 before 403)', async () => {
    const { headers } = await caller();
    for (const id of ['00000000-0000-4000-8000-000000000000', 'not-a-uuid']) {
      const res = await del(id, headers);
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ code: ErrorCode.LEAVE_NOT_FOUND });
    }
  });

  it('no session → 401 AUTH_REQUIRED; deactivated owner → 401 USER_DEACTIVATED; m2m → 401', async () => {
    const owner = await seedUser(ctx().app);
    const leave = await seedLeave(ctx().app, { requester: owner });

    const anon = await del(leave.id);
    expect(anon.status).toBe(401);
    expect(anon.body).toMatchObject({ code: ErrorCode.AUTH_REQUIRED });

    // The owner's session from before the deactivation.
    const { accessToken } = await startSession(ctx().app, owner);
    await ctx()
      .app.get<Model<User>>(getModelToken(User.name))
      .updateOne(
        { id: owner.id },
        { active: false, deactivatedAt: new Date() },
      );
    const deactivated = await del(leave.id, {
      Authorization: `Bearer ${accessToken}`,
    });
    expect(deactivated.status).toBe(401);
    expect(deactivated.body).toMatchObject({
      code: ErrorCode.USER_DEACTIVATED,
    });

    const m2m = await del(leave.id, { Authorization: m2mAuth() });
    expect(m2m.status).toBe(401);
    expect(m2m.body).toMatchObject({ code: ErrorCode.AUTH_REQUIRED });

    await expectUntouched(leave.id);
  });

  it('sends no email', async () => {
    const send = vi.spyOn(ctx().app.get(MailService), 'send');
    const { user, headers } = await caller();
    const leave = await seedLeave(ctx().app, { requester: user });
    expect((await del(leave.id, headers)).status).toBe(204);
    expect(send).not.toHaveBeenCalled();
  });

  it('audit insert fails → 500 INTERNAL_ERROR and the leave is not deleted (NFR-06)', async () => {
    const { user, headers } = await caller();
    const leave = await seedLeave(ctx().app, { requester: user });
    vi.spyOn(auditOf(ctx()), 'create').mockRejectedValueOnce(
      new Error('forced audit failure'),
    );
    const res = await del(leave.id, headers);
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ code: ErrorCode.INTERNAL_ERROR });
    await expectUntouched(leave.id);
  });
});
