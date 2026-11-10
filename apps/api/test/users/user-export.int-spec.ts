import { getModelToken } from '@nestjs/mongoose';
import { ErrorCode } from '@leaves/shared/enums';
import { LeaveState, LeaveType } from '@leaves/shared/leaves';
import type { Model } from 'mongoose';
import type { Response } from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuditLog } from '../../src/audit/audit-log.schema';
import { leaveSnapshot } from '../../src/audit/audit-details';
import type { Leave } from '../../src/leaves/leave.schema';
import type {
  ExportAuditEntry,
  UserExportFile,
} from '../../src/users/user-export';
import { User } from '../../src/users/user.schema';
import { useTestApp } from '../support/app';
import { loginAs, startSession } from '../support/auth';
import { seedLeave, seedUser } from '../support/seed';

/** NFR-07 `GET /api/admin/users/:id/export`. */

const ctx = useTestApp();

const Users = () => ctx().app.get<Model<User>>(getModelToken(User.name));
const Entries = () =>
  ctx().app.get<Model<AuditLog>>(getModelToken(AuditLog.name));

const SECOND = 1000;

const bearer = async (user: User) =>
  `Bearer ${(await loginAs(ctx().app, user)).accessToken}`;

const exportOf = (id: string, auth?: string) => {
  const req = ctx().request().get(`/api/admin/users/${id}/export`);
  return auth ? req.set('Authorization', auth) : req;
};

const errorBody = (statusCode: number, code: string) => ({
  statusCode,
  code,
  message: expect.any(String) as string,
});

/** A raw audit entry, as LV-03 / APR-01 write them (not on this branch). */
async function writeEntry(
  entry: Omit<AuditLog, 'id' | 'at'>,
): Promise<AuditLog> {
  const doc = await Entries().create({ ...entry, at: ctx().clock.now() });
  return doc.toObject();
}

describe('GDPR export (NFR-07)', () => {
  let admin: User;
  let adminAuth: string;
  let u: User;
  let v: User;
  let own1: Leave; // approved by the admin
  let own2Id: string; // created through the API
  let selfApproved: Leave; // requester = approver = U
  let decided: Leave; // V's leave, approved by U
  let res: Response;
  let file: UserExportFile;
  let ids: Record<string, string>;

  beforeAll(async () => {
    admin = await seedUser(ctx().app, {
      isAdmin: true,
      firstName: 'Alena',
      surname: 'Adminová',
    });
    adminAuth = await bearer(admin);
    // U is an admin too, so U can edit V (redaction case) and approve.
    u = await seedUser(ctx().app, {
      isAdmin: true,
      firstName: 'Peter',
      surname: 'Kráľ',
      email: 'peter.kral@instea.co',
    });
    const uAuth = await bearer(u);
    v = await seedUser(ctx().app, { firstName: 'Viera', surname: 'Iná' });
    const vAuth = await bearer(v);
    ids = {};
    const tick = () => ctx().clock.advance(SECOND);

    // Leaves.
    own1 = await seedLeave(ctx().app, {
      requester: u,
      approver: admin,
      startDate: '2026-07-01',
      endDate: '2026-07-03',
      state: LeaveState.APPROVED,
    });
    selfApproved = await seedLeave(ctx().app, {
      requester: u,
      approver: u,
      startDate: '2026-02-02',
      state: LeaveState.APPROVED,
    });
    decided = await seedLeave(ctx().app, {
      requester: v,
      approver: u,
      startDate: '2026-03-02',
      state: LeaveState.APPROVED,
    });
    await seedLeave(ctx().app, { requester: v, startDate: '2026-04-01' });

    // 1. U creates a leave (LV-01, real endpoint → LEAVE_CREATED).
    tick();
    const created = await ctx()
      .request()
      .post('/api/leaves')
      .set('Authorization', uAuth)
      .send({ startDate: '2026-12-28', endDate: '2026-12-29' });
    expect(created.status).toBe(201);
    own2Id = (created.body as { id: string }).id;
    ids.created = (await Entries()
      .findOne({ action: 'LEAVE_CREATED', targetId: own2Id })
      .lean())!.id;

    // 2. U deleted a leave earlier (LV-03 entry: full snapshot, leave gone).
    tick();
    const gone = {
      id: 'l-gone',
      requesterId: u.id,
      approverId: null,
      startDate: '2026-05-04',
      endDate: '2026-05-04',
      isHalfDay: false,
      type: LeaveType.SICKNESS,
      state: LeaveState.PENDING,
      numDays: 1,
    } as const;
    ids.deleted = (
      await writeEntry({
        actorType: 'user',
        actorId: u.id,
        action: 'LEAVE_DELETED',
        targetType: 'LEAVE',
        targetId: gone.id,
        details: { before: leaveSnapshot(gone) },
      })
    ).id;

    // 3. The admin approved U's leave (APR-01 entry: no requesterId).
    tick();
    ids.approved = (
      await writeEntry({
        actorType: 'user',
        actorId: admin.id,
        action: 'LEAVE_APPROVED',
        targetType: 'LEAVE',
        targetId: own1.id,
        details: {
          previousState: 'PENDING',
          newState: 'APPROVED',
          previousApproverId: null,
        },
      })
    ).id;

    // 4. The admin edits U's name (USR-02, real endpoint).
    tick();
    const renamed = await ctx()
      .request()
      .patch(`/api/users/${u.id}`)
      .set('Authorization', adminAuth)
      .send({ surname: 'Kráľovič' });
    expect(renamed.status).toBe(200);
    ids.renamedByAdmin = (await Entries()
      .findOne({ action: 'USER_UPDATED', targetId: u.id })
      .lean())!.id;

    // 5. U edits V's surname (USR-02) → redacted in U's export.
    tick();
    const edited = await ctx()
      .request()
      .patch(`/api/users/${v.id}`)
      .set('Authorization', uAuth)
      .send({ surname: 'Iná-Nová' });
    expect(edited.status).toBe(200);
    ids.editedV = (await Entries()
      .findOne({ action: 'USER_UPDATED', targetId: v.id })
      .lean())!.id;

    // 6. U approved V's leave (an entry by U on another user's leave).
    tick();
    ids.decidedForV = (
      await writeEntry({
        actorType: 'user',
        actorId: u.id,
        action: 'LEAVE_APPROVED',
        targetType: 'LEAVE',
        targetId: decided.id,
        details: {
          previousState: 'PENDING',
          newState: 'APPROVED',
          previousApproverId: null,
        },
      })
    ).id;

    // Unrelated: V creates a leave, the admin renames V.
    tick();
    const vLeave = await ctx()
      .request()
      .post('/api/leaves')
      .set('Authorization', vAuth)
      .send({ startDate: '2026-12-30', endDate: '2026-12-30' });
    expect(vLeave.status).toBe(201);
    await ctx()
      .request()
      .patch(`/api/users/${v.id}`)
      .set('Authorization', adminAuth)
      .send({ firstName: 'Vierka' });

    tick();
    res = await exportOf(u.id, adminAuth);
    file = res.body as UserExportFile;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('200 with the download headers and the documented file name', () => {
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    // Clock 2026-12-21T08:00Z + a few seconds → 2026-12-21 in Bratislava.
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="user-export-${u.id}-2026-12-21.json"`,
    );
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('header fields and the full user record', () => {
    expect(file.formatVersion).toBe(1);
    expect(file.exportedAt).toBe(ctx().clock.now().toISOString());
    expect(file.exportedBy).toBe(admin.id);
    expect(file.user).toEqual({
      id: u.id,
      email: 'peter.kral@instea.co',
      firstName: 'Peter',
      surname: 'Kráľovič',
      isAdmin: true,
      active: true,
      deactivatedAt: null,
      anonymizedAt: null,
      createdAt: expect.any(String) as string,
      updatedAt: expect.any(String) as string,
    });
    expect(Object.keys(file).sort()).toEqual(
      [
        'formatVersion',
        'exportedAt',
        'exportedBy',
        'user',
        'leavesAsRequester',
        'leavesAsApprover',
        'auditEntries',
      ].sort(),
    );
  });

  it('own leaves (incl. self-approved) by startDate; decided leaves of others only as approver', () => {
    expect(file.leavesAsRequester.map((l) => l.id)).toEqual([
      selfApproved.id, // 2026-02-02
      own1.id, // 2026-07-01
      own2Id, // 2026-12-28
    ]);
    expect(file.leavesAsApprover.map((l) => l.id)).toEqual([decided.id]);
    expect(file.leavesAsRequester[1]).toEqual({
      id: own1.id,
      requesterId: u.id,
      approverId: admin.id,
      startDate: '2026-07-01',
      endDate: '2026-07-03',
      isHalfDay: false,
      type: 'ANNUAL',
      state: 'APPROVED',
      numDays: 3,
      createdAt: expect.any(String) as string,
      updatedAt: expect.any(String) as string,
    });
    // Ids only: no embedded user objects, names or emails.
    const text = JSON.stringify([
      ...file.leavesAsRequester,
      ...file.leavesAsApprover,
    ]);
    expect(text).not.toMatch(/requester"\s*:|approver"\s*:|Viera|@instea/);
  });

  it('audit entries by and about U, sorted by at, with redaction', () => {
    const byId = new Map<string, ExportAuditEntry>(
      file.auditEntries.map((e) => [e.id, e]),
    );
    expect(file.auditEntries.map((e) => e.id)).toEqual([
      ids.created,
      ids.deleted,
      ids.approved,
      ids.renamedByAdmin,
      ids.editedV,
      ids.decidedForV,
    ]);

    // Created leave (LV-01 entry with the snapshot).
    expect(byId.get(ids.created!)).toMatchObject({
      actorId: u.id,
      action: 'LEAVE_CREATED',
      targetType: 'LEAVE',
      targetId: own2Id,
      details: { after: { id: own2Id, requesterId: u.id } },
      redacted: false,
    });
    // Deleted leave: the full `details.before` snapshot.
    expect(byId.get(ids.deleted!)).toMatchObject({
      action: 'LEAVE_DELETED',
      targetId: 'l-gone',
      details: {
        before: {
          id: 'l-gone',
          requesterId: u.id,
          approverId: null,
          startDate: '2026-05-04',
          endDate: '2026-05-04',
          isHalfDay: false,
          type: 'SICKNESS',
          state: 'PENDING',
          numDays: 1,
        },
      },
      redacted: false,
    });
    // The admin approved U's leave.
    expect(byId.get(ids.approved!)).toMatchObject({
      actorId: admin.id,
      action: 'LEAVE_APPROVED',
      targetId: own1.id,
      redacted: false,
    });
    // The admin renamed U: values kept.
    expect(byId.get(ids.renamedByAdmin!)).toMatchObject({
      actorId: admin.id,
      action: 'USER_UPDATED',
      targetType: 'USER',
      targetId: u.id,
      details: { before: { surname: 'Kráľ' }, after: { surname: 'Kráľovič' } },
      redacted: false,
    });
    // U renamed V: V's data redacted, the rest kept.
    expect(byId.get(ids.editedV!)).toEqual({
      id: ids.editedV,
      at: expect.any(String) as string,
      actorType: 'user',
      actorId: u.id,
      action: 'USER_UPDATED',
      targetType: 'USER',
      targetId: v.id,
      details: null,
      redacted: true,
    });
    expect(JSON.stringify(file)).not.toContain('Iná-Nová');
    expect(byId.get(ids.decidedForV!)).toMatchObject({
      actorId: u.id,
      targetId: decided.id,
      redacted: false,
    });
  });

  it('writes one USER_DATA_EXPORTED entry (admin → user), not part of the file', async () => {
    const exported = await Entries()
      .find({ action: 'USER_DATA_EXPORTED', targetId: u.id })
      .lean();
    expect(exported).toHaveLength(1);
    expect(exported[0]).toMatchObject({
      actorType: 'user',
      actorId: admin.id,
      targetType: 'USER',
      targetId: u.id,
      details: null,
    });
    expect(
      file.auditEntries.some((e) => e.action === 'USER_DATA_EXPORTED'),
    ).toBe(false);
  });

  it('contains no refresh-token field or hash', () => {
    // U has live refresh tokens (logged in above).
    expect(res.text).not.toMatch(
      /tokenHash|refreshToken|refresh_token|familyId|revokedReason/i,
    );
  });

  it('a later export includes the earlier export entry', async () => {
    const again = await exportOf(u.id, adminAuth);
    expect(again.status).toBe(200);
    expect(
      (again.body as UserExportFile).auditEntries.filter(
        (e) => e.action === 'USER_DATA_EXPORTED',
      ),
    ).toHaveLength(1);
  });

  it('an admin may export themselves', async () => {
    const self = await exportOf(admin.id, adminAuth);
    expect(self.status).toBe(200);
    expect((self.body as UserExportFile).user.id).toBe(admin.id);
  });

  it('a deactivated / anonymized user: stored placeholder name, email and audit details as they are', async () => {
    const anon = { id: 'u-anonymized' };
    await Users().create({
      id: anon.id,
      email: 'anonymized-u-anonymized@invalid.instea.co',
      firstName: 'Anonymized',
      surname: 'User',
      active: false,
      deactivatedAt: ctx().clock.now(),
      anonymizedAt: ctx().clock.now(),
    });
    // The (NFR-08-scrubbed) registration entry as stored.
    await writeEntry({
      actorType: 'user',
      actorId: anon.id,
      action: 'USER_REGISTERED',
      targetType: 'USER',
      targetId: anon.id,
      details: {
        after: {
          email: 'anonymized-u-anonymized@invalid.instea.co',
          firstName: 'Anonymized',
          surname: 'User',
          isAdmin: false,
          active: true,
        },
      },
    });
    const r = await exportOf(anon.id, adminAuth);
    expect(r.status).toBe(200);
    const body = r.body as UserExportFile;
    expect(body.user).toMatchObject({
      email: 'anonymized-u-anonymized@invalid.instea.co',
      firstName: 'Anonymized',
      surname: 'User',
      active: false,
      anonymizedAt: ctx().clock.now().toISOString(),
    });
    expect(body.auditEntries).toHaveLength(1);
    expect(body.auditEntries[0]!.details).toMatchObject({
      after: { firstName: 'Anonymized', surname: 'User' },
    });
  });

  it('unknown id → 404 USER_NOT_FOUND, no audit entry', async () => {
    const r = await exportOf('no-such-user', adminAuth);
    expect(r.status).toBe(404);
    expect(r.body).toEqual(errorBody(404, ErrorCode.USER_NOT_FOUND));
    expect(r.headers['content-disposition']).toBeUndefined();
    expect(
      await Entries().countDocuments({
        action: 'USER_DATA_EXPORTED',
        targetId: 'no-such-user',
      }),
    ).toBe(0);
  });

  it('non-admin → 403 FORBIDDEN (also for self), no audit entry', async () => {
    const user = await seedUser(ctx().app);
    const auth = await bearer(user);
    for (const id of [u.id, user.id]) {
      const r = await exportOf(id, auth);
      expect(r.status).toBe(403);
      expect(r.body).toEqual(errorBody(403, ErrorCode.FORBIDDEN));
    }
    expect(
      await Entries().countDocuments({
        action: 'USER_DATA_EXPORTED',
        actorId: user.id,
      }),
    ).toBe(0);
  });

  it('anonymous → 401 AUTH_REQUIRED; deactivated admin → 401 USER_DEACTIVATED', async () => {
    const anon = await exportOf(u.id);
    expect(anon.status).toBe(401);
    expect(anon.body).toEqual(errorBody(401, ErrorCode.AUTH_REQUIRED));
    const d = await seedUser(ctx().app, { isAdmin: true, active: false });
    const { accessToken } = await startSession(ctx().app, d);
    const r = await exportOf(u.id, `Bearer ${accessToken}`);
    expect(r.status).toBe(401);
    expect(r.body).toEqual(errorBody(401, ErrorCode.USER_DEACTIVATED));
  });

  it('audit write failure → 500 INTERNAL_ERROR and no file', async () => {
    const before = await Entries().countDocuments({
      action: 'USER_DATA_EXPORTED',
    });
    vi.spyOn(Entries(), 'create').mockRejectedValueOnce(
      new Error('forced audit failure'),
    );
    const r = await exportOf(u.id, adminAuth);
    expect(r.status).toBe(500);
    expect(r.body).toEqual(errorBody(500, ErrorCode.INTERNAL_ERROR));
    expect(r.headers['content-disposition']).toBeUndefined();
    expect(r.text).not.toContain(u.email);
    expect(
      await Entries().countDocuments({ action: 'USER_DATA_EXPORTED' }),
    ).toBe(before);
  });
});
