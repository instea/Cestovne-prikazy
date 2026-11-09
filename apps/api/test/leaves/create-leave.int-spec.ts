import { setTimeout as sleep } from 'node:timers/promises';
import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import type { LeaveDto } from '@leaves/shared/dto';
import { ErrorCode } from '@leaves/shared/enums';
import type { Model } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuditLog } from '../../src/audit/audit-log.schema';
import { Leave } from '../../src/leaves/leave.schema';
import {
  MAIL_TRANSPORT,
  MailService,
  type MailTransport,
} from '../../src/mail/mail.service';
import { type TestApp, useTestApp } from '../support/app';
import { loginAs, startSession } from '../support/auth';
import { mailbox, uniqueAddress } from '../support/mailbox';
import { m2mAuth } from '../support/m2m';
import { seedUser } from '../support/seed';

/**
 * LV-01 `POST /api/leaves` against MongoDB 8 and the run's Mailpit:
 * validation, stored document, audit entry (NFR-06) and the new-leave email
 * (NOT-02), which never fails the request.
 */

const body = {
  startDate: '2026-11-09',
  endDate: '2026-11-13',
  type: 'ANNUAL',
  isHalfDay: false,
};

afterEach(() => {
  vi.restoreAllMocks();
});

const leavesOf = (ctx: TestApp) =>
  ctx.app.get<Model<Leave>>(getModelToken(Leave.name));
const auditOf = (ctx: TestApp) =>
  ctx.app.get<Model<AuditLog>>(getModelToken(AuditLog.name));

/** Waits for in-flight sends and lets Mailpit index what arrived. */
async function settle(ctx: TestApp): Promise<void> {
  await ctx.app.get(MailService).idle();
  await sleep(300);
}

/** Bearer header of a fresh active user (registered by the real login). */
async function bearer(
  ctx: TestApp,
  user = { firstName: 'Jana', surname: 'Nová' },
): Promise<{ headers: Record<string, string>; id: string }> {
  const seeded = await seedUser(ctx.app, user);
  const { accessToken } = await loginAs(ctx.app, seeded);
  return {
    headers: { Authorization: `Bearer ${accessToken}` },
    id: seeded.id,
  };
}

describe('POST /api/leaves (LV-01)', () => {
  const approver = uniqueAddress('approver');
  const ctx = useTestApp({ env: { APPROVAL_MAIL_RECEIVER: approver } });

  const post = (headers: Record<string, string>, payload: unknown = body) =>
    ctx()
      .request()
      .post('/api/leaves')
      .set(headers)
      .send(payload as object);

  /** No leave, audit entry or email was added by `run`. */
  async function expectNothingWritten(run: () => Promise<void>) {
    await settle(ctx()); // emails of earlier tests are indexed first
    const leaves = await leavesOf(ctx()).countDocuments();
    const entries = await auditOf(ctx()).countDocuments();
    const mails = (await mailbox.search({ to: approver })).length;
    await run();
    await settle(ctx());
    expect(await leavesOf(ctx()).countDocuments()).toBe(leaves);
    expect(await auditOf(ctx()).countDocuments()).toBe(entries);
    expect(await mailbox.search({ to: approver })).toHaveLength(mails);
  }

  it('201: PENDING, requester = caller, numDays 5; stored, audited and mailed', async () => {
    ctx().clock.set('2026-11-04T09:12:00.000Z');
    const { headers, id } = await bearer(ctx());
    const res = await post(headers);
    expect(res.status).toBe(201);
    const dto = res.body as LeaveDto;
    expect(dto).toEqual({
      id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ) as string,
      requester: {
        id,
        firstName: 'Jana',
        surname: 'Nová',
        active: true,
        anonymized: false,
      },
      approver: null,
      startDate: '2026-11-09',
      endDate: '2026-11-13',
      isHalfDay: false,
      type: 'ANNUAL',
      state: 'PENDING',
      numDays: 5,
      // Mongoose timestamps (wall clock, not the app Clock).
      createdAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT.*Z$/) as string,
      updatedAt: expect.any(String) as string,
    });
    expect(dto.updatedAt).toBe(dto.createdAt);

    // The stored document equals the response.
    const stored = await leavesOf(ctx()).findOne({ id: dto.id }).lean();
    expect(stored).toMatchObject({
      id: dto.id,
      requesterId: id,
      approverId: null,
      startDate: dto.startDate,
      endDate: dto.endDate,
      isHalfDay: dto.isHalfDay,
      type: dto.type,
      state: dto.state,
      numDays: dto.numDays,
    });
    expect(stored!.createdAt.toISOString()).toBe(dto.createdAt);
    expect(stored!.updatedAt.toISOString()).toBe(dto.updatedAt);

    // One LEAVE_CREATED entry with the snapshot of the stored leave.
    const entries = await auditOf(ctx()).find({ targetId: dto.id }).lean();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      at: new Date('2026-11-04T09:12:00.000Z'),
      actorType: 'user',
      actorId: id,
      action: 'LEAVE_CREATED',
      targetType: 'LEAVE',
      targetId: dto.id,
    });
    expect(entries[0]!.details).toEqual({
      after: {
        id: dto.id,
        requesterId: id,
        approverId: null,
        startDate: '2026-11-09',
        endDate: '2026-11-13',
        isHalfDay: false,
        type: 'ANNUAL',
        state: 'PENDING',
        numDays: 5,
      },
    });

    // One email to APPROVAL_MAIL_RECEIVER (NOT-02).
    const msg = await mailbox.waitFor({
      to: approver,
      subject: 'New leave notification',
    });
    expect(msg.To.map((a) => a.Address)).toEqual([approver]);
    expect(msg.HTML).toContain('<b>Requester: </b> Jana Nová<br>');
    expect(msg.HTML).toContain('Monday, Nov 9, 2026 - Friday, Nov 13, 2026');
    expect(msg.HTML).toContain('<b>Type: </b>Annual leave<br>');
    expect(msg.HTML).toContain(
      '<a href="https://cestaky.example.test/approval">Approve</a>',
    );
    await settle(ctx());
    expect(await mailbox.search({ to: approver })).toHaveLength(1);
  });

  it('endDate < startDate → 400 LEAVE_END_BEFORE_START; nothing stored, audited or mailed', async () => {
    const { headers } = await bearer(ctx());
    await expectNothingWritten(async () => {
      const res = await post(headers, {
        ...body,
        startDate: '2026-11-13',
        endDate: '2026-11-09',
      });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        statusCode: 400,
        code: ErrorCode.LEAVE_END_BEFORE_START,
        message: 'Start date must not be greater than end date',
      });
    });
  });

  it('a multi-day half-day → 400 LEAVE_HALF_DAY_MULTIPLE_DAYS', async () => {
    const { headers } = await bearer(ctx());
    await expectNothingWritten(async () => {
      const res = await post(headers, { ...body, isHalfDay: true });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        statusCode: 400,
        code: ErrorCode.LEAVE_HALF_DAY_MULTIPLE_DAYS,
        message: 'Half day option is allowed only within single day',
      });
    });
  });

  it('both rules fail → LEAVE_END_BEFORE_START wins', async () => {
    const { headers } = await bearer(ctx());
    const res = await post(headers, {
      ...body,
      startDate: '2026-11-13',
      endDate: '2026-11-09',
      isHalfDay: true,
    });
    expect(res.body).toMatchObject({ code: ErrorCode.LEAVE_END_BEFORE_START });
  });

  it('a half-day on one working day → numDays 0.5', async () => {
    const { headers } = await bearer(ctx());
    const res = await post(headers, {
      startDate: '2026-11-04',
      endDate: '2026-11-04',
      isHalfDay: true,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ isHalfDay: true, numDays: 0.5 });
  });

  it('a weekend (2026-11-07 → 2026-11-08) → 201, numDays 0', async () => {
    const { headers } = await bearer(ctx());
    const res = await post(headers, {
      ...body,
      startDate: '2026-11-07',
      endDate: '2026-11-08',
    });
    expect(res.status).toBe(201);
    expect((res.body as LeaveDto).numDays).toBe(0);
  });

  it.each([
    ['numDays: 99', { numDays: 99 }],
    ['state: "APPROVED"', { state: 'APPROVED' }],
    ['requesterId', { requesterId: 'someone-else' }],
  ])('a body with %s → 400 VALIDATION_FAILED', async (_label, extra) => {
    const { headers } = await bearer(ctx());
    await expectNothingWritten(async () => {
      const res = await post(headers, { ...body, ...extra });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
    });
  });

  it('no type → stored type ANNUAL', async () => {
    const { headers } = await bearer(ctx());
    const res = await post(headers, {
      startDate: '2026-11-09',
      endDate: '2026-11-09',
    });
    expect(res.status).toBe(201);
    const dto = res.body as LeaveDto;
    expect(dto).toMatchObject({ type: 'ANNUAL', isHalfDay: false });
    expect((await leavesOf(ctx()).findOne({ id: dto.id }).lean())?.type).toBe(
      'ANNUAL',
    );
  });

  it.each(['2026-02-30', '9.11.2026'])(
    'startDate %s → 400 VALIDATION_FAILED',
    async (startDate) => {
      const { headers } = await bearer(ctx());
      const res = await post(headers, { ...body, startDate });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        statusCode: 400,
        code: ErrorCode.VALIDATION_FAILED,
        message: 'startDate must be a date in YYYY-MM-DD format',
      });
    },
  );

  it('a 400-day range (2026-01-01 → 2027-02-04) → 201', async () => {
    const { headers } = await bearer(ctx());
    const res = await post(headers, {
      ...body,
      startDate: '2026-01-01',
      endDate: '2027-02-04',
    });
    expect(res.status).toBe(201);
    expect((res.body as LeaveDto).numDays).toBeGreaterThan(250);
  });

  it('an admin creates a leave for themselves only', async () => {
    const admin = await seedUser(ctx().app, { isAdmin: true });
    const { accessToken } = await loginAs(ctx().app, admin);
    const res = await post({ Authorization: `Bearer ${accessToken}` });
    expect(res.status).toBe(201);
    expect((res.body as LeaveDto).requester?.id).toBe(admin.id);
  });

  it('no session → 401 AUTH_REQUIRED; deactivated → 401 USER_DEACTIVATED; m2m → 401 AUTH_REQUIRED', async () => {
    await expectNothingWritten(async () => {
      const anon = await post({});
      expect(anon.status).toBe(401);
      expect(anon.body).toMatchObject({ code: ErrorCode.AUTH_REQUIRED });

      const gone = await seedUser(ctx().app, { active: false });
      const { accessToken } = await startSession(ctx().app, gone);
      const deactivated = await post({
        Authorization: `Bearer ${accessToken}`,
      });
      expect(deactivated.status).toBe(401);
      expect(deactivated.body).toMatchObject({
        code: ErrorCode.USER_DEACTIVATED,
      });

      const m2m = await post({ Authorization: m2mAuth() });
      expect(m2m.status).toBe(401);
      expect(m2m.body).toMatchObject({ code: ErrorCode.AUTH_REQUIRED });
    });
  });

  it('audit insert fails → 500 INTERNAL_ERROR, no leave, no email (NFR-06)', async () => {
    const { headers } = await bearer(ctx());
    vi.spyOn(auditOf(ctx()), 'create').mockRejectedValueOnce(
      new Error('forced audit failure'),
    );
    await expectNothingWritten(async () => {
      const res = await post(headers);
      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ code: ErrorCode.INTERNAL_ERROR });
    });
  });
});

describe('POST /api/leaves with the SMTP server down (LV-01)', () => {
  const failing: MailTransport = {
    sendMail: () => Promise.reject(new Error('connect ECONNREFUSED')),
    close: () => undefined,
  };
  const ctx = useTestApp({
    override: (b) => b.overrideProvider(MAIL_TRANSPORT).useValue(failing),
  });

  it('still answers 201 and logs the error', async () => {
    const error = vi.spyOn(Logger.prototype, 'error');
    const { headers } = await bearer(ctx());
    const res = await ctx()
      .request()
      .post('/api/leaves')
      .set(headers)
      .send(body);
    expect(res.status).toBe(201);
    const id = (res.body as LeaveDto).id;
    await ctx().app.get(MailService).idle();
    expect(error).toHaveBeenCalledWith(
      `Email failed (template=leave-created, leaveId=${id}): connect ECONNREFUSED`,
    );
    expect(await leavesOf(ctx()).exists({ id })).toBeTruthy();
  });
});

describe('POST /api/leaves with SMTP not configured (LV-01)', () => {
  const approver = uniqueAddress('approver');
  const ctx = useTestApp({
    env: { APPROVAL_MAIL_RECEIVER: approver, SMTP_PASSWORD: '' },
  });

  it('201, no email, and the NOT-01 warn line', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn');
    const { headers } = await bearer(ctx());
    const res = await ctx()
      .request()
      .post('/api/leaves')
      .set(headers)
      .send(body);
    expect(res.status).toBe(201);
    const id = (res.body as LeaveDto).id;
    await settle(ctx());
    expect(warn).toHaveBeenCalledWith(
      `Email not sent: SMTP is not configured (template=leave-created, leaveId=${id})`,
    );
    expect(await mailbox.search({ to: approver })).toEqual([]);
  });
});
