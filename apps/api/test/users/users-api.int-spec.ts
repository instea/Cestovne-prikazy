import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import type { UserDto } from '@leaves/shared/dto';
import { ErrorCode } from '@leaves/shared/enums';
import { LeaveState } from '@leaves/shared/leaves';
import type { Connection, Model } from 'mongoose';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditLog } from '../../src/audit/audit-log.schema';
import { RefreshToken } from '../../src/auth/refresh-token.schema';
import { EXIT_OK, promoteAdmin } from '../../src/cli/promote-admin';
import { Leave } from '../../src/leaves/leave.schema';
import { User } from '../../src/users/user.schema';
import { useTestApp } from '../support/app';
import { cookieHeader, loginAs, startSession } from '../support/auth';
import { type SeedUserOptions, seedLeave, seedUser } from '../support/seed';

/**
 * USR-01 `GET /api/users`, USR-02 `GET`/`PATCH /api/users/:id`, USR-03
 * `PATCH /api/users/me`, USR-04 `POST /api/users/:id/deactivate`.
 */

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
    // Only a case-insensitive collation puts Novák/a before novák/b: a
    // case-sensitive one sorts lowercase "novák" first (or last), and the
    // emails decide only when the surnames compare equal.
    await seedUser(ctx().app, {
      id: 'u-novak-b',
      firstName: 'Jana',
      surname: 'novák',
      email: 'b.jana@instea.co',
    });
    await seedUser(ctx().app, {
      id: 'u-novak-a',
      firstName: 'Jana',
      surname: 'Novák',
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
      'u-novak-a', // Novák / Jana / a.jana (case-insensitive: email decides)
      'u-novak-b', // novák / Jana / b.jana
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

  it.each([
    ['__proto__', '{"__proto__":{"isAdmin":true},"surname":"X"}'],
    ['constructor', '{"constructor":"x","surname":"X"}'],
    ['prototype', '{"prototype":{},"surname":"X"}'],
  ])(
    'a JSON %s key → 400 VALIDATION_FAILED, nothing changes',
    async (key, json) => {
      const res = await ctx()
        .request()
        .patch('/api/users/me')
        .set('Authorization', me.auth)
        .set('Content-Type', 'application/json')
        .send(json);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        statusCode: 400,
        code: ErrorCode.VALIDATION_FAILED,
        message: `property ${key} should not exist`,
      });
      expect(await stored()).toMatchObject({ surname: 'Nová', isAdmin: false });
      expect(await auditFor()).toHaveLength(0);
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

  // USR-03 AC: the own id goes to USR-02's admin-only `PATCH /api/users/:id`.
  it('PATCH /api/users/<own id> by a non-admin → 403 FORBIDDEN, nothing changes', async () => {
    const res = await ctx()
      .request()
      .patch(`/api/users/${me.user.id}`)
      .set('Authorization', me.auth)
      .send({ surname: 'Hacked' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual(errorBody(403, ErrorCode.FORBIDDEN));
    expect((await stored()).surname).toBe('Nová');
    expect(await auditFor()).toHaveLength(0);
  });
});

describe('route order: `me` before `:id` (USR-02 / USR-03)', () => {
  it('PATCH /api/users/me edits the caller, never a user whose id is "me"', async () => {
    const admin = await caller({ isAdmin: true, surname: 'Admin' });
    await seedUser(ctx().app, {
      id: 'me',
      surname: 'Literal',
      email: 'literal.me@instea.co',
    });
    const res = await ctx()
      .request()
      .patch('/api/users/me')
      .set('Authorization', admin.auth)
      .send({ surname: 'Renamed' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: admin.user.id, surname: 'Renamed' });
    expect((await Users().findOne({ id: 'me' }).lean())!.surname).toBe(
      'Literal',
    );
    // The own-profile rules still apply to an admin on `me`.
    const flag = await ctx()
      .request()
      .patch('/api/users/me')
      .set('Authorization', admin.auth)
      .send({ isAdmin: false });
    expect(flag.status).toBe(403);
    expect(flag.body).toEqual(errorBody(403, ErrorCode.FIELD_NOT_EDITABLE));
    // `GET /api/users/me` has no `me` route: it is the `:id` lookup.
    const get = await ctx()
      .request()
      .get('/api/users/me')
      .set('Authorization', admin.auth);
    expect(get.status).toBe(200);
    expect(get.body).toMatchObject({ id: 'me', surname: 'Literal' });
  });
});

describe('GET /api/users/:id (USR-02)', () => {
  it('admin: 200 UserDto of any user, incl. deactivated', async () => {
    const admin = await caller({ isAdmin: true });
    const target = await seedUser(ctx().app, {
      active: false,
      surname: 'Bývalá',
    });
    const res = await ctx()
      .request()
      .get(`/api/users/${target.id}`)
      .set('Authorization', admin.auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: target.id,
      email: target.email,
      firstName: 'Jana',
      surname: 'Bývalá',
      isAdmin: false,
      active: false,
      deactivatedAt: expect.any(String) as string,
      anonymizedAt: null,
      createdAt: expect.any(String) as string,
      updatedAt: expect.any(String) as string,
    });
  });

  it('unknown id → 404 USER_NOT_FOUND; non-admin → 403; anonymous → 401', async () => {
    const admin = await caller({ isAdmin: true });
    const user = await caller();
    const missing = await ctx()
      .request()
      .get('/api/users/no-such-user')
      .set('Authorization', admin.auth);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual(errorBody(404, ErrorCode.USER_NOT_FOUND));
    const forbidden = await ctx()
      .request()
      .get(`/api/users/${user.user.id}`)
      .set('Authorization', user.auth);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual(errorBody(403, ErrorCode.FORBIDDEN));
    const anon = await ctx().request().get(`/api/users/${user.user.id}`);
    expect(anon.status).toBe(401);
    expect(anon.body).toEqual(errorBody(401, ErrorCode.AUTH_REQUIRED));
  });
});

describe('PATCH /api/users/:id (USR-02)', () => {
  let admin: { user: User; auth: string };
  let target: User;

  beforeEach(async () => {
    admin = await caller({ isAdmin: true, surname: 'Admin' });
    target = await seedUser(ctx().app, { firstName: 'Jana', surname: 'Nová' });
  });

  const patch = (id: string, body: unknown, auth = admin.auth) =>
    ctx()
      .request()
      .patch(`/api/users/${id}`)
      .set('Authorization', auth)
      .send(body as object);

  const stored = async (id = target.id) =>
    (await Users().findOne({ id }).lean())!;

  const entriesFor = (id = target.id) =>
    Entries()
      .find({ targetType: 'USER', targetId: id })
      .sort({ action: 1 })
      .lean();

  it('200: names + admin flag → new values, USER_UPDATED + USER_ROLE_CHANGED with the same at, listed by GET /api/users', async () => {
    const res = await patch(target.id, {
      firstName: ' Eva ',
      surname: 'Malá',
      isAdmin: true,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: target.id,
      email: target.email,
      firstName: 'Eva',
      surname: 'Malá',
      isAdmin: true,
    });
    expect(await stored()).toMatchObject({
      firstName: 'Eva',
      surname: 'Malá',
      isAdmin: true,
    });

    const entries = await entriesFor();
    expect(entries).toHaveLength(2);
    const [role, updated] = entries;
    expect(updated).toMatchObject({
      action: 'USER_UPDATED',
      actorType: 'user',
      actorId: admin.user.id,
      targetType: 'USER',
      targetId: target.id,
      details: {
        before: { firstName: 'Jana', surname: 'Nová' },
        after: { firstName: 'Eva', surname: 'Malá' },
      },
    });
    expect(role).toMatchObject({
      action: 'USER_ROLE_CHANGED',
      actorId: admin.user.id,
      details: { before: { isAdmin: false }, after: { isAdmin: true } },
    });
    expect(role!.at).toEqual(updated!.at);

    const list = await ctx()
      .request()
      .get('/api/users')
      .set('Authorization', admin.auth);
    expect(
      (list.body as UserDto[]).find((u) => u.id === target.id),
    ).toMatchObject({ firstName: 'Eva', surname: 'Malá', isAdmin: true });
  });

  it('partial update: only the surname → one USER_UPDATED with that field', async () => {
    const res = await patch(target.id, { surname: 'Veselá' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      firstName: 'Jana',
      surname: 'Veselá',
      isAdmin: false,
    });
    const entries = await entriesFor();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: 'USER_UPDATED',
      details: { before: { surname: 'Nová' }, after: { surname: 'Veselá' } },
    });
  });

  it('only the admin flag → one USER_ROLE_CHANGED', async () => {
    const res = await patch(target.id, { isAdmin: true });
    expect(res.status).toBe(200);
    const entries = await entriesFor();
    expect(entries.map((e) => e.action)).toEqual(['USER_ROLE_CHANGED']);
  });

  it('no change → 200 without an audit entry, updatedAt kept', async () => {
    const before = await stored();
    const res = await patch(target.id, {
      firstName: 'Jana',
      surname: ' Nová ',
      isAdmin: false,
    });
    expect(res.status).toBe(200);
    expect(await entriesFor()).toHaveLength(0);
    expect((await stored()).updatedAt).toEqual(before.updatedAt);
  });

  it('a deactivated user can be edited (only anonymized ones cannot)', async () => {
    const d = await seedUser(ctx().app, { active: false });
    const res = await patch(d.id, { surname: 'Nová2' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ surname: 'Nová2', active: false });
  });

  it.each([
    ['email', { email: 'x@instea.co' }],
    ['email next to valid fields', { email: 'x@instea.co', surname: 'X' }],
  ])('%s → 403 FIELD_NOT_EDITABLE, email unchanged', async (_l, body) => {
    const res = await patch(target.id, body);
    expect(res.status).toBe(403);
    expect(res.body).toEqual(errorBody(403, ErrorCode.FIELD_NOT_EDITABLE));
    expect(await stored()).toMatchObject({
      email: target.email,
      surname: 'Nová',
    });
    expect(await entriesFor()).toHaveLength(0);
  });

  it.each([
    { approved: true },
    { degrees: 'Ing.' },
    { address: 'Bratislava' },
    { id: 'other' },
    { active: false },
  ])('unknown property %j → 400 VALIDATION_FAILED', async (body) => {
    const res = await patch(target.id, body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual(errorBody(400, ErrorCode.VALIDATION_FAILED));
    expect(await entriesFor()).toHaveLength(0);
  });

  it.each([
    [{ firstName: '   ' }, 'firstName must not be empty'],
    [{ surname: '' }, 'surname must not be empty'],
    [
      { firstName: 'x'.repeat(101) },
      'firstName must be at most 100 characters',
    ],
    [{ isAdmin: 'yes' }, 'isAdmin must be a boolean'],
    [{ isAdmin: null }, 'isAdmin must be a boolean'],
    [{}, 'At least one field is required'],
  ])('%j → 400 VALIDATION_FAILED "%s"', async (body, message) => {
    const res = await patch(target.id, body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      statusCode: 400,
      code: ErrorCode.VALIDATION_FAILED,
      message,
    });
    expect(await stored()).toMatchObject({
      firstName: 'Jana',
      surname: 'Nová',
      isAdmin: false,
    });
  });

  it('unknown id → 404 USER_NOT_FOUND (old silent success fixed)', async () => {
    const res = await patch('no-such-user', { surname: 'X' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual(errorBody(404, ErrorCode.USER_NOT_FOUND));
  });

  it('anonymized target → 409 USER_ANONYMIZED, nothing changes', async () => {
    await Users().create({
      id: 'u-anonymized',
      email: 'anonymized-u-anonymized@invalid.instea.co',
      firstName: 'Anonymized',
      surname: 'User',
      active: false,
      deactivatedAt: new Date(),
      anonymizedAt: new Date(),
    });
    const res = await patch('u-anonymized', { firstName: 'Back' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual(errorBody(409, ErrorCode.USER_ANONYMIZED));
    expect(await stored('u-anonymized')).toMatchObject({
      firstName: 'Anonymized',
    });
    expect(await entriesFor('u-anonymized')).toHaveLength(0);
  });

  it('non-admin on another user → 403 FORBIDDEN (old silent success fixed)', async () => {
    const user = await caller();
    const res = await patch(target.id, { surname: 'Hacked' }, user.auth);
    expect(res.status).toBe(403);
    expect(res.body).toEqual(errorBody(403, ErrorCode.FORBIDDEN));
    expect((await stored()).surname).toBe('Nová');
  });

  it('non-admin promoting themselves → 403 FORBIDDEN', async () => {
    const user = await caller();
    const res = await patch(user.user.id, { isAdmin: true }, user.auth);
    expect(res.status).toBe(403);
    expect(res.body).toEqual(errorBody(403, ErrorCode.FORBIDDEN));
    expect((await stored(user.user.id)).isAdmin).toBe(false);
  });

  it('anonymous → 401; deactivated admin → 401 USER_DEACTIVATED', async () => {
    const anon = await ctx()
      .request()
      .patch(`/api/users/${target.id}`)
      .send({ surname: 'X' });
    expect(anon.status).toBe(401);
    expect(anon.body).toEqual(errorBody(401, ErrorCode.AUTH_REQUIRED));
    const d = await caller({ isAdmin: true, active: false });
    const res = await patch(target.id, { surname: 'X' }, d.auth);
    expect(res.status).toBe(401);
    expect(res.body).toEqual(errorBody(401, ErrorCode.USER_DEACTIVATED));
  });

  it('a demoted user gets 403 on the next admin call (same access token)', async () => {
    const other = await caller({ isAdmin: true });
    expect(
      (await ctx().request().get('/api/users').set('Authorization', other.auth))
        .status,
    ).toBe(200);
    expect((await patch(other.user.id, { isAdmin: false })).status).toBe(200);
    const res = await ctx()
      .request()
      .get('/api/users')
      .set('Authorization', other.auth);
    expect(res.status).toBe(403);
    expect(res.body).toEqual(errorBody(403, ErrorCode.FORBIDDEN));
  });

  it('admin demotes self → 200, next admin call 403', async () => {
    const res = await patch(admin.user.id, { isAdmin: false });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: admin.user.id, isAdmin: false });
    const next = await patch(target.id, { surname: 'X' });
    expect(next.status).toBe(403);
    expect(next.body).toEqual(errorBody(403, ErrorCode.FORBIDDEN));
  });

  it('demoting the only admin → 200, no admin left, promote-admin restores one', async () => {
    // Make `admin` the only active admin of the database.
    await Users().updateMany(
      { id: { $ne: admin.user.id } },
      { $set: { isAdmin: false } },
    );
    const res = await patch(admin.user.id, { isAdmin: false });
    expect(res.status).toBe(200);
    expect(await Users().countDocuments({ isAdmin: true })).toBe(0);

    const out = { stdout: () => {}, stderr: () => {} };
    expect(
      await promoteAdmin(
        ctx().app.get<Connection>(getConnectionToken()),
        admin.user.email,
        out,
      ),
    ).toBe(EXIT_OK);
    expect((await stored(admin.user.id)).isAdmin).toBe(true);
    // The restored admin works with the same session again.
    expect((await patch(target.id, { surname: 'Back' })).status).toBe(200);
  });
});

describe('POST /api/users/:id/deactivate (USR-04)', () => {
  const Tokens = () =>
    ctx().app.get<Model<RefreshToken>>(getModelToken(RefreshToken.name));
  const Leaves = () => ctx().app.get<Model<Leave>>(getModelToken(Leave.name));

  const deactivate = (id: string, auth: string) =>
    ctx()
      .request()
      .post(`/api/users/${id}/deactivate`)
      .set('Authorization', auth);

  const refresh = (refreshToken: string) =>
    ctx()
      .request()
      .post('/api/auth/refresh')
      .set('Cookie', cookieHeader(refreshToken));

  it('200: active=false, deactivatedAt set, isAdmin kept, every refresh token revoked, audit entry, leaves untouched and still named', async () => {
    const admin = await caller({ isAdmin: true });
    const target = await seedUser(ctx().app, {
      isAdmin: true,
      firstName: 'Dana',
      surname: 'Odchádzajúca',
    });
    // Two browsers of the target, plus a session of someone else.
    const a = await loginAs(ctx().app, target);
    const b = await loginAs(ctx().app, target);
    const leave = await seedLeave(ctx().app, {
      requester: target,
      approver: admin.user,
      state: LeaveState.APPROVED,
    });
    const leaveBefore = (await Leaves().findOne({ id: leave.id }).lean())!;

    const res = await deactivate(target.id, admin.auth);
    expect(res.status).toBe(200);
    const now = ctx().clock.now().toISOString();
    expect(res.body).toMatchObject({
      id: target.id,
      active: false,
      deactivatedAt: now,
      isAdmin: true,
    });
    expect(await Users().findOne({ id: target.id }).lean()).toMatchObject({
      active: false,
      deactivatedAt: ctx().clock.now(),
      isAdmin: true,
    });

    const tokens = await Tokens().find({ userId: target.id }).lean();
    expect(tokens).toHaveLength(2);
    for (const t of tokens) {
      expect(t).toMatchObject({
        revokedReason: 'DEACTIVATED',
        revokedAt: ctx().clock.now(),
      });
    }
    // AUTH-05: a previously valid refresh cookie → 401 USER_DEACTIVATED.
    for (const raw of [a.refreshToken, b.refreshToken]) {
      const r = await refresh(raw);
      expect(r.status).toBe(401);
      expect(r.body).toEqual(errorBody(401, ErrorCode.USER_DEACTIVATED));
    }
    // ... and the live access token → 401 USER_DEACTIVATED.
    const me = await ctx()
      .request()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${a.accessToken}`);
    expect(me.status).toBe(401);
    expect(me.body).toEqual(errorBody(401, ErrorCode.USER_DEACTIVATED));

    const entries = await Entries()
      .find({ targetType: 'USER', targetId: target.id })
      .lean();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: 'USER_DEACTIVATED',
      actorType: 'user',
      actorId: admin.user.id,
      details: {
        before: { active: true, deactivatedAt: null },
        after: { active: false, deactivatedAt: now },
      },
    });

    // The leave keeps requester / approver / state and shows the name.
    expect(await Leaves().findOne({ id: leave.id }).lean()).toEqual(
      leaveBefore,
    );
    const list = await ctx()
      .request()
      .get('/api/leaves')
      .set('Authorization', admin.auth);
    expect(list.status).toBe(200);
    const listed = (
      list.body as { id: string; requester: Record<string, unknown> }[]
    ).find((l) => l.id === leave.id);
    expect(listed?.requester).toEqual({
      id: target.id,
      firstName: 'Dana',
      surname: 'Odchádzajúca',
      active: false,
      anonymized: false,
    });
  });

  it('other users’ sessions are untouched', async () => {
    const admin = await caller({ isAdmin: true });
    const target = await seedUser(ctx().app);
    const bystander = await seedUser(ctx().app);
    const s = await loginAs(ctx().app, bystander);
    expect((await deactivate(target.id, admin.auth)).status).toBe(200);
    expect((await refresh(s.refreshToken)).status).toBe(200);
  });

  it('already deactivated → 409 USER_ALREADY_DEACTIVATED, nothing written', async () => {
    const admin = await caller({ isAdmin: true });
    const target = await seedUser(ctx().app, { active: false });
    const before = (await Users().findOne({ id: target.id }).lean())!;
    const res = await deactivate(target.id, admin.auth);
    expect(res.status).toBe(409);
    expect(res.body).toEqual(
      errorBody(409, ErrorCode.USER_ALREADY_DEACTIVATED),
    );
    expect(await Users().findOne({ id: target.id }).lean()).toEqual(before);
    expect(await Entries().countDocuments({ targetId: target.id })).toBe(0);
  });

  it('unknown id → 404 USER_NOT_FOUND', async () => {
    const admin = await caller({ isAdmin: true });
    const res = await deactivate('no-such-user', admin.auth);
    expect(res.status).toBe(404);
    expect(res.body).toEqual(errorBody(404, ErrorCode.USER_NOT_FOUND));
  });

  it('non-admin → 403 FORBIDDEN (also on self), user stays active', async () => {
    const user = await caller();
    const target = await seedUser(ctx().app);
    for (const id of [target.id, user.user.id]) {
      const res = await deactivate(id, user.auth);
      expect(res.status).toBe(403);
      expect(res.body).toEqual(errorBody(403, ErrorCode.FORBIDDEN));
      expect((await Users().findOne({ id }).lean())!.active).toBe(true);
    }
  });

  it('anonymous → 401 AUTH_REQUIRED', async () => {
    const target = await seedUser(ctx().app);
    const res = await ctx()
      .request()
      .post(`/api/users/${target.id}/deactivate`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual(errorBody(401, ErrorCode.AUTH_REQUIRED));
  });

  it('self-deactivation → 200, own refresh tokens revoked, next call 401 USER_DEACTIVATED', async () => {
    const admin = await seedUser(ctx().app, { isAdmin: true });
    const s = await loginAs(ctx().app, admin);
    const auth = `Bearer ${s.accessToken}`;
    const res = await deactivate(admin.id, auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: admin.id, active: false });
    const tokens = await Tokens().find({ userId: admin.id }).lean();
    expect(tokens.map((t) => t.revokedReason)).toEqual(['DEACTIVATED']);
    const next = await ctx()
      .request()
      .get('/api/users')
      .set('Authorization', auth);
    expect(next.status).toBe(401);
    expect(next.body).toEqual(errorBody(401, ErrorCode.USER_DEACTIVATED));
    const r = await refresh(s.refreshToken);
    expect(r.status).toBe(401);
    expect(r.body).toEqual(errorBody(401, ErrorCode.USER_DEACTIVATED));
  });

  it('audit insert failure → 500, user stays active and tokens stay valid', async () => {
    const admin = await caller({ isAdmin: true });
    const target = await seedUser(ctx().app);
    const s = await loginAs(ctx().app, target);
    vi.spyOn(Entries(), 'create').mockRejectedValueOnce(
      new Error('forced audit failure'),
    );
    try {
      const res = await deactivate(target.id, admin.auth);
      expect(res.status).toBe(500);
      expect(res.body).toEqual(errorBody(500, ErrorCode.INTERNAL_ERROR));
    } finally {
      vi.restoreAllMocks();
    }
    expect((await Users().findOne({ id: target.id }).lean())!.active).toBe(
      true,
    );
    expect((await refresh(s.refreshToken)).status).toBe(200);
  });

  it('no reactivation and no hard delete: both routes are 404 NOT_FOUND', async () => {
    const admin = await caller({ isAdmin: true });
    const target = await seedUser(ctx().app, { active: false });
    const reactivate = await ctx()
      .request()
      .post(`/api/users/${target.id}/reactivate`)
      .set('Authorization', admin.auth);
    expect(reactivate.status).toBe(404);
    expect(reactivate.body).toEqual(errorBody(404, ErrorCode.NOT_FOUND));
    const del = await ctx()
      .request()
      .delete(`/api/users/${target.id}`)
      .set('Authorization', admin.auth);
    expect(del.status).toBe(404);
    expect(del.body).toEqual(errorBody(404, ErrorCode.NOT_FOUND));
    expect(await Users().findOne({ id: target.id }).lean()).toMatchObject({
      active: false,
    });
  });
});
