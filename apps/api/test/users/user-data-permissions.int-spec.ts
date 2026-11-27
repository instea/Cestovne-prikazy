import { getModelToken } from '@nestjs/mongoose';
import type { LeaveDto, UserDto } from '@leaves/shared/dto';
import { ErrorCode } from '@leaves/shared/enums';
import { LeaveState } from '@leaves/shared/leaves';
import type { Model } from 'mongoose';
import { beforeAll, describe, expect, it } from 'vitest';
import { User } from '../../src/users/user.schema';
import { useHttpFakes } from '../mocks/http-fakes';
import { useTestApp } from '../support/app';
import { loginAs } from '../support/auth';
import { type SeedUserOptions, seedLeave, seedUser } from '../support/seed';

/**
 * NFR-03 user data permissions, rule by rule (spec "Rules" table), against
 * the real app. Route-level 401 / 403 for every caller kind is in the
 * NFR-01 matrix (test/authz/permissions.int-spec.ts).
 */

useHttpFakes();
const ctx = useTestApp();

const Users = () => ctx().app.get<Model<User>>(getModelToken(User.name));

const errorBody = (statusCode: number, code: string) => ({
  statusCode,
  code,
  message: expect.any(String) as string,
});

async function caller(
  options: SeedUserOptions = {},
): Promise<{ user: User; auth: string }> {
  const user = await seedUser(ctx().app, options);
  const { accessToken } = await loginAs(ctx().app, user);
  return { user, auth: `Bearer ${accessToken}` };
}

const USER_REF_KEYS = ['active', 'anonymized', 'firstName', 'id', 'surname'];

describe('user data permissions (NFR-03)', () => {
  let user: { user: User; auth: string };
  let admin: { user: User; auth: string };
  let other: User;

  beforeAll(async () => {
    user = await caller({ firstName: 'Jana', surname: 'Bežná' });
    admin = await caller({ isAdmin: true, firstName: 'Peter', surname: 'Šéf' });
    other = await seedUser(ctx().app, { firstName: 'Iná', surname: 'Osoba' });
  });

  const req = () => ctx().request();

  it('own UserDto via /api/auth/me: read for a non-admin and an admin', async () => {
    for (const c of [user, admin]) {
      const res = await req().get('/api/auth/me').set('Authorization', c.auth);
      expect(res.status).toBe(200);
      expect((res.body as UserDto).id).toBe(c.user.id);
      expect((res.body as UserDto).email).toBe(c.user.email);
    }
  });

  it('a non-admin never lists users or reads another (or own) UserDto: 403 FORBIDDEN', async () => {
    for (const path of [
      '/api/users',
      `/api/users/${other.id}`,
      `/api/users/${user.user.id}`,
    ]) {
      const res = await req().get(path).set('Authorization', user.auth);
      expect(res.status, path).toBe(403);
      expect(res.body).toEqual(errorBody(403, ErrorCode.FORBIDDEN));
      expect(res.text).not.toContain(other.email);
    }
  });

  it('an admin reads the list and any UserDto', async () => {
    const list = await req().get('/api/users').set('Authorization', admin.auth);
    expect(list.status).toBe(200);
    expect((list.body as UserDto[]).map((u) => u.id)).toContain(other.id);
    const one = await req()
      .get(`/api/users/${other.id}`)
      .set('Authorization', admin.auth);
    expect(one.status).toBe(200);
    expect((one.body as UserDto).email).toBe(other.email);
  });

  it('GET /api/leaves for a non-admin: requester / approver are exactly UserRefDto (no email, isAdmin, timestamps)', async () => {
    const deactivated = await seedUser(ctx().app, {
      active: false,
      isAdmin: true,
    });
    const anonymizedId = `anon-${Date.now()}`;
    const anonymized = await Users().create({
      id: anonymizedId,
      email: 'anonymized-1234abcd@anonymized.invalid',
      firstName: 'Anonymized',
      surname: 'User 1234abcd',
      active: false,
      deactivatedAt: ctx().clock.now(),
      anonymizedAt: ctx().clock.now(),
    });
    const leaves = [
      await seedLeave(ctx().app, { requester: user.user }),
      await seedLeave(ctx().app, {
        requester: other,
        approver: admin.user,
        state: LeaveState.APPROVED,
      }),
      await seedLeave(ctx().app, {
        requester: deactivated,
        approver: deactivated,
        state: LeaveState.REJECTED,
      }),
      await seedLeave(ctx().app, {
        requester: anonymized,
        approver: admin.user,
        state: LeaveState.APPROVED,
      }),
    ];

    const res = await req().get('/api/leaves').set('Authorization', user.auth);
    expect(res.status).toBe(200);
    const list = res.body as LeaveDto[];
    const byId = new Map(list.map((l) => [l.id, l]));
    let refs = 0;
    for (const leave of leaves) {
      const dto = byId.get(leave.id)!;
      for (const ref of [dto.requester, dto.approver]) {
        if (ref === null) continue;
        refs++;
        expect(Object.keys(ref).sort()).toEqual(USER_REF_KEYS);
      }
    }
    expect(refs).toBe(7);
    expect(byId.get(leaves[3]!.id)!.requester).toEqual({
      id: anonymizedId,
      firstName: 'Anonymized',
      surname: 'User 1234abcd',
      active: false,
      anonymized: true,
    });
    expect(byId.get(leaves[2]!.id)!.requester).toMatchObject({
      active: false,
      anonymized: false,
    });
    // No email of anyone anywhere in the body.
    expect(res.text).not.toMatch(/@instea\.co|@anonymized\.invalid/);
    expect(res.text).not.toMatch(/"isAdmin"|"email"|"deactivatedAt"/);
  });

  it('own firstName / surname: editable by a non-admin and an admin via /api/users/me', async () => {
    for (const c of [user, admin]) {
      const res = await req()
        .patch('/api/users/me')
        .set('Authorization', c.auth)
        .send({ surname: `${c.user.surname}-Nové` });
      expect(res.status).toBe(200);
      expect((res.body as UserDto).surname).toBe(`${c.user.surname}-Nové`);
    }
  });

  it("others' names: 403 FORBIDDEN for a non-admin, editable by an admin", async () => {
    const denied = await req()
      .patch(`/api/users/${other.id}`)
      .set('Authorization', user.auth)
      .send({ firstName: 'Hack' });
    expect(denied.status).toBe(403);
    expect(denied.body).toEqual(errorBody(403, ErrorCode.FORBIDDEN));
    expect((await Users().findOne({ id: other.id }).lean())!.firstName).toBe(
      'Iná',
    );
    const ok = await req()
      .patch(`/api/users/${other.id}`)
      .set('Authorization', admin.auth)
      .send({ firstName: 'Ina' });
    expect(ok.status).toBe(200);
    expect((ok.body as UserDto).firstName).toBe('Ina');
  });

  it('email is editable by nobody: 403 FIELD_NOT_EDITABLE on every user-edit endpoint', async () => {
    const attempts: [string, string, string][] = [
      ['non-admin, own profile', '/api/users/me', user.auth],
      ['admin, own profile', '/api/users/me', admin.auth],
      ['admin, another user', `/api/users/${other.id}`, admin.auth],
      ['admin, own id', `/api/users/${admin.user.id}`, admin.auth],
    ];
    for (const [label, path, auth] of attempts) {
      for (const body of [
        { email: 'new@instea.co' },
        { email: 'new@instea.co', surname: 'Valid' },
      ]) {
        const res = await req()
          .patch(path)
          .set('Authorization', auth)
          .send(body);
        expect(res.status, label).toBe(403);
        expect(res.body).toEqual(errorBody(403, ErrorCode.FIELD_NOT_EDITABLE));
      }
    }
    // A non-admin on the admin endpoint is stopped by authorization first
    // (NFR-01 check order: 403 FORBIDDEN before any body check).
    const res = await req()
      .patch(`/api/users/${user.user.id}`)
      .set('Authorization', user.auth)
      .send({ email: 'new@instea.co' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual(errorBody(403, ErrorCode.FORBIDDEN));
    for (const u of [user.user, admin.user, other]) {
      expect((await Users().findOne({ id: u.id }).lean())!.email).toBe(u.email);
    }
  });

  it('isAdmin: a non-admin gets 403 FIELD_NOT_EDITABLE on /me and 403 FORBIDDEN on /:id', async () => {
    const me = await req()
      .patch('/api/users/me')
      .set('Authorization', user.auth)
      .send({ isAdmin: true });
    expect(me.status).toBe(403);
    expect(me.body).toEqual(errorBody(403, ErrorCode.FIELD_NOT_EDITABLE));
    const byId = await req()
      .patch(`/api/users/${user.user.id}`)
      .set('Authorization', user.auth)
      .send({ isAdmin: true });
    expect(byId.status).toBe(403);
    expect(byId.body).toEqual(errorBody(403, ErrorCode.FORBIDDEN));
    expect((await Users().findOne({ id: user.user.id }).lean())!.isAdmin).toBe(
      false,
    );
  });

  it("isAdmin: an admin edits others' flag (own flag: test/users/users-api.int-spec.ts)", async () => {
    const target = await seedUser(ctx().app);
    const res = await req()
      .patch(`/api/users/${target.id}`)
      .set('Authorization', admin.auth)
      .send({ isAdmin: true });
    expect(res.status).toBe(200);
    expect((res.body as UserDto).isAdmin).toBe(true);
  });

  it('deactivate, GDPR export and anonymize: 403 FORBIDDEN for a non-admin (also on self)', async () => {
    for (const id of [other.id, user.user.id]) {
      // Built lazily: supertest starts its server per request.
      const calls = [
        () => req().post(`/api/users/${id}/deactivate`),
        () => req().get(`/api/admin/users/${id}/export`),
        () =>
          req()
            .post(`/api/admin/users/${id}/anonymize`)
            .send({ confirmEmail: other.email }),
      ];
      for (const call of calls) {
        const res = await call().set('Authorization', user.auth);
        expect(res.status).toBe(403);
        expect(res.body).toEqual(errorBody(403, ErrorCode.FORBIDDEN));
      }
    }
    expect(await Users().findOne({ id: other.id }).lean()).toMatchObject({
      active: true,
      anonymizedAt: null,
    });
  });
});
