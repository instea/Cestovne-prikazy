import { setTimeout as sleep } from 'node:timers/promises';
import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import type { LeaveDto } from '@leaves/shared/dto';
import { ErrorCode } from '@leaves/shared/enums';
import { LeaveState, LeaveType } from '@leaves/shared/leaves';
import type { Model } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuditLog } from '../../src/audit/audit-log.schema';
import { Leave } from '../../src/leaves/leave.schema';
import {
  MAIL_TRANSPORT,
  MailService,
  type MailTransport,
} from '../../src/mail/mail.service';
import { LeaveNotificationsService } from '../../src/notifications/leave-notifications.service';
import { User } from '../../src/users/user.schema';
import { type TestApp, useTestApp } from '../support/app';
import { loginAs, startSession } from '../support/auth';
import { mailbox, uniqueAddress } from '../support/mailbox';
import { m2mAuth } from '../support/m2m';
import { seedLeave, seedUser, type SeedUserOptions } from '../support/seed';

/**
 * APR-01 `POST /api/leaves/:id/approve|reject` against MongoDB 8 and the
 * run's Mailpit: permission table, transition table (incl. same state),
 * approverId overwrite, audit entry (NFR-06) and the requester email
 * (NOT-03), which never fails the request.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

const leavesOf = (ctx: TestApp) =>
  ctx.app.get<Model<Leave>>(getModelToken(Leave.name));
const auditOf = (ctx: TestApp) =>
  ctx.app.get<Model<AuditLog>>(getModelToken(AuditLog.name));

type Action = 'approve' | 'reject';
const NEW_STATE = {
  approve: LeaveState.APPROVED,
  reject: LeaveState.REJECTED,
} as const;
const AUDIT_ACTION = {
  approve: 'LEAVE_APPROVED',
  reject: 'LEAVE_REJECTED',
} as const;

/** Waits for in-flight sends and lets Mailpit index what arrived. */
async function settle(ctx: TestApp): Promise<void> {
  await ctx.app.get(MailService).idle();
  await sleep(300);
}

function helpers(ctx: () => TestApp) {
  async function caller(options: SeedUserOptions = {}) {
    const user = await seedUser(ctx().app, options);
    const { accessToken } =
      options.active === false
        ? await startSession(ctx().app, user)
        : await loginAs(ctx().app, user);
    return { user, headers: { Authorization: `Bearer ${accessToken}` } };
  }
  const decide = (
    action: Action,
    id: string,
    headers: Record<string, string> = {},
  ) => ctx().request().post(`/api/leaves/${id}/${action}`).set(headers);
  return { caller, decide };
}

describe('POST /api/leaves/:id/approve|reject (APR-01)', () => {
  const ctx = useTestApp();
  const { caller, decide } = helpers(ctx);

  describe.each([
    [LeaveState.PENDING, 'approve'],
    [LeaveState.PENDING, 'reject'],
    [LeaveState.APPROVED, 'approve'],
    [LeaveState.APPROVED, 'reject'],
    [LeaveState.REJECTED, 'approve'],
    [LeaveState.REJECTED, 'reject'],
  ] as const)('%s → %s', (previous, action) => {
    it(`200 ${NEW_STATE[action]}, approver = caller, audit entry, nothing else changed`, async () => {
      ctx().clock.set('2026-11-10T08:00:00.000Z');
      const requester = await seedUser(ctx().app, {
        firstName: 'Jana',
        surname: 'Nová',
      });
      const earlier = await seedUser(ctx().app, { isAdmin: true });
      const leave = await seedLeave(ctx().app, {
        requester,
        approver: previous === LeaveState.PENDING ? null : earlier,
        startDate: '2026-12-21',
        endDate: '2026-12-23',
        type: LeaveType.SICKNESS,
        state: previous,
      });
      const { user: admin, headers } = await caller({
        isAdmin: true,
        firstName: 'Peter',
        surname: 'Admin',
      });

      const res = await decide(action, leave.id, headers).send({
        state: 'PENDING',
        approverId: 'someone-else',
      }); // any body is ignored
      expect(res.status).toBe(200);
      const dto = res.body as LeaveDto;
      expect(dto).toEqual({
        id: leave.id,
        requester: {
          id: requester.id,
          firstName: 'Jana',
          surname: 'Nová',
          active: true,
          anonymized: false,
        },
        approver: {
          id: admin.id,
          firstName: 'Peter',
          surname: 'Admin',
          active: true,
          anonymized: false,
        },
        startDate: '2026-12-21',
        endDate: '2026-12-23',
        isHalfDay: false,
        type: 'SICKNESS',
        state: NEW_STATE[action],
        numDays: 3,
        createdAt: leave.createdAt.toISOString(),
        updatedAt: expect.any(String) as string,
      });
      expect(Object.keys(dto.requester!)).not.toContain('email');

      const stored = await leavesOf(ctx()).findOne({ id: leave.id }).lean();
      expect(stored).toMatchObject({
        requesterId: requester.id,
        approverId: admin.id,
        state: NEW_STATE[action],
        startDate: '2026-12-21',
        endDate: '2026-12-23',
        isHalfDay: false,
        type: 'SICKNESS',
        numDays: 3,
      });
      expect(stored!.createdAt).toEqual(leave.createdAt);
      expect(stored!.updatedAt.toISOString()).toBe(dto.updatedAt);
      expect(stored!.updatedAt.getTime()).toBeGreaterThanOrEqual(
        leave.updatedAt.getTime(),
      );

      const entries = await auditOf(ctx()).find({ targetId: leave.id }).lean();
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        at: new Date('2026-11-10T08:00:00.000Z'),
        actorType: 'user',
        actorId: admin.id,
        action: AUDIT_ACTION[action],
        targetType: 'LEAVE',
        targetId: leave.id,
      });
      expect(entries[0]!.details).toStrictEqual({
        previousState: previous,
        newState: NEW_STATE[action],
        previousApproverId: previous === LeaveState.PENDING ? null : earlier.id,
      });
    });
  });

  it('admin B re-approves a leave approved by admin A: approver = B, second entry', async () => {
    const requester = await seedUser(ctx().app);
    const leave = await seedLeave(ctx().app, { requester });
    const a = await caller({ isAdmin: true });
    const b = await caller({ isAdmin: true });
    expect((await decide('approve', leave.id, a.headers)).status).toBe(200);
    const res = await decide('approve', leave.id, b.headers);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      state: 'APPROVED',
      approver: { id: b.user.id },
    });
    const entries = await auditOf(ctx())
      .find({ targetId: leave.id })
      .sort({ _id: 1 })
      .lean();
    expect(entries.map((e) => [e.actorId, e.details])).toEqual([
      [
        a.user.id,
        {
          previousState: 'PENDING',
          newState: 'APPROVED',
          previousApproverId: null,
        },
      ],
      [
        b.user.id,
        {
          previousState: 'APPROVED',
          newState: 'APPROVED',
          previousApproverId: a.user.id,
        },
      ],
    ]);
  });

  it('an admin approves their own PENDING leave → 200', async () => {
    const { user: admin, headers } = await caller({ isAdmin: true });
    const leave = await seedLeave(ctx().app, { requester: admin });
    const res = await decide('approve', leave.id, headers);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      state: 'APPROVED',
      requester: { id: admin.id },
      approver: { id: admin.id },
    });
  });

  it('an admin rejects their own PENDING leave → 200, approver = self, audit entry', async () => {
    const { user: admin, headers } = await caller({ isAdmin: true });
    const leave = await seedLeave(ctx().app, { requester: admin });
    const res = await decide('reject', leave.id, headers);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      state: 'REJECTED',
      requester: { id: admin.id },
      approver: { id: admin.id },
    });
    expect(
      await leavesOf(ctx()).findOne({ id: leave.id }).lean(),
    ).toMatchObject({ state: 'REJECTED', approverId: admin.id });
    const entries = await auditOf(ctx()).find({ targetId: leave.id }).lean();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorId: admin.id,
      action: AUDIT_ACTION.reject,
    });
  });

  it.each(['approve', 'reject'] as const)(
    '%s: unknown or malformed id → 404 LEAVE_NOT_FOUND for an admin',
    async (action) => {
      const { headers } = await caller({ isAdmin: true });
      for (const id of [
        '00000000-0000-4000-8000-000000000000',
        'not-a-uuid',
        '%24ne',
      ]) {
        const res = await decide(action, id, headers);
        expect(res.status).toBe(404);
        expect(res.body).toEqual({
          statusCode: 404,
          code: ErrorCode.LEAVE_NOT_FOUND,
          message: 'Leave not found',
        });
      }
    },
  );

  it.each(['approve', 'reject'] as const)(
    '%s as a non-admin → 403 FORBIDDEN (own, other and unknown leave); nothing changes',
    async (action) => {
      const { user, headers } = await caller();
      const other = await seedUser(ctx().app);
      const own = await seedLeave(ctx().app, { requester: user });
      const others = await seedLeave(ctx().app, { requester: other });
      for (const id of [own.id, others.id, 'no-such-leave']) {
        const res = await decide(action, id, headers);
        expect(res.status).toBe(403);
        expect(res.body).toEqual({
          statusCode: 403,
          code: ErrorCode.FORBIDDEN,
          message: 'Admin role required',
        });
      }
      for (const leave of [own, others]) {
        expect(
          await leavesOf(ctx()).findOne({ id: leave.id }).lean(),
        ).toMatchObject({ state: 'PENDING', approverId: null });
        expect(
          await auditOf(ctx()).countDocuments({ targetId: leave.id }),
        ).toBe(0);
      }
    },
  );

  it('no session → 401 AUTH_REQUIRED; deactivated admin → 401 USER_DEACTIVATED; m2m → 401', async () => {
    const leave = await seedLeave(ctx().app, {
      requester: await seedUser(ctx().app),
    });
    const anon = await decide('approve', leave.id);
    expect(anon.status).toBe(401);
    expect(anon.body).toMatchObject({ code: ErrorCode.AUTH_REQUIRED });

    const { headers } = await caller({ isAdmin: true, active: false });
    const deactivated = await decide('reject', leave.id, headers);
    expect(deactivated.status).toBe(401);
    expect(deactivated.body).toMatchObject({
      code: ErrorCode.USER_DEACTIVATED,
    });

    const m2m = await decide('approve', leave.id, {
      Authorization: m2mAuth(),
    });
    expect(m2m.status).toBe(401);
    expect(m2m.body).toMatchObject({ code: ErrorCode.AUTH_REQUIRED });

    expect(
      await leavesOf(ctx()).findOne({ id: leave.id }).lean(),
    ).toMatchObject({ state: 'PENDING', approverId: null });
  });

  it('calls the NOT-03 notifier with previous / new state, requester and admin', async () => {
    const leaveDecided = vi.spyOn(
      ctx().app.get(LeaveNotificationsService),
      'leaveDecided',
    );
    const requester = await seedUser(ctx().app, {
      email: uniqueAddress('requester'),
    });
    const leave = await seedLeave(ctx().app, {
      requester,
      state: LeaveState.REJECTED,
    });
    const { headers } = await caller({
      isAdmin: true,
      firstName: 'Peter',
      surname: 'Admin',
    });
    expect((await decide('approve', leave.id, headers)).status).toBe(200);
    expect(leaveDecided).toHaveBeenCalledTimes(1);
    expect(leaveDecided).toHaveBeenCalledWith(
      expect.objectContaining({
        id: leave.id,
        startDate: leave.startDate,
        endDate: leave.endDate,
        type: leave.type,
      }),
      LeaveState.REJECTED,
      LeaveState.APPROVED,
      expect.objectContaining({
        email: requester.email,
        firstName: requester.firstName,
        surname: requester.surname,
        active: true,
        anonymizedAt: null,
      }),
      { firstName: 'Peter', surname: 'Admin' },
    );
  });

  it('a throwing mail service never changes the 200', async () => {
    vi.spyOn(ctx().app.get(MailService), 'send').mockImplementation(() => {
      throw new Error('mail exploded');
    });
    const error = vi.spyOn(Logger.prototype, 'error');
    const leave = await seedLeave(ctx().app, {
      requester: await seedUser(ctx().app),
    });
    const { headers } = await caller({ isAdmin: true });
    const res = await decide('approve', leave.id, headers);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ state: 'APPROVED' });
    expect(error).toHaveBeenCalledWith('Email not sent: mail exploded');
  });

  it('audit insert fails → 500 INTERNAL_ERROR, leave unchanged, no email (NFR-06)', async () => {
    const send = vi.spyOn(ctx().app.get(MailService), 'send');
    const leave = await seedLeave(ctx().app, {
      requester: await seedUser(ctx().app),
    });
    const { headers } = await caller({ isAdmin: true });
    vi.spyOn(auditOf(ctx()), 'create').mockRejectedValueOnce(
      new Error('forced audit failure'),
    );
    const res = await decide('approve', leave.id, headers);
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ code: ErrorCode.INTERNAL_ERROR });
    expect(
      await leavesOf(ctx()).findOne({ id: leave.id }).lean(),
    ).toMatchObject({ state: 'PENDING', approverId: null });
    expect(await auditOf(ctx()).countDocuments({ targetId: leave.id })).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('APR-01 decision emails via Mailpit (NOT-03)', () => {
  const ctx = useTestApp({ env: { BASE_URL: 'https://cestaky.example.test' } });
  const { caller, decide } = helpers(ctx);

  async function requesterLeave(
    state: LeaveState,
    options: SeedUserOptions = {},
  ) {
    const email = uniqueAddress('requester');
    const requester = await seedUser(ctx().app, { email, ...options });
    const leave = await seedLeave(ctx().app, {
      requester,
      state,
      startDate: '2026-12-21',
      endDate: '2026-12-23',
    });
    return { email, leave, requester };
  }

  const admin = () =>
    caller({ isAdmin: true, firstName: 'Peter', surname: 'Admin' });

  it('approve PENDING → one approved email to the requester', async () => {
    const { email, leave } = await requesterLeave(LeaveState.PENDING);
    const { headers } = await admin();
    expect((await decide('approve', leave.id, headers)).status).toBe(200);
    const msg = await mailbox.waitFor({
      to: email,
      subject: 'Your leave was approved',
    });
    expect(msg.HTML).toContain(
      'Monday, Dec 21, 2026 - Wednesday, Dec 23, 2026',
    );
    expect(msg.HTML).toContain('<b>Approved by: </b>Peter Admin<br>');
    expect(msg.HTML).toContain(
      '<a href="https://cestaky.example.test/leaves">Open leaves</a>',
    );
    await settle(ctx());
    expect(await mailbox.search({ to: email })).toHaveLength(1);
  });

  it('reject PENDING → one rejected email', async () => {
    const { email, leave } = await requesterLeave(LeaveState.PENDING);
    const { headers } = await admin();
    expect((await decide('reject', leave.id, headers)).status).toBe(200);
    const msg = await mailbox.waitFor({
      to: email,
      subject: 'Your leave was rejected',
    });
    expect(msg.HTML).toContain('<b>Rejected by: </b>Peter Admin<br>');
    await settle(ctx());
    expect(await mailbox.search({ to: email })).toHaveLength(1);
  });

  it('REJECTED → approve → one approved email', async () => {
    const { email, leave } = await requesterLeave(LeaveState.REJECTED);
    const { headers } = await admin();
    expect((await decide('approve', leave.id, headers)).status).toBe(200);
    await mailbox.waitFor({ to: email, subject: 'Your leave was approved' });
    await settle(ctx());
    expect(await mailbox.search({ to: email })).toHaveLength(1);
  });

  it('re-approve an APPROVED leave / re-reject a REJECTED one → no email', async () => {
    const approved = await requesterLeave(LeaveState.APPROVED);
    const rejected = await requesterLeave(LeaveState.REJECTED);
    const { headers } = await admin();
    expect((await decide('approve', approved.leave.id, headers)).status).toBe(
      200,
    );
    expect((await decide('reject', rejected.leave.id, headers)).status).toBe(
      200,
    );
    await settle(ctx());
    expect(await mailbox.search({ to: approved.email })).toEqual([]);
    expect(await mailbox.search({ to: rejected.email })).toEqual([]);
  });

  it('deactivated requester → 200, no email, info line', async () => {
    const info = vi.spyOn(Logger.prototype, 'log');
    const { email, leave } = await requesterLeave(LeaveState.PENDING, {
      active: false,
    });
    const { headers } = await admin();
    expect((await decide('approve', leave.id, headers)).status).toBe(200);
    await settle(ctx());
    expect(await mailbox.search({ to: email })).toEqual([]);
    expect(info).toHaveBeenCalledWith(
      `Email not sent: requester inactive (template=leave-approved, leaveId=${leave.id})`,
    );
  });

  it('anonymized requester → 200, no email', async () => {
    const { email, leave, requester } = await requesterLeave(
      LeaveState.PENDING,
    );
    await ctx()
      .app.get<Model<User>>(getModelToken(User.name))
      .updateOne({ id: requester.id }, { anonymizedAt: new Date() });
    const { headers } = await admin();
    expect((await decide('reject', leave.id, headers)).status).toBe(200);
    await settle(ctx());
    expect(await mailbox.search({ to: email })).toEqual([]);
  });
});

describe('APR-01 with the SMTP server down', () => {
  const failing: MailTransport = {
    sendMail: () => Promise.reject(new Error('connect ECONNREFUSED')),
    close: () => undefined,
  };
  const ctx = useTestApp({
    override: (b) => b.overrideProvider(MAIL_TRANSPORT).useValue(failing),
  });
  const { caller, decide } = helpers(ctx);

  it('still answers 200 and logs the error', async () => {
    const error = vi.spyOn(Logger.prototype, 'error');
    const leave = await seedLeave(ctx().app, {
      requester: await seedUser(ctx().app),
    });
    const { headers } = await caller({ isAdmin: true });
    const res = await decide('approve', leave.id, headers);
    expect(res.status).toBe(200);
    await ctx().app.get(MailService).idle();
    expect(error).toHaveBeenCalledWith(
      `Email failed (template=leave-approved, leaveId=${leave.id}): connect ECONNREFUSED`,
    );
    expect(
      await leavesOf(ctx()).findOne({ id: leave.id }).lean(),
    ).toMatchObject({ state: 'APPROVED' });
  });
});

describe('APR-01 with SMTP not configured', () => {
  const ctx = useTestApp({ env: { SMTP_PASSWORD: '' } });
  const { caller, decide } = helpers(ctx);

  it('200 and the NOT-01 warn line', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn');
    const leave = await seedLeave(ctx().app, {
      requester: await seedUser(ctx().app),
    });
    const { headers } = await caller({ isAdmin: true });
    expect((await decide('reject', leave.id, headers)).status).toBe(200);
    await ctx().app.get(MailService).idle();
    expect(warn).toHaveBeenCalledWith(
      `Email not sent: SMTP is not configured (template=leave-rejected, leaveId=${leave.id})`,
    );
  });
});
