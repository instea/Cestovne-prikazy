import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { ErrorCode } from '@leaves/shared/enums';
import { parseSetCookie } from 'cookie';
import type { Connection, Model } from 'mongoose';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  RefreshToken,
  RevokedReason,
} from '../../src/auth/refresh-token.schema';
import { useTestApp } from '../support/app';
import { cookieHeader, startSession } from '../support/auth';
import { seedUser } from '../support/seed';

const ctx = useTestApp({ env: { BASE_URL: 'https://instea.co/cestaky/' } });

const tokens = () =>
  ctx().app.get<Model<RefreshToken>>(getModelToken(RefreshToken.name));

function logout(raw?: string) {
  const req = ctx().request().post('/api/auth/logout');
  return raw === undefined ? req : req.set('Cookie', cookieHeader(raw));
}

function expectCleared(res: { headers: Record<string, unknown> }) {
  const lines = res.headers['set-cookie'] as string[] | undefined;
  const line = lines?.find((l) => l.startsWith('refresh_token='));
  expect(line && parseSetCookie(line)).toEqual({
    name: 'refresh_token',
    value: '',
    maxAge: 0,
    path: '/cestaky/api/auth',
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
  });
}

beforeEach(() => {
  ctx().clock.set('2026-12-21T08:00:00.000Z');
});

describe('POST /api/auth/logout (AUTH-03)', () => {
  it('revokes the family with LOGOUT and clears the cookie', async () => {
    const user = await seedUser(ctx().app);
    const first = await startSession(ctx().app, user);
    // Rotate once so the family has a ROTATED and a live token.
    const rotated = await ctx()
      .request()
      .post('/api/auth/refresh')
      .set('Cookie', cookieHeader(first.refreshToken));
    expect(rotated.status).toBe(200);
    const live = (rotated.headers['set-cookie'] as unknown as string[])
      .map((l) => parseSetCookie(l))
      .find((c) => c.name === 'refresh_token')!.value!;

    const res = await logout(live);
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(res.headers['cache-control']).toBe('no-store');
    expectCleared(res);

    const family = await tokens().find({ userId: user.id }).lean();
    expect(family).toHaveLength(2);
    expect(family.map((t) => t.revokedReason).sort()).toEqual([
      RevokedReason.LOGOUT,
      RevokedReason.ROTATED,
    ]);
    expect(family.every((t) => t.revokedAt)).toBe(true);
  });

  it('the copied token is rejected by refresh afterwards', async () => {
    const user = await seedUser(ctx().app);
    const { refreshToken } = await startSession(ctx().app, user);
    expect((await logout(refreshToken)).status).toBe(204);
    const res = await ctx()
      .request()
      .post('/api/auth/refresh')
      .set('Cookie', cookieHeader(refreshToken));
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: ErrorCode.REFRESH_TOKEN_INVALID });
  });

  it('works with an expired access token (cookie only, no Bearer)', async () => {
    const user = await seedUser(ctx().app);
    const { refreshToken, accessToken } = await startSession(ctx().app, user);
    ctx().clock.advance(60 * 60_000);
    const res = await logout(refreshToken).set(
      'Authorization',
      `Bearer ${accessToken}`,
    );
    expect(res.status).toBe(204);
    expect(
      await tokens().countDocuments({ userId: user.id, revokedAt: null }),
    ).toBe(0);
  });

  it('another browser (family) stays logged in', async () => {
    const user = await seedUser(ctx().app);
    const a = await startSession(ctx().app, user);
    const b = await startSession(ctx().app, user);
    expect((await logout(a.refreshToken)).status).toBe(204);
    const res = await ctx()
      .request()
      .post('/api/auth/refresh')
      .set('Cookie', cookieHeader(b.refreshToken));
    expect(res.status).toBe(200);
  });

  it('no cookie → 204 and a cleared cookie', async () => {
    const res = await logout();
    expect(res.status).toBe(204);
    expectCleared(res);
  });

  it('unknown token → 204, nothing revoked', async () => {
    const user = await seedUser(ctx().app);
    await startSession(ctx().app, user);
    const res = await logout('not-a-real-token');
    expect(res.status).toBe(204);
    expectCleared(res);
    expect(
      await tokens().countDocuments({ userId: user.id, revokedAt: null }),
    ).toBe(1);
  });

  it('is idempotent: a second logout with the same token → 204', async () => {
    const user = await seedUser(ctx().app);
    const { refreshToken } = await startSession(ctx().app, user);
    expect((await logout(refreshToken)).status).toBe(204);
    const revoked = await tokens().findOne({ userId: user.id }).lean();
    ctx().clock.advance(1000);
    expect((await logout(refreshToken)).status).toBe(204);
    const again = await tokens().findOne({ userId: user.id }).lean();
    expect(again?.revokedAt).toEqual(revoked?.revokedAt);
  });

  it('writes no audit entry', async () => {
    const user = await seedUser(ctx().app);
    const { refreshToken } = await startSession(ctx().app, user);
    await logout(refreshToken);
    const conn = ctx().app.get<Connection>(getConnectionToken());
    expect(await conn.collection('auditlogs').countDocuments()).toBe(0);
  });
});
