import { getModelToken } from '@nestjs/mongoose';
import type { LeaveDto, UserDto } from '@leaves/shared/dto';
import { ErrorCode } from '@leaves/shared/enums';
import { LeaveState, LeaveType } from '@leaves/shared/leaves';
import { formatUserName } from '@leaves/shared/users';
import type { Model } from 'mongoose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SSO_TIMEOUT_MS } from '../../src/attendance/sso/sso.client';
import { AuditLog } from '../../src/audit/audit-log.schema';
import { AuditService } from '../../src/audit/audit.service';
import { RefreshToken } from '../../src/auth/refresh-token.schema';
import { Leave } from '../../src/leaves/leave.schema';
import type { UserExportFile } from '../../src/users/user-export';
import { User } from '../../src/users/user.schema';
import { useHttpFakes } from '../mocks/http-fakes';
import { useTestApp } from '../support/app';
import { cookieHeader, loginAs } from '../support/auth';
import { TEST_SSO } from '../support/env';
import { makeIdToken } from '../support/google';
import { m2mAuth } from '../support/m2m';
import { type SeedUserOptions, seedLeave, seedUser } from '../support/seed';

/** NFR-08 `POST /api/admin/users/:id/anonymize` (GDPR erasure). */

const fakes = useHttpFakes();
const ctx = useTestApp();

const Users = () => ctx().app.get<Model<User>>(getModelToken(User.name));
const Entries = () =>
  ctx().app.get<Model<AuditLog>>(getModelToken(AuditLog.name));
const Tokens = () =>
  ctx().app.get<Model<RefreshToken>>(getModelToken(RefreshToken.name));
const Leaves = () => ctx().app.get<Model<Leave>>(getModelToken(Leave.name));

const PLACEHOLDER_EMAIL = /^anonymized-([0-9a-f]{8})@anonymized\.invalid$/;
const SECOND = 1000;

afterEach(() => {
  vi.restoreAllMocks();
});

async function caller(
  options: SeedUserOptions = {},
): Promise<{ user: User; auth: string }> {
  const user = await seedUser(ctx().app, options);
  const { accessToken } = await loginAs(ctx().app, user);
  return { user, auth: `Bearer ${accessToken}` };
}

const anonymize = (id: string, auth: string, body?: unknown) => {
  const req = ctx()
    .request()
    .post(`/api/admin/users/${encodeURIComponent(id)}/anonymize`)
    .set('Authorization', auth);
  return body === undefined ? req : req.send(body as object);
};

const refresh = (refreshToken: string) =>
  ctx()
    .request()
    .post('/api/auth/refresh')
    .set('Cookie', cookieHeader(refreshToken));

const errorBody = (statusCode: number, code: string) => ({
  statusCode,
  code,
  message: expect.any(String) as string,
});

/** SSO meta API directory record (contract shape). */
const ssoEntry = (email: string, keys: Record<string, string> = {}) => ({
  name: 'Someone',
  email,
  keys: Object.entries(keys).map(([key, value]) => ({ key, value })),
});

const ssoCalls = () => fakes.requests.filter((r) => r.url === TEST_SSO.uri);

/** Everything anonymization may write, for "nothing changes" checks. */
async function snapshot(userId: string) {
  return {
    user: await Users().findOne({ id: userId }).lean(),
    tokens: await Tokens().find({ userId }).sort({ id: 1 }).lean(),
    entries: await Entries().find().sort({ id: 1 }).lean(),
  };
}

describe('anonymize: happy path (NFR-08)', () => {
  let admin: { user: User; auth: string };
  let p: User;
  let other: User;
  let pSessions: { accessToken: string; refreshToken: string }[];
  let ownLeave: Leave;
  let approvedByP: Leave;
  let res: Awaited<ReturnType<typeof anonymize>>;
  let entriesBefore: AuditLog[];
  let usersBefore: number;
  let anonymizedAt: Date;
  let token: string;
  let ssoCallCount: number;

  beforeAll(async () => {
    admin = await caller({ isAdmin: true, firstName: 'Alena', surname: 'A' });
    // P: an active admin absent from SSO (default fixture lists other emails).
    p = await seedUser(ctx().app, {
      isAdmin: true,
      firstName: 'Peter',
      surname: 'Kral',
      email: 'peter.kral@instea.co',
    });
    other = await seedUser(ctx().app, { firstName: 'Viera', surname: 'Iná' });
    pSessions = [await loginAs(ctx().app, p), await loginAs(ctx().app, p)];
    const otherSession = await loginAs(ctx().app, other);
    expect(otherSession.refreshToken).not.toBe('');

    ownLeave = await seedLeave(ctx().app, {
      requester: p,
      approver: admin.user,
      state: LeaveState.APPROVED,
    });
    approvedByP = await seedLeave(ctx().app, {
      requester: other,
      approver: p,
      state: LeaveState.APPROVED,
      type: LeaveType.SICKNESS,
    });

    // Earlier entries: registration (names), an admin's surname edit of P
    // through the API, P editing V (P only actor), a leave entry.
    await Entries().create({
      at: ctx().clock.now(),
      actorType: 'user',
      actorId: p.id,
      action: 'USER_REGISTERED',
      targetType: 'USER',
      targetId: p.id,
      details: {
        after: {
          email: 'peter.kral@instea.co',
          firstName: 'Peter',
          surname: 'Kral',
          isAdmin: false,
          active: true,
        },
      },
    });
    ctx().clock.advance(SECOND);
    const edit = await ctx()
      .request()
      .patch(`/api/users/${p.id}`)
      .set('Authorization', admin.auth)
      .send({ surname: 'Kráľ' });
    expect(edit.status).toBe(200);
    const pAuth = `Bearer ${pSessions[0]!.accessToken}`;
    const editOther = await ctx()
      .request()
      .patch(`/api/users/${other.id}`)
      .set('Authorization', pAuth)
      .send({ surname: 'Iná-Nová' });
    expect(editOther.status).toBe(200);
    const created = await ctx()
      .request()
      .post('/api/leaves')
      .set('Authorization', pAuth)
      .send({
        startDate: '2027-01-04',
        endDate: '2027-01-05',
        type: LeaveType.ANNUAL,
      });
    expect(created.status).toBe(201);

    entriesBefore = await Entries().find().lean();
    usersBefore = await Users().countDocuments();
    ctx().clock.advance(60 * SECOND);
    anonymizedAt = ctx().clock.now();
    fakes.requests.length = 0;

    res = await anonymize(p.id, admin.auth, {
      confirmEmail: 'peter.kral@instea.co',
    });
    ssoCallCount = ssoCalls().length;
    token = PLACEHOLDER_EMAIL.exec(
      (res.body as UserDto).email ?? '',
    )?.[1] as string;
  });

  it('200 with the updated UserDto: placeholders, inactive, no admin, anonymizedAt', () => {
    expect(res.status).toBe(200);
    expect(token).toMatch(/^[0-9a-f]{8}$/);
    expect(res.body).toEqual({
      id: p.id,
      email: `anonymized-${token}@anonymized.invalid`,
      firstName: 'Anonymized',
      surname: `User ${token}`,
      isAdmin: false,
      active: false,
      deactivatedAt: anonymizedAt.toISOString(),
      anonymizedAt: anonymizedAt.toISOString(),
      createdAt: expect.any(String) as string,
      // Mongoose timestamps use the real clock, not the app clock.
      updatedAt: expect.any(String) as string,
    });
    // Another admin's anonymization never clears that admin's cookie.
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('stores exactly those values; the id (Google sub) is unchanged', async () => {
    expect(await Users().findOne({ id: p.id }).lean()).toMatchObject({
      id: p.id,
      email: `anonymized-${token}@anonymized.invalid`,
      firstName: 'Anonymized',
      surname: `User ${token}`,
      isAdmin: false,
      active: false,
      deactivatedAt: anonymizedAt,
      anonymizedAt,
    });
    expect(await Users().countDocuments({ email: p.email })).toBe(0);
  });

  it('called SSO exactly once', () => {
    expect(ssoCallCount).toBe(1);
  });

  it("P's leaves keep requesterId / approverId", async () => {
    expect(await Leaves().findOne({ id: ownLeave.id }).lean()).toMatchObject({
      requesterId: p.id,
      approverId: admin.user.id,
      state: LeaveState.APPROVED,
    });
    expect(await Leaves().findOne({ id: approvedByP.id }).lean()).toMatchObject(
      { requesterId: other.id, approverId: p.id },
    );
    expect(await Leaves().countDocuments({ requesterId: p.id })).toBe(2);
  });

  it("revokes every refresh token of P (others' stay)", async () => {
    const tokens = await Tokens().find({ userId: p.id }).lean();
    expect(tokens).toHaveLength(2);
    for (const t of tokens) {
      expect(t).toMatchObject({
        revokedAt: anonymizedAt,
        revokedReason: 'DEACTIVATED',
      });
    }
    expect(
      await Tokens().countDocuments({ userId: other.id, revokedAt: null }),
    ).toBe(1);
  });

  it("P's browser: refresh → 401, the live access token → 401 USER_DEACTIVATED", async () => {
    for (const s of pSessions) {
      const r = await refresh(s.refreshToken);
      expect(r.status).toBe(401);
      expect(r.body).toEqual(errorBody(401, ErrorCode.USER_DEACTIVATED));
    }
    const me = await ctx()
      .request()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${pSessions[0]!.accessToken}`);
    expect(me.status).toBe(401);
    expect(me.body).toEqual(errorBody(401, ErrorCode.USER_DEACTIVATED));
  });

  it('a new Google login of the same sub → 403 USER_DEACTIVATED, no new user', async () => {
    const idToken = await makeIdToken(
      {
        sub: p.id,
        email: 'peter.kral@instea.co',
        given_name: 'Peter',
        family_name: 'Kráľ',
      },
      { now: ctx().clock.now() },
    );
    const login = await ctx()
      .request()
      .post('/api/auth/google')
      .send({ idToken });
    expect(login.status).toBe(403);
    expect(login.body).toEqual(errorBody(403, ErrorCode.USER_DEACTIVATED));
    expect(await Users().countDocuments()).toBe(usersBefore);
    expect((await Users().findOne({ id: p.id }).lean())!.email).toBe(
      `anonymized-${token}@anonymized.invalid`,
    );
  });

  it('writes one USER_ANONYMIZED entry (actor = admin)', async () => {
    const entries = await Entries()
      .find({ action: 'USER_ANONYMIZED', targetId: p.id })
      .lean();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      at: anonymizedAt,
      actorType: 'user',
      actorId: admin.user.id,
      targetType: 'USER',
      details: {
        before: {
          active: true,
          isAdmin: true,
          deactivatedAt: null,
          anonymizedAt: null,
        },
        after: {
          active: false,
          isAdmin: false,
          deactivatedAt: anonymizedAt.toISOString(),
          anonymizedAt: anonymizedAt.toISOString(),
        },
      },
    });
    expect(JSON.stringify(entries[0]!.details)).not.toMatch(/kral|peter/i);
  });

  it('scrubs names / email in earlier USER entries about P; at, action, actorId unchanged', async () => {
    const after = new Map(
      (await Entries().find().lean()).map((e) => [e.id, e]),
    );
    const aboutP = entriesBefore.filter(
      (e) => e.targetType === 'USER' && e.targetId === p.id,
    );
    expect(aboutP.map((e) => e.action).sort()).toEqual([
      'USER_REGISTERED',
      'USER_UPDATED',
    ]);
    for (const e of aboutP) {
      const now = after.get(e.id)!;
      expect(now).toMatchObject({
        at: e.at,
        action: e.action,
        actorType: e.actorType,
        actorId: e.actorId,
        targetType: 'USER',
        targetId: p.id,
      });
    }
    const registered = aboutP.find((e) => e.action === 'USER_REGISTERED')!;
    expect(after.get(registered.id)!.details).toEqual({
      after: {
        email: '[anonymized]',
        firstName: '[anonymized]',
        surname: '[anonymized]',
        isAdmin: false,
        active: true,
      },
    });
    const updated = aboutP.find((e) => e.action === 'USER_UPDATED')!;
    expect(updated.details).toEqual({
      before: { surname: 'Kral' },
      after: { surname: 'Kráľ' },
    });
    expect(after.get(updated.id)!.details).toEqual({
      before: { surname: '[anonymized]' },
      after: { surname: '[anonymized]' },
    });
    expect(after.get(updated.id)!.actorId).toBe(admin.user.id);
  });

  it('leaves every other entry untouched (incl. P as actor on another user)', async () => {
    const after = new Map(
      (await Entries().find().lean()).map((e) => [e.id, e]),
    );
    const others = entriesBefore.filter(
      (e) => !(e.targetType === 'USER' && e.targetId === p.id),
    );
    expect(others.map((e) => e.action).sort()).toEqual([
      'LEAVE_CREATED',
      'USER_UPDATED',
    ]);
    for (const e of others) expect(after.get(e.id)).toEqual(e);
  });

  it('the leave list shows the placeholder name, deactivated and anonymized, no email', async () => {
    const viewer = await caller();
    const list = await ctx()
      .request()
      .get('/api/leaves')
      .set('Authorization', viewer.auth);
    expect(list.status).toBe(200);
    const leaves = list.body as LeaveDto[];
    const own = leaves.find((l) => l.id === ownLeave.id)!;
    const ref = {
      id: p.id,
      firstName: 'Anonymized',
      surname: `User ${token}`,
      active: false,
      anonymized: true,
    };
    expect(own.requester).toEqual(ref);
    expect(leaves.find((l) => l.id === approvedByP.id)!.approver).toEqual(ref);
    expect(formatUserName(own.requester)).toBe(
      `Anonymized User ${token} (deactivated)`,
    );
    expect(list.text).not.toMatch(/kral|peter/i);
  });

  it('PATCH /api/users/:id on the anonymized user → 409 USER_ANONYMIZED, nothing changes', async () => {
    const before = await Users().findOne({ id: p.id }).lean();
    for (const body of [{ surname: 'Kráľ' }, { isAdmin: true }]) {
      const r = await ctx()
        .request()
        .patch(`/api/users/${p.id}`)
        .set('Authorization', admin.auth)
        .send(body);
      expect(r.status).toBe(409);
      expect(r.body).toEqual(errorBody(409, ErrorCode.USER_ANONYMIZED));
    }
    expect(await Users().findOne({ id: p.id }).lean()).toEqual(before);
  });

  it('a second anonymization → 409 USER_ALREADY_ANONYMIZED, SSO not called', async () => {
    fakes.requests.length = 0;
    const before = await snapshot(p.id);
    const r = await anonymize(p.id, admin.auth, {
      confirmEmail: `anonymized-${token}@anonymized.invalid`,
    });
    expect(r.status).toBe(409);
    expect(r.body).toEqual(errorBody(409, ErrorCode.USER_ALREADY_ANONYMIZED));
    expect(ssoCalls()).toHaveLength(0);
    expect(await snapshot(p.id)).toEqual(before);
  });

  it('the NFR-07 export afterwards shows only placeholders and scrubbed details', async () => {
    const r = await ctx()
      .request()
      .get(`/api/admin/users/${p.id}/export`)
      .set('Authorization', admin.auth);
    expect(r.status).toBe(200);
    const file = r.body as UserExportFile;
    expect(file.user).toMatchObject({
      id: p.id,
      email: `anonymized-${token}@anonymized.invalid`,
      firstName: 'Anonymized',
      surname: `User ${token}`,
      active: false,
      anonymizedAt: anonymizedAt.toISOString(),
    });
    expect(file.leavesAsRequester.map((l) => l.id).sort()).toHaveLength(2);
    expect(file.leavesAsApprover.map((l) => l.id)).toEqual([approvedByP.id]);
    expect(file.auditEntries.map((e) => e.action)).toContain('USER_ANONYMIZED');
    // P's own entries (as user or actor) carry no original personal data.
    // The entry where P edited V stays redacted (NFR-07), so V's names do
    // not appear either.
    expect(r.text).not.toMatch(/kral|kráľ|peter/i);
    expect(r.text).toContain('[anonymized]');
  });
});

describe('anonymize: check order and errors (NFR-08)', () => {
  let admin: { user: User; auth: string };

  beforeAll(async () => {
    admin = await caller({ isAdmin: true });
  });

  it.each([
    ['missing confirmEmail', {}],
    ['confirmEmail null', { confirmEmail: null }],
    ['confirmEmail a number', { confirmEmail: 5 }],
    ['confirmEmail empty', { confirmEmail: '' }],
    ['an unknown property', { confirmEmail: 'x@instea.co', force: true }],
  ])(
    '%s → 400 VALIDATION_FAILED before the lookup, SSO not called',
    async (_l, body) => {
      const target = await seedUser(ctx().app);
      const before = await snapshot(target.id);
      // Even for an unknown id: the body is checked first (step 3 before 4).
      for (const id of [target.id, 'no-such-user']) {
        const r = await anonymize(id, admin.auth, body);
        expect(r.status).toBe(400);
        expect(r.body).toEqual(errorBody(400, ErrorCode.VALIDATION_FAILED));
      }
      expect(ssoCalls()).toHaveLength(0);
      expect(await snapshot(target.id)).toEqual(before);
    },
  );

  it('non-admin → 403 FORBIDDEN before body validation, also on self', async () => {
    const user = await caller();
    const target = await seedUser(ctx().app);
    for (const [id, body] of [
      [target.id, { confirmEmail: target.email }],
      [user.user.id, { confirmEmail: user.user.email }],
      [target.id, {}],
    ] as const) {
      const r = await anonymize(id, user.auth, body);
      expect(r.status).toBe(403);
      expect(r.body).toEqual(errorBody(403, ErrorCode.FORBIDDEN));
    }
    expect(ssoCalls()).toHaveLength(0);
    expect((await Users().findOne({ id: target.id }).lean())!.active).toBe(
      true,
    );
  });

  it('anonymous → 401 AUTH_REQUIRED', async () => {
    const target = await seedUser(ctx().app);
    const r = await ctx()
      .request()
      .post(`/api/admin/users/${target.id}/anonymize`)
      .send({ confirmEmail: target.email });
    expect(r.status).toBe(401);
    expect(r.body).toEqual(errorBody(401, ErrorCode.AUTH_REQUIRED));
  });

  it('unknown id → 404 USER_NOT_FOUND (before the email check), SSO not called', async () => {
    const r = await anonymize('no-such-user', admin.auth, {
      confirmEmail: 'whatever@instea.co',
    });
    expect(r.status).toBe(404);
    expect(r.body).toEqual(errorBody(404, ErrorCode.USER_NOT_FOUND));
    expect(ssoCalls()).toHaveLength(0);
  });

  it('already anonymized → 409 USER_ALREADY_ANONYMIZED before the email check', async () => {
    await Users().create({
      id: 'already-anon',
      email: 'anonymized-00000000@anonymized.invalid',
      firstName: 'Anonymized',
      surname: 'User 00000000',
      active: false,
      deactivatedAt: ctx().clock.now(),
      anonymizedAt: ctx().clock.now(),
    });
    const r = await anonymize('already-anon', admin.auth, {
      confirmEmail: 'wrong@instea.co',
    });
    expect(r.status).toBe(409);
    expect(r.body).toEqual(errorBody(409, ErrorCode.USER_ALREADY_ANONYMIZED));
    expect(ssoCalls()).toHaveLength(0);
  });

  it('wrong confirmEmail → 400 CONFIRM_EMAIL_MISMATCH, SSO not called, nothing changes', async () => {
    const target = await seedUser(ctx().app, { email: 'dana.biela@instea.co' });
    const s = await loginAs(ctx().app, target);
    const before = await snapshot(target.id);
    for (const confirmEmail of [
      'dana.biela@instea.com',
      'dana@instea.co',
      '   ',
    ]) {
      const r = await anonymize(target.id, admin.auth, { confirmEmail });
      expect(r.status).toBe(400);
      expect(r.body).toEqual(errorBody(400, ErrorCode.CONFIRM_EMAIL_MISMATCH));
    }
    expect(ssoCalls()).toHaveLength(0);
    expect(await snapshot(target.id)).toEqual(before);
    expect((await refresh(s.refreshToken)).status).toBe(200);
  });

  it('confirmEmail in a different case with surrounding spaces is accepted', async () => {
    const target = await seedUser(ctx().app, { email: 'eva.mala@instea.co' });
    const r = await anonymize(target.id, admin.auth, {
      confirmEmail: '  Eva.Mala@INSTEA.co ',
    });
    expect(r.status).toBe(200);
    expect((r.body as UserDto).email).toMatch(PLACEHOLDER_EMAIL);
  });

  it('SSO lists the email → 409 SSO_EMPLOYEE_ACTIVE, nothing changes (employee flag ignored)', async () => {
    const target = await seedUser(ctx().app, {
      email: 'jozef.stale@instea.co',
    });
    const s = await loginAs(ctx().app, target);
    // Listed without togglUserId and as a non-employee: still blocks.
    fakes.sso.serve([
      ssoEntry('someone.else@instea.co', { employee: '1' }),
      ssoEntry('jozef.stale@instea.co', { employee: '0' }),
    ]);
    const before = await snapshot(target.id);
    const r = await anonymize(target.id, admin.auth, {
      confirmEmail: 'jozef.stale@instea.co',
    });
    expect(r.status).toBe(409);
    expect(r.body).toEqual(errorBody(409, ErrorCode.SSO_EMPLOYEE_ACTIVE));
    expect(ssoCalls()).toHaveLength(1);
    expect(await snapshot(target.id)).toEqual(before);
    expect((await refresh(s.refreshToken)).status).toBe(200);
  });

  it('SSO lists Peter.Kral@… while peter.kral@… is stored → passes (exact, case-sensitive)', async () => {
    const target = await seedUser(ctx().app, {
      email: 'peter.kral2@instea.co',
    });
    fakes.sso.serve([ssoEntry('Peter.Kral2@instea.co', { employee: '1' })]);
    const r = await anonymize(target.id, admin.auth, {
      confirmEmail: 'peter.kral2@instea.co',
    });
    expect(r.status).toBe(200);
    expect((r.body as UserDto).anonymizedAt).not.toBeNull();
  });

  it.each([
    ['500', { status: 500 }],
    ['non-JSON 200', { status: 200, contentType: 'text/html', body: '<p>' }],
  ])(
    'SSO answers %s → 503 SSO_UNAVAILABLE, nothing changes',
    async (_l, failure) => {
      const target = await seedUser(ctx().app);
      fakes.sso.fail(failure);
      const before = await snapshot(target.id);
      const r = await anonymize(target.id, admin.auth, {
        confirmEmail: target.email,
      });
      expect(r.status).toBe(503);
      expect(r.body).toEqual(errorBody(503, ErrorCode.SSO_UNAVAILABLE));
      expect(await snapshot(target.id)).toEqual(before);
    },
  );

  it('SSO times out (30 s) → 503 SSO_UNAVAILABLE, nothing changes', async () => {
    const target = await seedUser(ctx().app);
    // A hanging SSO request, and the client's 30 s timer shortened to 50 ms
    // (only that timer; every other setTimeout runs as usual).
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!url.startsWith(TEST_SSO.uri)) return realFetch(input, init);
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    });
    const realSetTimeout = globalThis.setTimeout;
    const timers = vi
      .spyOn(globalThis, 'setTimeout')
      .mockImplementation((fn: () => void, ms?: number) =>
        realSetTimeout(fn, ms === SSO_TIMEOUT_MS ? 50 : ms),
      );
    const before = await snapshot(target.id);
    const r = await anonymize(target.id, admin.auth, {
      confirmEmail: target.email,
    });
    expect(timers.mock.calls.some(([, ms]) => ms === SSO_TIMEOUT_MS)).toBe(
      true,
    );
    vi.restoreAllMocks();
    expect(r.status).toBe(503);
    expect(r.body).toEqual(errorBody(503, ErrorCode.SSO_UNAVAILABLE));
    expect(await snapshot(target.id)).toEqual(before);
  });

  it('a deactivated user can be anonymized; deactivatedAt stays as it was', async () => {
    const target = await seedUser(ctx().app, { active: false });
    const deactivatedAt = (await Users().findOne({ id: target.id }).lean())!
      .deactivatedAt!;
    // Less than the access-token TTL: the admin's token stays valid.
    ctx().clock.advance(60 * SECOND);
    const r = await anonymize(target.id, admin.auth, {
      confirmEmail: target.email,
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      active: false,
      deactivatedAt: deactivatedAt.toISOString(),
      anonymizedAt: ctx().clock.now().toISOString(),
    });
    const entry = await Entries()
      .findOne({ action: 'USER_ANONYMIZED', targetId: target.id })
      .lean();
    expect(entry!.details).toEqual({
      before: {
        active: false,
        isAdmin: false,
        deactivatedAt: deactivatedAt.toISOString(),
        anonymizedAt: null,
      },
      after: {
        active: false,
        isAdmin: false,
        deactivatedAt: deactivatedAt.toISOString(),
        anonymizedAt: ctx().clock.now().toISOString(),
      },
    });
  });

  it('two anonymized users get distinct placeholders', async () => {
    const a = await seedUser(ctx().app);
    const b = await seedUser(ctx().app);
    const ra = await anonymize(a.id, admin.auth, { confirmEmail: a.email });
    const rb = await anonymize(b.id, admin.auth, { confirmEmail: b.email });
    expect(ra.status).toBe(200);
    expect(rb.status).toBe(200);
    expect((ra.body as UserDto).email).not.toBe((rb.body as UserDto).email);
  });
});

describe('anonymize: self and rollback (NFR-08)', () => {
  it('self-anonymization → 200, own tokens revoked, cookie cleared, next call 401', async () => {
    const admin = await seedUser(ctx().app, { isAdmin: true });
    const s = await loginAs(ctx().app, admin);
    const other = await loginAs(ctx().app, admin); // a second browser
    const auth = `Bearer ${s.accessToken}`;
    const r = await anonymize(admin.id, auth, { confirmEmail: admin.email });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: admin.id, active: false });
    const cookies = ([] as string[]).concat(r.headers['set-cookie'] ?? []);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(/^refresh_token=;.*Max-Age=0/);
    const tokens = await Tokens().find({ userId: admin.id }).lean();
    expect(tokens.map((t) => t.revokedReason)).toEqual([
      'DEACTIVATED',
      'DEACTIVATED',
    ]);
    const entry = await Entries()
      .findOne({ action: 'USER_ANONYMIZED', targetId: admin.id })
      .lean();
    expect(entry!.actorId).toBe(admin.id);

    const next = await ctx()
      .request()
      .get('/api/users')
      .set('Authorization', auth);
    expect(next.status).toBe(401);
    expect(next.body).toEqual(errorBody(401, ErrorCode.USER_DEACTIVATED));
    for (const raw of [s.refreshToken, other.refreshToken]) {
      expect((await refresh(raw)).status).toBe(401);
    }
  });

  it('audit scrub fails → 500 INTERNAL_ERROR, user, tokens and entries unchanged', async () => {
    const admin = await caller({ isAdmin: true });
    const target = await seedUser(ctx().app, { surname: 'Pôvodná' });
    const s = await loginAs(ctx().app, target);
    await ctx()
      .request()
      .patch(`/api/users/${target.id}`)
      .set('Authorization', admin.auth)
      .send({ surname: 'Nová-Pôvodná' })
      .expect(200);
    const before = await snapshot(target.id);
    vi.spyOn(
      AuditService.prototype,
      'scrubUserPersonalData',
    ).mockRejectedValueOnce(new Error('forced scrub failure'));
    const r = await anonymize(target.id, admin.auth, {
      confirmEmail: target.email,
    });
    expect(r.status).toBe(500);
    expect(r.body).toEqual(errorBody(500, ErrorCode.INTERNAL_ERROR));
    vi.restoreAllMocks();
    expect(await snapshot(target.id)).toEqual(before);
    expect((await refresh(s.refreshToken)).status).toBe(200);
  });

  it('a failing scrub write (after the user update) rolls everything back', async () => {
    const admin = await caller({ isAdmin: true });
    const target = await seedUser(ctx().app);
    await ctx()
      .request()
      .patch(`/api/users/${target.id}`)
      .set('Authorization', admin.auth)
      .send({ firstName: 'Iná' })
      .expect(200);
    const before = await snapshot(target.id);
    vi.spyOn(Entries().collection, 'bulkWrite').mockRejectedValueOnce(
      new Error('forced bulkWrite failure'),
    );
    const r = await anonymize(target.id, admin.auth, {
      confirmEmail: target.email,
    });
    expect(r.status).toBe(500);
    vi.restoreAllMocks();
    expect(await snapshot(target.id)).toEqual(before);
  });

  it('audit insert fails → 500, nothing changes', async () => {
    const admin = await caller({ isAdmin: true });
    const target = await seedUser(ctx().app);
    const before = await snapshot(target.id);
    vi.spyOn(Entries(), 'create').mockRejectedValueOnce(
      new Error('forced audit failure'),
    );
    const r = await anonymize(target.id, admin.auth, {
      confirmEmail: target.email,
    });
    expect(r.status).toBe(500);
    vi.restoreAllMocks();
    expect(await snapshot(target.id)).toEqual(before);
  });

  it('the audit log stays append-only for every other code path', async () => {
    await expect(
      Entries().updateMany({}, { $set: { details: null } }),
    ).rejects.toThrow(/append-only/);
  });
});

describe('anonymize: attendance output (NFR-08 × ATT-04)', () => {
  const attendance = () =>
    ctx()
      .request()
      .get('/api/attendence/2026/12')
      .set('Authorization', m2mAuth());

  it('a user absent from SSO: the December attendance is byte-identical before and after', async () => {
    const admin = await caller({ isAdmin: true });
    // Jana is the SSO employee of the default fixture, with a leave.
    const jana = await seedUser(ctx().app, {
      email: 'jana.nova@instea.co',
      firstName: 'Jana',
      surname: 'Nová',
    });
    await seedLeave(ctx().app, {
      requester: jana,
      startDate: '2026-12-14',
      state: LeaveState.APPROVED,
    });
    const gone = await seedUser(ctx().app, {
      email: 'odisiel@instea.co',
      firstName: 'Ondrej',
      surname: 'Odišiel',
    });
    await seedLeave(ctx().app, {
      requester: gone,
      startDate: '2026-12-15',
      state: LeaveState.APPROVED,
    });

    const before = await attendance();
    expect(before.status).toBe(200);
    // Keyed by the SSO name; the leaver is not in SSO, so not listed.
    expect(
      Object.keys((before.body as { attendence: object }).attendence),
    ).toContain('Jana Nová');
    expect(before.text).not.toMatch(/Ondrej|Odišiel|odisiel/);

    const r = await anonymize(gone.id, admin.auth, {
      confirmEmail: 'odisiel@instea.co',
    });
    expect(r.status).toBe(200);
    const after = await attendance();
    expect(after.status).toBe(200);
    expect(after.text).toBe(before.text);

    // Jana is still listed by SSO: blocked, so she keeps her leave codes.
    const blocked = await anonymize(jana.id, admin.auth, {
      confirmEmail: 'jana.nova@instea.co',
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body).toEqual(errorBody(409, ErrorCode.SSO_EMPLOYEE_ACTIVE));
    expect((await attendance()).text).toBe(before.text);
  });
});
