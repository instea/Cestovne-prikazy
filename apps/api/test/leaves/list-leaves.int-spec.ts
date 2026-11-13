import { Logger } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import type { LeaveDto } from '@leaves/shared/dto';
import { ErrorCode } from '@leaves/shared/enums';
import { LeaveState, LeaveType } from '@leaves/shared/leaves';
import type { Connection } from 'mongoose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { LeavesService } from '../../src/leaves/leaves.service';
import type { User } from '../../src/users/user.schema';
import { useTestApp } from '../support/app';
import { loginAs, startSession } from '../support/auth';
import { m2mAuth } from '../support/m2m';
import { seedLeave, seedUser } from '../support/seed';

/** LST-01 `GET /api/leaves` against MongoDB 8. */

const ctx = useTestApp();

let userA: User;
let userB: User; // deactivated
let admin: User;
let headersA: Record<string, string>;
let headersAdmin: Record<string, string>;
/** Leave ids in the expected list order. */
const ids: Record<string, string> = {};

beforeAll(async () => {
  const { app } = ctx();
  userA = await seedUser(app, { firstName: 'Anna', surname: 'Alfa' });
  userB = await seedUser(app, {
    firstName: 'Jana',
    surname: 'Nová',
    active: false,
  });
  admin = await seedUser(app, {
    firstName: 'Peter',
    surname: 'Admin',
    isAdmin: true,
  });
  headersA = {
    Authorization: `Bearer ${(await loginAs(app, userA)).accessToken}`,
  };
  headersAdmin = {
    Authorization: `Bearer ${(await loginAs(app, admin)).accessToken}`,
  };

  const seed = async (key: string, options: Parameters<typeof seedLeave>[1]) =>
    (ids[key] = (await seedLeave(app, options)).id);
  // Start dates 2026-01-10, 2026-03-01, 2025-12-30 (spec example).
  await seed('janA', {
    requester: userA,
    startDate: '2026-01-10',
    endDate: '2026-01-12',
  });
  await seed('marB', {
    requester: userB,
    approver: admin,
    startDate: '2026-03-01',
    endDate: '2026-03-03',
    state: LeaveState.APPROVED,
    type: LeaveType.SICKNESS,
  });
  await seed('decA', {
    requester: userA,
    approver: admin,
    startDate: '2025-12-30',
    endDate: '2025-12-30',
    state: LeaveState.REJECTED,
  });
  await seed('ghost', {
    requester: { id: 'ghost-user' },
    startDate: '2025-06-02',
    endDate: '2025-06-02',
    isHalfDay: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const get = (headers: Record<string, string>, query = '') =>
  ctx().request().get(`/api/leaves${query}`).set(headers);

describe('GET /api/leaves (LST-01)', () => {
  it("returns every user's leaves to a user, sorted by startDate descending", async () => {
    const res = await get(headersA);
    expect(res.status).toBe(200);
    expect((res.body as LeaveDto[]).map((l) => l.id)).toEqual([
      ids.marB,
      ids.janA,
      ids.decA,
      ids.ghost,
    ]);
  });

  it('returns the same list to an admin', async () => {
    const res = await get(headersAdmin);
    expect(res.status).toBe(200);
    expect((res.body as LeaveDto[]).map((l) => l.id)).toEqual([
      ids.marB,
      ids.janA,
      ids.decA,
      ids.ghost,
    ]);
  });

  it('maps a leave to LeaveDto; approver null when unset', async () => {
    const list = (await get(headersA)).body as LeaveDto[];
    const jan = list.find((l) => l.id === ids.janA)!;
    expect(jan).toEqual({
      id: ids.janA,
      requester: {
        id: userA.id,
        firstName: 'Anna',
        surname: 'Alfa',
        active: true,
        anonymized: false,
      },
      approver: null,
      startDate: '2026-01-10',
      endDate: '2026-01-12',
      isHalfDay: false,
      type: 'ANNUAL',
      state: 'PENDING',
      numDays: 1, // Sat 10, Sun 11, Mon 12
      createdAt: expect.any(String) as string,
      updatedAt: expect.any(String) as string,
    });
  });

  it('keeps the deactivated requester and resolves the approver', async () => {
    const list = (await get(headersA)).body as LeaveDto[];
    const mar = list.find((l) => l.id === ids.marB)!;
    expect(mar.requester).toEqual({
      id: userB.id,
      firstName: 'Jana',
      surname: 'Nová',
      active: false,
      anonymized: false,
    });
    expect(mar.approver).toMatchObject({ id: admin.id, firstName: 'Peter' });
  });

  it('a missing requester gives the Deleted placeholder and a warning', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn');
    const list = (await get(headersA)).body as LeaveDto[];
    const ghost = list.find((l) => l.id === ids.ghost)!;
    expect(ghost.requester).toEqual({
      id: 'ghost-user',
      firstName: 'Deleted',
      surname: 'ghost-user',
      active: false,
      anonymized: false,
    });
    expect(ghost.numDays).toBe(0.5);
    expect(warn).toHaveBeenCalledWith(
      `Leave ${ids.ghost} references missing user ghost-user`,
    );
  });

  it('user references carry no email (NFR-03)', async () => {
    const list = (await get(headersA)).body as LeaveDto[];
    for (const leave of list) {
      for (const ref of [leave.requester, leave.approver]) {
        if (ref === null) continue;
        expect(Object.keys(ref).sort()).toEqual([
          'active',
          'anonymized',
          'firstName',
          'id',
          'surname',
        ]);
      }
    }
  });

  it.each([
    [LeaveState.PENDING, ['janA', 'ghost']],
    [LeaveState.APPROVED, ['marB']],
    [LeaveState.REJECTED, ['decA']],
  ])('?state=%s returns only those leaves', async (state, keys) => {
    const res = await get(headersA, `?state=${state}`);
    expect(res.status).toBe(200);
    const list = res.body as LeaveDto[];
    expect(list.map((l) => l.id)).toEqual(keys.map((k) => ids[k]));
    expect(new Set(list.map((l) => l.state))).toEqual(new Set([state]));
  });

  it('?state=FOO → 400 VALIDATION_FAILED', async () => {
    const res = await get(headersA, '?state=FOO');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      statusCode: 400,
      code: ErrorCode.VALIDATION_FAILED,
      message: 'state must be one of PENDING, APPROVED, REJECTED',
    });
  });

  it('no token → 401 AUTH_REQUIRED; m2m Basic → 401 AUTH_REQUIRED', async () => {
    for (const headers of [{}, { Authorization: m2mAuth() }] as Record<
      string,
      string
    >[]) {
      const res = await get(headers);
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ code: ErrorCode.AUTH_REQUIRED });
    }
  });

  it("a deactivated user's valid token → 401 USER_DEACTIVATED", async () => {
    const { accessToken } = await startSession(ctx().app, userB);
    const res = await get({ Authorization: `Bearer ${accessToken}` });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: ErrorCode.USER_DEACTIVATED });
  });
});

describe('batched user lookup (LST-01)', () => {
  it('loads N leaves with at most 2 queries', async () => {
    const { app } = ctx();
    for (let i = 0; i < 5; i++) {
      const requester = await seedUser(app);
      const approver = await seedUser(app, { isAdmin: true });
      await seedLeave(app, {
        requester,
        approver,
        startDate: `2027-01-0${i + 1}`,
        state: LeaveState.APPROVED,
      });
    }
    const connection = app.get<Connection>(getConnectionToken());
    const queries: string[] = [];
    connection.set('debug', (collection: string, method: string) => {
      queries.push(`${collection}.${method}`);
    });
    try {
      const list = await app.get(LeavesService).list({});
      expect(list.length).toBeGreaterThanOrEqual(9);
    } finally {
      connection.set('debug', false);
    }
    expect(queries).toEqual(['leaves.find', 'users.find']);
  });
});
