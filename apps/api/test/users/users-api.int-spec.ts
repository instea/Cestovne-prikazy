import { getModelToken } from '@nestjs/mongoose';
import type { UserDto } from '@leaves/shared/dto';
import { ErrorCode } from '@leaves/shared/enums';
import type { Model } from 'mongoose';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditLog } from '../../src/audit/audit-log.schema';
import { User } from '../../src/users/user.schema';
import { useTestApp } from '../support/app';
import { loginAs, startSession } from '../support/auth';
import { type SeedUserOptions, seedUser } from '../support/seed';

/** USR-01 `GET /api/users`, USR-03 `PATCH /api/users/me`. */

const ctx = useTestApp();

const Users = () => ctx().app.get<Model<User>>(getModelToken(User.name));
const Entries = () =>
  ctx().app.get<Model<AuditLog>>(getModelToken(AuditLog.name));

/** A seeded user and its Bearer header (deactivated: pre-deactivation session). */
async function caller(
  options: SeedUserOptions = {},
): Promise<{ user: User; auth: string }> {
  const user = await seedUser(ctx().app, options);
  const { accessToken } =
    options.active === false
      ? await startSession(ctx().app, user)
      : await loginAs(ctx().app, user);
  return { user, auth: `Bearer ${accessToken}` };
}

const errorBody = (statusCode: number, code: string) => ({
  statusCode,
  code,
  message: expect.any(String) as string,
});

describe('GET /api/users (USR-01)', () => {
  let admin: { user: User; auth: string };

  beforeAll(async () => {
    admin = await caller({
      isAdmin: true,
      firstName: 'Peter',
      surname: 'Admin',
      email: 'peter.admin@instea.co',
    });
    // Seeded out of order; sort: surname, firstName, email (case-insensitive, sk).
    await seedUser(ctx().app, {
      id: 'u-zilka',
      firstName: 'Ján',
      surname: 'Žilka',
      email: 'jan.zilka@instea.co',
    });
    await seedUser(ctx().app, {
      id: 'u-novak-b',
      firstName: 'Jana',
      surname: 'Novák',
      email: 'b.jana@instea.co',
    });
    await seedUser(ctx().app, {
      id: 'u-novak-a',
      firstName: 'Jana',
      surname: 'novák',
      email: 'a.jana@instea.co',
    });
    await seedUser(ctx().app, {
      id: 'u-cerny',
      firstName: 'Eva',
      surname: 'Černý',
      email: 'eva@instea.co',
    });
    await seedUser(ctx().app, {
      id: 'u-cech',
      firstName: 'Adam',
      surname: 'Cech',
      email: 'adam@instea.co',
    });
    await seedUser(ctx().app, {
      id: 'u-deactivated',
      firstName: 'Dana',
      surname: 'Bývalá',
      email: 'dana@instea.co',
      active: false,
    });
    await seedUser(ctx().app, {
      id: 'u-noname',
      firstName: '',
      surname: '',
      email: 'noname@instea.co',
    });
  });

  it('admin: 200, every user incl. deactivated, sorted by surname, firstName, email', async () => {
    const res = await ctx()
      .request()
      .get('/api/users')
      .set('Authorization', admin.auth);
    expect(res.status).toBe(200);
    const list = res.body as UserDto[];
    expect(list.map((u) => u.id)).toEqual([
      // '' sorts first
      'u-noname',
      admin.user.id, // Admin
      'u-deactivated', // Bývalá
      'u-cech', // Cech
      'u-cerny', // Černý (sk: Č after C)
      'u-novak-a', // novák / Jana / a.jana (case-insensitive)
      'u-novak-b', // Novák / Jana / b.jana
      'u-zilka', // Žilka
    ]);
    expect(list.find((u) => u.id === 'u-deactivated')).toMatchObject({
      active: false,
      deactivatedAt: expect.any(String) as string,
    });
  });

  it('returns UserDto shape only (no _id, __v, degrees, approved)', async () => {
    const res = await ctx()
      .request()
      .get('/api/users')
      .set('Authorization', admin.auth);
    for (const dto of res.body as UserDto[]) {
      expect(Object.keys(dto).sort()).toEqual(
        [
          'id',
          'email',
          'firstName',
          'surname',
          'isAdmin',
          'active',
          'deactivatedAt',
          'anonymizedAt',
          'createdAt',
          'updatedAt',
        ].sort(),
      );
    }
    const self = (res.body as UserDto[]).find((u) => u.id === admin.user.id);
    expect(self).toEqual({
      id: admin.user.id,
      email: 'peter.admin@instea.co',
      firstName: 'Peter',
      surname: 'Admin',
      isAdmin: true,
      active: true,
      deactivatedAt: null,
      anonymizedAt: null,
      createdAt: expect.any(String) as string,
      updatedAt: expect.any(String) as string,
    });
  });

  it('includes anonymized users', async () => {
    await Users().create({
      id: 'u-anon',
      email: 'anonymized-u-anon@invalid.instea.co',
      firstName: 'Anonymized',
      surname: 'User',
      active: false,
      deactivatedAt: new Date(),
      anonymizedAt: new Date(),
    });
    const res = await ctx()
      .request()
      .get('/api/users')
      .set('Authorization', admin.auth);
    expect(
      (res.body as UserDto[]).find((u) => u.id === 'u-anon'),
    ).toMatchObject({ anonymizedAt: expect.any(String) as string });
  });

  it('non-admin: 403 FORBIDDEN', async () => {
    const { auth } = await caller();
    const res = await ctx()
      .request()
      .get('/api/users')
      .set('Authorization', auth);
    expect(res.status).toBe(403);
    expect(res.body).toEqual(errorBody(403, ErrorCode.FORBIDDEN));
  });

  it('anonymous: 401 AUTH_REQUIRED', async () => {
    const res = await ctx().request().get('/api/users');
    expect(res.status).toBe(401);
    expect(res.body).toEqual(errorBody(401, ErrorCode.AUTH_REQUIRED));
  });

  it('deactivated caller (even an admin): 401 USER_DEACTIVATED', async () => {
    const { auth } = await caller({ isAdmin: true, active: false });
    const res = await ctx()
      .request()
      .get('/api/users')
      .set('Authorization', auth);
    expect(res.status).toBe(401);
    expect(res.body).toEqual(errorBody(401, ErrorCode.USER_DEACTIVATED));
  });
});

describe('PATCH /api/users/me (USR-03)', () => {
  let me: { user: User; auth: string };

  beforeEach(async () => {
    me = await caller({
      firstName: 'Jana',
      surname: 'Nová',
      email: `jana.${Math.random().toString(36).slice(2)}@instea.co`,
    });
  });

  const patchMe = (body: unknown, auth = me.auth) =>
    ctx()
      .request()
      .patch('/api/users/me')
      .set('Authorization', auth)
      .send(body as object);

  const stored = async (id = me.user.id) =>
    (await Users().findOne({ id }).lean())!;

  const auditFor = (id = me.user.id) =>
    Entries()
      .find({ targetType: 'USER', targetId: id, action: 'USER_UPDATED' })
      .lean();

  it('200: changes the surname, /api/auth/me returns it, one USER_UPDATED entry', async () => {
    const before = await stored();
    const res = await patchMe({ surname: '  Veselá ' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: me.user.id,
      firstName: 'Jana',
      surname: 'Veselá',
      email: me.user.email,
      isAdmin: false,
    });
    expect(res.body).not.toHaveProperty('_id');

    const meRes = await ctx()
      .request()
      .get('/api/auth/me')
      .set('Authorization', me.auth);
    expect(meRes.body).toMatchObject({ surname: 'Veselá', firstName: 'Jana' });
    expect((await stored()).updatedAt.getTime()).toBeGreaterThan(
      before.updatedAt.getTime(),
    );

    const entries = await auditFor();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorType: 'user',
      actorId: me.user.id,
      targetType: 'USER',
      targetId: me.user.id,
      details: { before: { surname: 'Nová' }, after: { surname: 'Veselá' } },
    });
  });

  it('200: both names in one request → one entry with both fields', async () => {
    const res = await patchMe({ firstName: 'Eva', surname: 'Malá' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ firstName: 'Eva', surname: 'Malá' });
    const entries = await auditFor();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.details).toEqual({
      before: { firstName: 'Jana', surname: 'Nová' },
      after: { firstName: 'Eva', surname: 'Malá' },
    });
  });

  it('200 without an audit entry when nothing changes', async () => {
    const before = await stored();
    const res = await patchMe({ firstName: ' Jana ', surname: 'Nová' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ firstName: 'Jana', surname: 'Nová' });
    expect(await auditFor()).toHaveLength(0);
    expect((await stored()).updatedAt).toEqual(before.updatedAt);
  });

  it('an admin edits their own name too (isAdmin unchanged)', async () => {
    const admin = await caller({ isAdmin: true });
    const res = await patchMe({ firstName: 'Šéf' }, admin.auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ firstName: 'Šéf', isAdmin: true });
  });

  it.each([
    ['isAdmin', { isAdmin: true }],
    ['isAdmin (false)', { isAdmin: false }],
    ['email', { email: 'boss@instea.co' }],
    ['email next to a name', { email: 'boss@instea.co', surname: 'Boss' }],
  ])('%s → 403 FIELD_NOT_EDITABLE and nothing changes', async (_l, body) => {
    const before = await stored();
    const res = await patchMe(body);
    expect(res.status).toBe(403);
    expect(res.body).toEqual(errorBody(403, ErrorCode.FIELD_NOT_EDITABLE));
    const after = await stored();
    expect(after).toMatchObject({
      email: before.email,
      isAdmin: false,
      surname: 'Nová',
      firstName: 'Jana',
    });
    expect(await auditFor()).toHaveLength(0);
  });

  it('admins get 403 FIELD_NOT_EDITABLE for isAdmin / email as well', async () => {
    const admin = await caller({ isAdmin: true });
    for (const body of [{ isAdmin: false }, { email: 'x@instea.co' }]) {
      const res = await patchMe(body, admin.auth);
      expect(res.status).toBe(403);
      expect(res.body).toEqual(errorBody(403, ErrorCode.FIELD_NOT_EDITABLE));
    }
    expect((await stored(admin.user.id)).isAdmin).toBe(true);
  });

  it.each([
    { approved: true },
    { degrees: 'Ing.' },
    { address: 'Bratislava' },
    { id: 'other' },
    { active: false },
    { firstName: 'Jana', deactivatedAt: null },
  ])('unknown property %j → 400 VALIDATION_FAILED', async (body) => {
    const res = await patchMe(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual(errorBody(400, ErrorCode.VALIDATION_FAILED));
    expect((await stored()).id).toBe(me.user.id);
    expect(await auditFor()).toHaveLength(0);
  });

  it.each([
    [{ firstName: '' }, 'firstName must not be empty'],
    [{ firstName: '   ' }, 'firstName must not be empty'],
    [{ surname: '' }, 'surname must not be empty'],
    [{ surname: 'x'.repeat(101) }, 'surname must be at most 100 characters'],
    [{}, 'At least one field is required'],
  ])('%j → 400 VALIDATION_FAILED "%s"', async (body, message) => {
    const res = await patchMe(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      statusCode: 400,
      code: ErrorCode.VALIDATION_FAILED,
      message,
    });
    expect(await stored()).toMatchObject({
      firstName: 'Jana',
      surname: 'Nová',
    });
  });

  it.each([{ firstName: null }, { surname: 42 }, { firstName: ['a'] }])(
    'non-string name %j → 400 naming the field',
    async (body) => {
      const res = await patchMe(body);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
      expect((res.body as { message: string }).message).toMatch(
        new RegExp(`^${Object.keys(body)[0]} `),
      );
    },
  );

  it('accepts exactly 100 characters', async () => {
    const res = await patchMe({ surname: 'x'.repeat(100) });
    expect(res.status).toBe(200);
  });

  it('anonymous → 401 AUTH_REQUIRED', async () => {
    const res = await ctx()
      .request()
      .patch('/api/users/me')
      .send({ surname: 'X' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual(errorBody(401, ErrorCode.AUTH_REQUIRED));
  });

  it('deactivated → 401 USER_DEACTIVATED, nothing changes', async () => {
    const d = await caller({ active: false, surname: 'Stará' });
    const res = await patchMe({ surname: 'Nová' }, d.auth);
    expect(res.status).toBe(401);
    expect(res.body).toEqual(errorBody(401, ErrorCode.USER_DEACTIVATED));
    expect((await stored(d.user.id)).surname).toBe('Stará');
  });

  // USR-03 AC "non-admin PATCH /api/users/<own id> → 403 FORBIDDEN": that
  // route is USR-02's admin-only `PATCH /api/users/:id` (step 10), which
  // turns this into 403 FORBIDDEN. Until then no route exists: 404, and in
  // no case does it reach the profile update.
  it('PATCH /api/users/<own id> by a non-admin does not edit the user', async () => {
    const res = await ctx()
      .request()
      .patch(`/api/users/${me.user.id}`)
      .set('Authorization', me.auth)
      .send({ surname: 'Hacked' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual(errorBody(404, ErrorCode.NOT_FOUND));
    expect((await stored()).surname).toBe('Nová');
  });
});
