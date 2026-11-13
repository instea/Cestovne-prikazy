import { getModelToken } from '@nestjs/mongoose';
import { ErrorCode } from '@leaves/shared/enums';
import type { Model } from 'mongoose';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  RefreshToken,
  RevokedReason,
} from '../../src/auth/refresh-token.schema';
import { SessionService } from '../../src/auth/session.service';
import { User } from '../../src/users/user.schema';
import { send, type RouteKey } from '../authz/routes';
import { PERMISSIONS } from '../permissions';
import { useTestApp } from '../support/app';
import { cookieHeader, loginAs, startSession } from '../support/auth';
import { makeIdToken } from '../support/google';
import { m2mAuth } from '../support/m2m';
import { seedUser } from '../support/seed';

/**
 * AUTH-05: a user with `active=false` is denied at every layer — every
 * session-protected route (DB check per request), refresh and Google login —
 * immediately, without waiting for token expiry.
 * E2E (admin deactivates a user logged in elsewhere): TST-03.
 */

const ctx = useTestApp();

const users = () => ctx().app.get<Model<User>>(getModelToken(User.name));
const tokens = () =>
  ctx().app.get<Model<RefreshToken>>(getModelToken(RefreshToken.name));

const deactivate = (id: string) =>
  users().updateOne(
    { id },
    { $set: { active: false, deactivatedAt: ctx().clock.now() } },
  );

function expectDeactivated(res: { status: number; body: unknown }) {
  expect(res.status).toBe(401);
  expect(res.body).toMatchObject({
    statusCode: 401,
    code: ErrorCode.USER_DEACTIVATED,
  });
}

beforeEach(() => {
  ctx().clock.set('2026-12-21T08:00:00.000Z');
});

/**
 * Every session route (`user` / `admin` access in the NFR-01 matrix),
 * whatever its success status (200, 201, 204 …): public and M2M routes do
 * not use sessions.
 */
const sessionRoutes = (
  Object.entries(PERMISSIONS) as [RouteKey, (typeof PERMISSIONS)[RouteKey]][]
).filter(([, row]) => row.access === 'user' || row.access === 'admin');

describe('every user/admin route rejects a deactivated user', () => {
  it('covers at least the known session routes', () => {
    const keys = sessionRoutes.map(([k]) => k);
    expect(keys).toEqual(
      expect.arrayContaining(['GET /api/auth/me', 'GET /api/admin/audit']),
    );
    // The matrix agrees: every session route denies a deactivated caller.
    for (const [, row] of sessionRoutes) {
      expect(row.expect.deactivated).toEqual({
        status: 401,
        code: ErrorCode.USER_DEACTIVATED,
      });
    }
  });

  for (const [key, row] of sessionRoutes) {
    const [method, routePath] = key.split(' ') as [string, string];
    for (const isAdmin of [false, true]) {
      it(`${key} (${isAdmin ? 'admin' : 'user'}) → 401 USER_DEACTIVATED`, async () => {
        const user = await seedUser(ctx().app, { isAdmin, active: false });
        // A freshly signed, valid-signature access token.
        const { accessToken } = await startSession(ctx().app, user);
        const res = await send(
          ctx().request(),
          method,
          row.path ?? routePath,
        ).set('Authorization', `Bearer ${accessToken}`);
        expect(res.status).toBe(401);
        // HEAD has no body to check.
        if (method !== 'HEAD') expectDeactivated(res);
      });
    }
  }
});

describe('deactivation takes effect immediately', () => {
  it('an active session gets 401 USER_DEACTIVATED on the next call', async () => {
    const user = await seedUser(ctx().app, { isAdmin: true });
    const { accessToken } = await loginAs(ctx().app, user);
    const bearer = { Authorization: `Bearer ${accessToken}` };

    expect((await ctx().request().get('/api/auth/me').set(bearer)).status).toBe(
      200,
    );
    await deactivate(user.id);
    expectDeactivated(await ctx().request().get('/api/auth/me').set(bearer));
    expectDeactivated(
      await ctx().request().get('/api/admin/audit').set(bearer),
    );
  });
});

describe('POST /api/auth/google (deactivated)', () => {
  it('403 USER_DEACTIVATED, no session, user document unchanged', async () => {
    const user = await seedUser(ctx().app, { active: false });
    const before = await users().findOne({ id: user.id }).lean();
    ctx().clock.advance(60_000);

    const idToken = await makeIdToken(
      { sub: user.id, email: `changed.${user.email}` },
      { now: ctx().clock.now() },
    );
    const res = await ctx()
      .request()
      .post('/api/auth/google')
      .send({ idToken });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: ErrorCode.USER_DEACTIVATED });
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(await users().findOne({ id: user.id }).lean()).toEqual(before);
    expect(await tokens().countDocuments({ userId: user.id })).toBe(0);
  });
});

describe('POST /api/auth/refresh (deactivated)', () => {
  it('a previously valid cookie → 401 USER_DEACTIVATED, family revoked, cookie cleared', async () => {
    const user = await seedUser(ctx().app);
    const { refreshToken } = await loginAs(ctx().app, user);
    await deactivate(user.id);

    const res = await ctx()
      .request()
      .post('/api/auth/refresh')
      .set('Cookie', cookieHeader(refreshToken));

    expectDeactivated(res);
    const cleared = ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('refresh_token='));
    expect(cleared).toMatch(/^refresh_token=;.*Max-Age=0/);
    const family = await tokens().find({ userId: user.id }).lean();
    expect(family).toHaveLength(1);
    expect(family[0]).toMatchObject({
      revokedReason: RevokedReason.DEACTIVATED,
    });
    expect(family[0]!.revokedAt).toEqual(ctx().clock.now());
  });
});

describe('SessionService.revokeAllForUser (used by USR-04)', () => {
  it('revokes every live token of the user in all families, nobody else', async () => {
    const user = await seedUser(ctx().app);
    const other = await seedUser(ctx().app);
    const a = await loginAs(ctx().app, user);
    const b = await loginAs(ctx().app, user); // second browser
    const o = await loginAs(ctx().app, other);
    // An already revoked token keeps its reason.
    await ctx()
      .request()
      .post('/api/auth/logout')
      .set('Cookie', cookieHeader(b.refreshToken));
    const b2 = await loginAs(ctx().app, user);

    const revoked = await ctx()
      .app.get(SessionService)
      .revokeAllForUser(user.id, RevokedReason.DEACTIVATED);
    expect(revoked).toBe(2);

    const mine = await tokens().find({ userId: user.id }).lean();
    expect(mine.map((t) => t.revokedReason).sort()).toEqual([
      RevokedReason.DEACTIVATED,
      RevokedReason.DEACTIVATED,
      RevokedReason.LOGOUT,
    ]);
    for (const raw of [a.refreshToken, b2.refreshToken]) {
      const res = await ctx()
        .request()
        .post('/api/auth/refresh')
        .set('Cookie', cookieHeader(raw));
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        code: ErrorCode.REFRESH_TOKEN_INVALID,
      });
    }
    // The other user is untouched.
    const res = await ctx()
      .request()
      .post('/api/auth/refresh')
      .set('Cookie', cookieHeader(o.refreshToken));
    expect(res.status).toBe(200);
    // Idempotent.
    expect(
      await ctx()
        .app.get(SessionService)
        .revokeAllForUser(user.id, RevokedReason.DEACTIVATED),
    ).toBe(0);
  });
});

describe('routes without user sessions are not affected', () => {
  it('health-check, auth/config and attendance (M2M) ignore deactivation', async () => {
    const user = await seedUser(ctx().app, { active: false });
    const { accessToken } = await startSession(ctx().app, user);
    const bearer = { Authorization: `Bearer ${accessToken}` };

    expect(
      (await ctx().request().get('/health-check').set(bearer)).status,
    ).toBe(200);
    expect(
      (await ctx().request().get('/api/auth/config').set(bearer)).status,
    ).toBe(200);
    // M2M Basic: not a user session. Bad param → 400 proves the guard passed
    // without SSO / Toggl calls.
    const res = await ctx()
      .request()
      .get('/api/attendence/2024/abc')
      .set('Authorization', m2mAuth());
    expect(res.status).toBe(400);
  });
});
