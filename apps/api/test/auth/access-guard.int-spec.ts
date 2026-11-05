import { Controller, Get, Module } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import type { UserDto } from '@leaves/shared/dto';
import { ErrorCode } from '@leaves/shared/enums';
import { SignJWT, UnsecuredJWT } from 'jose';
import type { Model } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { type AuthUser, CurrentUser } from '../../src/auth/auth-user';
import { Public } from '../../src/auth/public.decorator';
import { AppException } from '../../src/common/app-exception';
import { User } from '../../src/users/user.schema';
import { useTestApp } from '../support/app';
import { TEST_ENV } from '../support/env';
import { startSession } from '../support/auth';
import { seedUser } from '../support/seed';

/**
 * Probe routes: an admin-only route (role read from `request.user`, which the
 * guard fills from the DB) and a public one.
 * TODO(NFR-01): real admin routes use `@Roles('admin')` + `RolesGuard`.
 */
@Controller('api/test/guard')
class ProbeController {
  @Get('admin')
  admin(@CurrentUser() user: AuthUser): AuthUser {
    if (!user.isAdmin)
      throw new AppException(403, ErrorCode.FORBIDDEN, 'Admin only');
    return user;
  }

  @Public()
  @Get('public')
  open(): { ok: true } {
    return { ok: true };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

const ctx = useTestApp({ imports: [ProbeModule] });

const key = (secret = TEST_ENV.JWT_ACCESS_SECRET!) =>
  new TextEncoder().encode(secret);
const nowSec = () => Math.floor(ctx().clock.now().getTime() / 1000);

function me(authorization?: string) {
  const req = ctx().request().get('/api/auth/me');
  return authorization === undefined
    ? req
    : req.set('Authorization', authorization);
}

function expect401(res: { status: number; body: unknown }, code: ErrorCode) {
  expect(res.status).toBe(401);
  expect(res.body).toEqual({
    statusCode: 401,
    code,
    message: expect.any(String) as string,
  });
}

describe('GET /api/auth/me', () => {
  it('returns the caller as UserDto', async () => {
    const user = await seedUser(ctx().app, { firstName: 'Eva' });
    const { accessToken } = await startSession(ctx().app, user);
    const res = await me(`Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    const body = res.body as UserDto;
    expect(body).toMatchObject({
      id: user.id,
      email: user.email,
      firstName: 'Eva',
      isAdmin: false,
      active: true,
    });
    expect(body).not.toHaveProperty('_id');
  });
});

describe('access-token guard', () => {
  it.each([
    ['no header', undefined],
    ['empty', ''],
    ['Basic scheme', 'Basic dXNlcjpwYXNz'],
    ['Bearer without token', 'Bearer '],
    ['token without scheme', 'abc.def.ghi'],
  ])('401 AUTH_REQUIRED: %s', async (_name, header) => {
    expect401(await me(header), ErrorCode.AUTH_REQUIRED);
  });

  it('401 ACCESS_TOKEN_EXPIRED after the access TTL', async () => {
    const user = await seedUser(ctx().app);
    const { accessToken } = await startSession(ctx().app, user);
    ctx().clock.advance(15 * 60_000);
    expect401(
      await me(`Bearer ${accessToken}`),
      ErrorCode.ACCESS_TOKEN_EXPIRED,
    );
  });

  it('401 ACCESS_TOKEN_INVALID for a token signed with another key', async () => {
    const user = await seedUser(ctx().app);
    const forged = await new SignJWT({ typ: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuedAt(nowSec())
      .setExpirationTime(nowSec() + 900)
      .sign(key('attacker-secret-attacker-secret-attacker'));
    expect401(await me(`Bearer ${forged}`), ErrorCode.ACCESS_TOKEN_INVALID);
  });

  it('401 ACCESS_TOKEN_INVALID for alg:none', async () => {
    const user = await seedUser(ctx().app);
    const unsecured = new UnsecuredJWT({ typ: 'access' })
      .setSubject(user.id)
      .setIssuedAt(nowSec())
      .setExpirationTime(nowSec() + 900)
      .encode();
    expect401(await me(`Bearer ${unsecured}`), ErrorCode.ACCESS_TOKEN_INVALID);
  });

  it('401 ACCESS_TOKEN_INVALID for a modified sub (old forgery)', async () => {
    const user = await seedUser(ctx().app);
    const admin = await seedUser(ctx().app, { isAdmin: true });
    const { accessToken } = await startSession(ctx().app, user);
    const [h, p, s] = accessToken.split('.') as [string, string, string];
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString()) as {
      sub: string;
    };
    claims.sub = admin.id;
    const edited = Buffer.from(JSON.stringify(claims)).toString('base64url');
    expect401(
      await me(`Bearer ${h}.${edited}.${s}`),
      ErrorCode.ACCESS_TOKEN_INVALID,
    );
  });

  it('401 ACCESS_TOKEN_INVALID for typ other than access', async () => {
    const user = await seedUser(ctx().app);
    const token = await new SignJWT({ typ: 'refresh' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuedAt(nowSec())
      .setExpirationTime(nowSec() + 900)
      .sign(key());
    expect401(await me(`Bearer ${token}`), ErrorCode.ACCESS_TOKEN_INVALID);
  });

  it('401 ACCESS_TOKEN_INVALID when sub has no user', async () => {
    const token = await new SignJWT({ typ: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('no-such-user')
      .setIssuedAt(nowSec())
      .setExpirationTime(nowSec() + 900)
      .sign(key());
    expect401(await me(`Bearer ${token}`), ErrorCode.ACCESS_TOKEN_INVALID);
  });

  it('401 USER_DEACTIVATED for a valid token of a deactivated user', async () => {
    const user = await seedUser(ctx().app);
    const { accessToken } = await startSession(ctx().app, user);
    await ctx()
      .app.get<Model<User>>(getModelToken(User.name))
      .updateOne(
        { id: user.id },
        { $set: { active: false, deactivatedAt: ctx().clock.now() } },
      );
    expect401(await me(`Bearer ${accessToken}`), ErrorCode.USER_DEACTIVATED);
  });

  it('reads the admin flag from the DB on every request (403 after removal)', async () => {
    const admin = await seedUser(ctx().app, { isAdmin: true });
    const { accessToken } = await startSession(ctx().app, admin);
    const call = () =>
      ctx()
        .request()
        .get('/api/test/guard/admin')
        .set('Authorization', `Bearer ${accessToken}`);

    const before = await call();
    expect(before.status).toBe(200);
    expect(before.body).toEqual({ id: admin.id, isAdmin: true, active: true });

    await ctx()
      .app.get<Model<User>>(getModelToken(User.name))
      .updateOne({ id: admin.id }, { $set: { isAdmin: false } });
    const after = await call();
    expect(after.status).toBe(403);
    expect(after.body).toMatchObject({ code: ErrorCode.FORBIDDEN });
  });

  it('lets @Public() routes through without a token', async () => {
    const res = await ctx().request().get('/api/test/guard/public');
    expect(res.status).toBe(200);
  });

  it('accepts a lowercase bearer scheme', async () => {
    const user = await seedUser(ctx().app);
    const { accessToken } = await startSession(ctx().app, user);
    expect((await me(`bearer ${accessToken}`)).status).toBe(200);
  });
});
