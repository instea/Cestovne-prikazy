import { getModelToken } from '@nestjs/mongoose';
import { Logger } from '@nestjs/common';
import { ErrorCode } from '@leaves/shared/enums';
import type { SessionDto } from '@leaves/shared/dto';
import { parseSetCookie } from 'cookie';
import type { Model } from 'mongoose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RefreshToken,
  RevokedReason,
} from '../../src/auth/refresh-token.schema';
import { hashRefreshToken } from '../../src/auth/refresh-token';
import { SessionService } from '../../src/auth/session.service';
import { User } from '../../src/users/user.schema';
import { useTestApp } from '../support/app';
import { cookieHeader, startSession } from '../support/auth';
import { seedUser } from '../support/seed';

const ctx = useTestApp({
  env: { BASE_URL: 'https://instea.co/cestaky/' },
});

const PATH = '/cestaky/api/auth';
const MINUTE = 60_000;

const tokens = () =>
  ctx().app.get<Model<RefreshToken>>(getModelToken(RefreshToken.name));
const users = () => ctx().app.get<Model<User>>(getModelToken(User.name));

function refresh(raw?: string) {
  const req = ctx().request().post('/api/auth/refresh');
  return raw === undefined ? req : req.set('Cookie', cookieHeader(raw));
}

/** The `refresh_token` Set-Cookie of a response, parsed. */
function setCookie(res: { headers: Record<string, unknown> }) {
  const raw = res.headers['set-cookie'] as string[] | undefined;
  const line = raw?.find((l) => l.startsWith('refresh_token='));
  return line === undefined ? undefined : parseSetCookie(line);
}

function expectCleared(res: { headers: Record<string, unknown> }) {
  expect(setCookie(res)).toEqual({
    name: 'refresh_token',
    value: '',
    maxAge: 0,
    path: PATH,
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
  });
}

function expectError(
  res: { status: number; body: unknown },
  code: ErrorCode,
): void {
  expect(res.status).toBe(401);
  expect(res.body).toMatchObject({ statusCode: 401, code });
}

beforeEach(() => {
  ctx().clock.set('2026-12-21T08:00:00.000Z');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SessionService.startSession (used by AUTH-01 login)', () => {
  it('issues an access token, a new family and a hashed refresh token', async () => {
    const user = await seedUser(ctx().app);
    const sessions = ctx().app.get(SessionService);
    const { session, refreshToken } = await sessions.startSession(user);

    expect(session.user).toMatchObject({ id: user.id, email: user.email });
    expect(session.accessTokenExpiresAt).toBe('2026-12-21T08:15:00.000Z');
    const me = await ctx()
      .request()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(me.status).toBe(200);

    const docs = await tokens().find({ userId: user.id }).lean();
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date('2026-12-28T08:00:00.000Z'),
      revokedAt: null,
      revokedReason: null,
      replacedById: null,
    });
    expect(docs[0]!.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(docs[0]!.familyId).toMatch(/^[0-9a-f-]{36}$/);

    const second = await sessions.startSession(user);
    const familyIds = new Set(
      (await tokens().find({ userId: user.id }).lean()).map((d) => d.familyId),
    );
    expect(familyIds.size).toBe(2);
    expect(second.refreshToken).not.toBe(refreshToken);
  });
});

describe('POST /api/auth/refresh', () => {
  it('rotates: new access + refresh token, sliding expiry, cookie attributes', async () => {
    const user = await seedUser(ctx().app);
    const { refreshToken } = await startSession(ctx().app, user);
    ctx().clock.advance(14 * MINUTE);

    const res = await refresh(refreshToken);
    expect(res.status).toBe(200);
    const body = res.body as SessionDto;
    expect(body.accessTokenExpiresAt).toBe('2026-12-21T08:29:00.000Z');
    expect(body.user).toMatchObject({ id: user.id });
    expect(res.headers['cache-control']).toBe('no-store');

    const cookie = setCookie(res)!;
    expect(cookie).toEqual({
      name: 'refresh_token',
      value: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) as string,
      maxAge: 604800,
      path: PATH,
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
    });
    expect(cookie.value).not.toBe(refreshToken);

    const old = await tokens()
      .findOne({ tokenHash: hashRefreshToken(refreshToken) })
      .lean();
    const next = await tokens()
      .findOne({ tokenHash: hashRefreshToken(cookie.value!) })
      .lean();
    expect(old).toMatchObject({
      revokedReason: RevokedReason.ROTATED,
      revokedAt: new Date('2026-12-21T08:14:00.000Z'),
      replacedById: next!.id,
    });
    expect(next).toMatchObject({
      familyId: old!.familyId,
      userId: user.id,
      revokedAt: null,
      expiresAt: new Date('2026-12-28T08:14:00.000Z'),
    });

    const me = await ctx()
      .request()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${body.accessToken}`);
    expect(me.status).toBe(200);
  });

  it('stores only the SHA-256 hash, never the raw token', async () => {
    const user = await seedUser(ctx().app);
    const { refreshToken } = await startSession(ctx().app, user);
    const res = await refresh(refreshToken);
    const issued = setCookie(res)!.value!;
    const dump = JSON.stringify(await tokens().find({}).lean());
    expect(dump).not.toContain(refreshToken);
    expect(dump).not.toContain(issued);
    expect(dump).toContain(hashRefreshToken(issued));
  });

  it('follows a rotation chain of 3 in one family', async () => {
    const user = await seedUser(ctx().app);
    let { refreshToken: raw } = await startSession(ctx().app, user);
    const seen = [raw];
    for (let i = 0; i < 3; i++) {
      ctx().clock.advance(14 * MINUTE);
      const res = await refresh(raw);
      expect(res.status).toBe(200);
      raw = setCookie(res)!.value!;
      seen.push(raw);
    }
    const docs = await tokens().find({ userId: user.id }).lean();
    expect(docs).toHaveLength(4);
    expect(new Set(docs.map((d) => d.familyId)).size).toBe(1);
    const byHash = new Map(docs.map((d) => [d.tokenHash, d]));
    const chain = seen.map((r) => byHash.get(hashRefreshToken(r))!);
    for (let i = 0; i < 3; i++) {
      expect(chain[i]).toMatchObject({
        revokedReason: RevokedReason.ROTATED,
        replacedById: chain[i + 1]!.id,
      });
    }
    expect(chain[3]).toMatchObject({ revokedAt: null, replacedById: null });
  });

  it('401 REFRESH_TOKEN_MISSING without cookie, even with an access JWT as Bearer', async () => {
    const user = await seedUser(ctx().app);
    const { accessToken } = await startSession(ctx().app, user);
    const before = await tokens().countDocuments();

    const res = await refresh().set('Authorization', `Bearer ${accessToken}`);
    expectError(res, ErrorCode.REFRESH_TOKEN_MISSING);
    expect(setCookie(res)).toBeUndefined();
    expect(res.body).not.toHaveProperty('accessToken');
    expect(await tokens().countDocuments()).toBe(before);
  });

  it('forged-token regression: an expired or forged JWT never yields a token (old /refresh-jwt)', async () => {
    // Old server/auth/operations.js:29-31 re-signed `err.parsedBody.sub` of
    // any parseable token. Here a forged JWT as cookie or Bearer gets nothing.
    const header = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString(
      'base64url',
    );
    const payload = Buffer.from(
      '{"sub":"admin-1","typ":"access","iat":1,"exp":2}',
    ).toString('base64url');
    const forged = `${header}.${payload}.invalidsig`;

    const asBearer = await refresh().set('Authorization', `Bearer ${forged}`);
    expectError(asBearer, ErrorCode.REFRESH_TOKEN_MISSING);

    const asCookie = await refresh(forged);
    expectError(asCookie, ErrorCode.REFRESH_TOKEN_INVALID);
    expectCleared(asCookie);
  });

  it('401 REFRESH_TOKEN_INVALID for an unknown token, cookie cleared', async () => {
    const res = await refresh('not-a-known-token');
    expectError(res, ErrorCode.REFRESH_TOKEN_INVALID);
    expectCleared(res);
  });

  it('reuse of a rotated token → REFRESH_TOKEN_REUSED, family revoked, successor rejected, warn logged', async () => {
    const user = await seedUser(ctx().app);
    const { refreshToken: first } = await startSession(ctx().app, user);
    const other = await startSession(ctx().app, user); // another family
    const rotated = await refresh(first);
    const successor = setCookie(rotated)!.value!;
    const warn = vi.spyOn(Logger.prototype, 'warn');

    const reuse = await refresh(first);
    expectError(reuse, ErrorCode.REFRESH_TOKEN_REUSED);
    expectCleared(reuse);
    const family = (await tokens()
      .findOne({ tokenHash: hashRefreshToken(first) })
      .lean())!.familyId;
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user.id, familyId: family }),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain(first);

    const next = await tokens()
      .findOne({ tokenHash: hashRefreshToken(successor) })
      .lean();
    expect(next).toMatchObject({
      revokedReason: RevokedReason.REUSE_DETECTED,
    });
    expectError(await refresh(successor), ErrorCode.REFRESH_TOKEN_INVALID);

    // Other families of the same user are untouched.
    expect((await refresh(other.refreshToken)).status).toBe(200);
  });

  it.each([RevokedReason.LOGOUT, RevokedReason.DEACTIVATED])(
    '401 REFRESH_TOKEN_INVALID for a token revoked with %s',
    async (reason) => {
      const user = await seedUser(ctx().app);
      const { refreshToken } = await startSession(ctx().app, user);
      await tokens().updateOne(
        { tokenHash: hashRefreshToken(refreshToken) },
        { $set: { revokedAt: ctx().clock.now(), revokedReason: reason } },
      );
      const res = await refresh(refreshToken);
      expectError(res, ErrorCode.REFRESH_TOKEN_INVALID);
      expectCleared(res);
    },
  );

  it('401 REFRESH_TOKEN_EXPIRED at expiresAt (idle > 7 days), cookie cleared', async () => {
    const user = await seedUser(ctx().app);
    const { refreshToken } = await startSession(ctx().app, user);
    ctx().clock.advance(7 * 24 * 60 * MINUTE - 1);
    const stillOk = await refresh(refreshToken);
    expect(stillOk.status).toBe(200);

    const next = setCookie(stillOk)!.value!;
    ctx().clock.advance(7 * 24 * 60 * MINUTE);
    const res = await refresh(next);
    expectError(res, ErrorCode.REFRESH_TOKEN_EXPIRED);
    expectCleared(res);
  });

  it('401 REFRESH_TOKEN_INVALID when the user no longer exists', async () => {
    const user = await seedUser(ctx().app);
    const { refreshToken } = await startSession(ctx().app, user);
    await users().deleteOne({ id: user.id });
    const res = await refresh(refreshToken);
    expectError(res, ErrorCode.REFRESH_TOKEN_INVALID);
    expectCleared(res);
  });

  it('deactivated user → 401 USER_DEACTIVATED, family revoked (DEACTIVATED)', async () => {
    const user = await seedUser(ctx().app);
    const { refreshToken } = await startSession(ctx().app, user);
    const rotated = await refresh(refreshToken);
    const current = setCookie(rotated)!.value!;
    await users().updateOne(
      { id: user.id },
      { $set: { active: false, deactivatedAt: ctx().clock.now() } },
    );

    const res = await refresh(current);
    expectError(res, ErrorCode.USER_DEACTIVATED);
    expectCleared(res);
    const docs = await tokens().find({ userId: user.id }).lean();
    expect(docs.map((d) => d.revokedReason).sort()).toEqual([
      RevokedReason.DEACTIVATED,
      RevokedReason.ROTATED,
    ]);
  });

  it('two simultaneous refreshes with the same cookie: exactly one succeeds', async () => {
    const user = await seedUser(ctx().app);
    const { refreshToken } = await startSession(ctx().app, user);
    const results = await Promise.all([
      refresh(refreshToken),
      refresh(refreshToken),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 401]);
    const loser = results.find((r) => r.status === 401)!;
    expectError(loser, ErrorCode.REFRESH_TOKEN_REUSED);
  });

  it('losing the atomic rotation race is treated as reuse', async () => {
    const user = await seedUser(ctx().app);
    const { refreshToken } = await startSession(ctx().app, user);
    const sessions = ctx().app.get(SessionService);
    const model = tokens();
    const original = model.findOneAndUpdate.bind(model);
    let winner: string | undefined;
    // Between this request's read and its conditional update, another
    // request rotates the same token.
    vi.spyOn(model, 'findOneAndUpdate').mockImplementationOnce(((
      ...args: Parameters<typeof original>
    ) =>
      sessions.refresh(refreshToken).then((w) => {
        winner = w.refreshToken;
        return original(...args);
      })) as unknown as typeof original);

    await expect(sessions.refresh(refreshToken)).rejects.toMatchObject({
      code: ErrorCode.REFRESH_TOKEN_REUSED,
    });
    expect(winner).toBeDefined();
    // The family is revoked, so the winner's successor is dead too.
    await expect(sessions.refresh(winner)).rejects.toMatchObject({
      code: ErrorCode.REFRESH_TOKEN_INVALID,
    });
    const live = await model.countDocuments({
      userId: user.id,
      revokedAt: null,
    });
    expect(live).toBe(0);
  });

  it('declares a TTL index on expiresAt and unique tokenHash / id', async () => {
    await tokens().init();
    const indexes = (await tokens().listIndexes()) as {
      key: Record<string, number>;
      unique?: boolean;
      expireAfterSeconds?: number;
    }[];
    const byKey = (k: string) =>
      indexes.find((i) => Object.keys(i.key).join() === k);
    expect(byKey('expiresAt')).toMatchObject({ expireAfterSeconds: 0 });
    expect(byKey('tokenHash')).toMatchObject({ unique: true });
    expect(byKey('id')).toMatchObject({ unique: true });
    expect(byKey('userId')).toBeDefined();
    expect(byKey('familyId')).toBeDefined();
  });
});
