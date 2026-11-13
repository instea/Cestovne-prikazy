import { getModelToken } from '@nestjs/mongoose';
import type { AuditEntryDto, AuditPageDto } from '@leaves/shared/audit';
import { ErrorCode } from '@leaves/shared/enums';
import type { Model } from 'mongoose';
import { beforeAll, describe, expect, it } from 'vitest';
import { AuditLog } from '../../src/audit/audit-log.schema';
import type { User } from '../../src/users/user.schema';
import { useTestApp } from '../support/app';
import { startSession } from '../support/auth';
import { seedUser } from '../support/seed';

const ctx = useTestApp();

const entries = () =>
  ctx().app.get<Model<AuditLog>>(getModelToken(AuditLog.name));

let admin: User;
let jana: User;
let adminAuth: string;
let userAuth: string;

/** Seeded entries, oldest first. */
const seeded: Record<string, string> = {};

async function bearer(user: User): Promise<string> {
  return `Bearer ${(await startSession(ctx().app, user)).accessToken}`;
}

beforeAll(async () => {
  admin = await seedUser(ctx().app, {
    isAdmin: true,
    firstName: 'Peter',
    surname: 'Admin',
  });
  jana = await seedUser(ctx().app, { firstName: 'Jana', surname: 'Nová' });
  adminAuth = await bearer(admin);
  userAuth = await bearer(jana);

  const rows: Array<[string, Partial<AuditLog>]> = [
    // 2026-10-31 23:30 UTC = 2026-11-01 00:30 Bratislava
    [
      'created',
      {
        at: new Date('2026-10-31T23:30:00.000Z'),
        actorType: 'user',
        actorId: jana.id,
        action: 'LEAVE_CREATED',
        targetType: 'LEAVE',
        targetId: 'leave-1',
        details: { after: { id: 'leave-1' } },
      },
    ],
    [
      'approved',
      {
        at: new Date('2026-11-01T22:59:59.999Z'),
        actorType: 'user',
        actorId: admin.id,
        action: 'LEAVE_APPROVED',
        targetType: 'LEAVE',
        targetId: 'leave-1',
        details: {
          previousState: 'PENDING',
          newState: 'APPROVED',
          previousApproverId: null,
        },
      },
    ],
    [
      'cli',
      {
        at: new Date('2026-11-01T23:00:00.000Z'),
        actorType: 'cli',
        actorId: null,
        action: 'USER_ROLE_CHANGED',
        targetType: 'USER',
        targetId: admin.id,
        details: { before: { isAdmin: false }, after: { isAdmin: true } },
      },
    ],
    [
      'ghost',
      {
        at: new Date('2026-11-02T08:00:00.000Z'),
        actorType: 'user',
        actorId: 'gone-user',
        action: 'LEAVE_DELETED',
        targetType: 'LEAVE',
        targetId: 'leave-2',
        details: { before: { id: 'leave-2' } },
      },
    ],
  ];
  for (const [name, row] of rows) {
    seeded[name] = (await entries().create(row)).toObject().id;
  }
});

function list(query = '', auth: string | null = adminAuth) {
  const req = ctx().request().get(`/api/admin/audit${query}`);
  return auth ? req.set('Authorization', auth) : req;
}

const ids = (body: unknown) =>
  (body as AuditPageDto).items.map((i: AuditEntryDto) => i.id);

describe('GET /api/admin/audit', () => {
  it('lists all, newest first, with actor refs', async () => {
    const res = await list();
    expect(res.status).toBe(200);
    const body = res.body as AuditPageDto;
    expect(body).toMatchObject({ page: 1, pageSize: 50, total: 4 });
    expect(ids(body)).toEqual([
      seeded.ghost,
      seeded.cli,
      seeded.approved,
      seeded.created,
    ]);
    const approved = body.items[2]!;
    expect(approved).toEqual({
      id: seeded.approved,
      at: '2026-11-01T22:59:59.999Z',
      actorType: 'user',
      actorId: admin.id,
      actor: {
        id: admin.id,
        firstName: 'Peter',
        surname: 'Admin',
        active: true,
        anonymized: false,
      },
      action: 'LEAVE_APPROVED',
      targetType: 'LEAVE',
      targetId: 'leave-1',
      details: {
        previousState: 'PENDING',
        newState: 'APPROVED',
        previousApproverId: null,
      },
    });
    expect(JSON.stringify(body)).not.toContain('@');
  });

  it('actor is null for cli and for a missing user', async () => {
    const body = (await list()).body as AuditPageDto;
    const byId = new Map(body.items.map((i) => [i.id, i]));
    expect(byId.get(seeded.cli!)).toMatchObject({ actor: null, actorId: null });
    expect(byId.get(seeded.ghost!)).toMatchObject({
      actor: null,
      actorId: 'gone-user',
    });
  });

  it.each([
    ['?action=LEAVE_APPROVED', ['approved']],
    ['?action=LEAVE_APPROVED,LEAVE_CREATED', ['approved', 'created']],
    ['?action=LEAVE_APPROVED&action=USER_ROLE_CHANGED', ['cli', 'approved']],
    ['?actorType=cli', ['cli']],
    ['?actorType=user', ['ghost', 'approved', 'created']],
    ['?targetType=USER', ['cli']],
    ['?targetId=leave-1', ['approved', 'created']],
    ['?targetType=LEAVE&targetId=leave-2', ['ghost']],
    // Bratislava day 2026-11-01 = [10-31T23:00Z, 11-01T22:59:59.999Z]
    ['?from=2026-11-01&to=2026-11-01', ['approved', 'created']],
    ['?from=2026-11-02', ['ghost', 'cli']],
    ['?to=2026-10-31', []],
    ['?actorType=user&action=LEAVE_CREATED&from=2026-11-01', ['created']],
  ])('filter %s', async (query, expected) => {
    const res = await list(query);
    expect(res.status).toBe(200);
    expect(ids(res.body)).toEqual(expected.map((n) => seeded[n]));
    expect((res.body as AuditPageDto).total).toBe(expected.length);
  });

  it('actorId filter', async () => {
    const res = await list(`?actorId=${encodeURIComponent(jana.id)}`);
    expect(ids(res.body)).toEqual([seeded.created]);
  });

  it('paginates with total before paging; beyond last page is empty', async () => {
    const p2 = await list('?pageSize=3&page=2');
    expect(p2.body).toMatchObject({ page: 2, pageSize: 3, total: 4 });
    expect(ids(p2.body)).toEqual([seeded.created]);
    const p9 = await list('?pageSize=3&page=9');
    expect(p9.body).toMatchObject({ items: [], total: 4 });
  });

  it('401 without a token', async () => {
    const res = await list('', null);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: ErrorCode.AUTH_REQUIRED });
  });

  it('403 for a non-admin', async () => {
    const res = await list('', userAuth);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: ErrorCode.FORBIDDEN });
  });

  it.each([
    '?action=NOPE',
    '?actorType=admin',
    '?targetType=leave',
    '?from=2026-02-30',
    '?page=0',
    '?pageSize=201',
    '?unknown=1',
  ])('400 VALIDATION_FAILED for %s', async (query) => {
    const res = await list(query);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
  });

  it('400 AUDIT_RANGE_INVALID when from > to', async () => {
    const res = await list('?from=2026-11-05&to=2026-11-01');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: ErrorCode.AUDIT_RANGE_INVALID });
  });
});

describe('pagination at volume', () => {
  it('120 entries, pageSize=50&page=3 → 20 items', async () => {
    const targetId = 'bulk-target';
    await entries().insertMany(
      Array.from({ length: 120 }, (_, i) => ({
        at: new Date(Date.UTC(2025, 0, 1, 0, i)),
        actorType: 'cli',
        actorId: null,
        action: 'USER_DATA_EXPORTED',
        targetType: 'USER',
        targetId,
        details: null,
      })),
    );
    const res = await list(`?targetId=${targetId}&pageSize=50&page=3`);
    expect(res.body).toMatchObject({ total: 120, page: 3, pageSize: 50 });
    const items = (res.body as AuditPageDto).items;
    expect(items).toHaveLength(20);
    // Oldest 20, still in descending order.
    expect(items[0]!.at).toBe('2025-01-01T00:19:00.000Z');
    expect(items[19]!.at).toBe('2025-01-01T00:00:00.000Z');
  });

  it('ties on at are ordered by id descending', async () => {
    const at = new Date('2024-06-01T00:00:00.000Z');
    const docs = await entries().insertMany(
      ['a', 'b', 'c'].map(() => ({
        at,
        actorType: 'cli',
        actorId: null,
        action: 'USER_DATA_EXPORTED',
        targetType: 'USER',
        targetId: 'tie',
        details: null,
      })),
    );
    const res = await list('?targetId=tie');
    expect(ids(res.body)).toEqual(
      docs
        .map((d) => d.toObject().id)
        .sort()
        .reverse(),
    );
  });
});
