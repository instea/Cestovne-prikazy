import { generateKeyPairSync } from 'node:crypto';
import { getModelToken } from '@nestjs/mongoose';
import type { SessionDto } from '@leaves/shared/dto';
import { type ApiErrorBody, ErrorCode } from '@leaves/shared/enums';
import type { Model } from 'mongoose';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditLog } from '../../src/audit/audit-log.schema';
import { RefreshToken } from '../../src/auth/refresh-token.schema';
import { User } from '../../src/users/user.schema';
import { useTestApp } from '../support/app';
import { makeIdToken } from '../support/google';
import { seedUser } from '../support/seed';
import { TEST_CLOCK_START } from '../support/test-clock';

/** AUTH-01 `POST /api/auth/google` and `GET /api/auth/config`. */

const ctx = useTestApp();

const users = () => ctx().app.get<Model<User>>(getModelToken(User.name));
const tokens = () =>
  ctx().app.get<Model<RefreshToken>>(getModelToken(RefreshToken.name));
const audit = () =>
  ctx().app.get<Model<AuditLog>>(getModelToken(AuditLog.name));

let n = 0;
const uniqueSub = () => `sub-${Date.now()}-${++n}`;

const login = (idToken: unknown) =>
  ctx().request().post('/api/auth/google').send({ idToken });

const codeOf = (res: { body: unknown }) => (res.body as ApiErrorBody).code;

function refreshCookieOf(res: { headers: Record<string, unknown> }) {
  const lines = (res.headers['set-cookie'] as string[] | undefined) ?? [];
  return lines.find((l) => l.startsWith('refresh_token='));
}

beforeEach(() => {
  ctx().clock.set(TEST_CLOCK_START);
});

describe('GET /api/auth/config', () => {
  it('returns the Google client id and hosted domain', async () => {
    const res = await ctx().request().get('/api/auth/config');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      googleClientId: 'test-client-id.apps.googleusercontent.com',
      hostedDomain: 'instea.co',
    });
  });
});

describe('POST /api/auth/google', () => {
  it('registers an unknown account: 200, session, cookie, one audit entry', async () => {
    const sub = uniqueSub();
    const res = await login(
      await makeIdToken({
        sub,
        email: 'Jan.Novak.Reg@instea.co',
        given_name: 'Jan',
        family_name: 'Novák',
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.body as SessionDto;
    expect(typeof body.accessToken).toBe('string');
    expect(typeof body.accessTokenExpiresAt).toBe('string');
    expect(body).toMatchObject({
      user: {
        id: sub,
        email: 'jan.novak.reg@instea.co',
        firstName: 'Jan',
        surname: 'Novák',
        isAdmin: false,
        active: true,
      },
    });
    expect(refreshCookieOf(res)).toBeDefined();

    const stored = await users().findOne({ id: sub }).lean();
    expect(stored).toMatchObject({
      email: 'jan.novak.reg@instea.co',
      isAdmin: false,
      active: true,
      deactivatedAt: null,
      anonymizedAt: null,
    });
    const entries = await audit().find({ targetId: sub }).lean();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorType: 'user',
      actorId: sub,
      action: 'USER_REGISTERED',
      targetType: 'USER',
      details: {
        after: {
          email: 'jan.novak.reg@instea.co',
          firstName: 'Jan',
          surname: 'Novák',
          isAdmin: false,
          active: true,
        },
      },
    });
    expect(await tokens().countDocuments({ userId: sub })).toBe(1);
  });

  it('falls back to empty names when Google sends none', async () => {
    const sub = uniqueSub();
    const token = await makeIdToken({
      sub,
      email: `${sub}@instea.co`,
      given_name: undefined,
      family_name: undefined,
    });
    const res = await login(token);
    expect(res.status).toBe(200);
    const stored = await users().findOne({ id: sub }).lean();
    expect(stored?.firstName).toBe('');
    expect(stored?.surname).toBe('');
  });

  it('keeps stored names of an existing user and creates no new user', async () => {
    const user = await seedUser(ctx().app, {
      firstName: 'Edited',
      surname: 'ByAdmin',
    });
    const before = await users().countDocuments();
    const res = await login(
      await makeIdToken({
        sub: user.id,
        email: user.email,
        given_name: 'Google',
        family_name: 'Name',
      }),
    );
    expect(res.status).toBe(200);
    expect(await users().countDocuments()).toBe(before);
    const stored = await users().findOne({ id: user.id }).lean();
    expect(stored).toMatchObject({ firstName: 'Edited', surname: 'ByAdmin' });
    expect(await audit().countDocuments({ targetId: user.id })).toBe(0);
  });

  it('updates the stored email when the Google email changed', async () => {
    const user = await seedUser(ctx().app);
    const res = await login(
      await makeIdToken({ sub: user.id, email: `New.${user.email}` }),
    );
    expect(res.status).toBe(200);
    expect((res.body as SessionDto).user.email).toBe(`new.${user.email}`);
    const stored = await users().findOne({ id: user.id }).lean();
    expect(stored?.email).toBe(`new.${user.email}`);
  });

  it('409 LOGIN_FAILED when the changed email belongs to another user', async () => {
    const user = await seedUser(ctx().app);
    const other = await seedUser(ctx().app);
    const res = await login(
      await makeIdToken({ sub: user.id, email: other.email }),
    );
    expect(res.status).toBe(409);
    expect(codeOf(res)).toBe(ErrorCode.LOGIN_FAILED);
    const stored = await users().findOne({ id: user.id }).lean();
    expect(stored?.email).toBe(user.email);
    expect(await tokens().countDocuments({ userId: user.id })).toBe(0);
  });

  it('409 LOGIN_FAILED for an unknown sub whose email belongs to another user; nothing written', async () => {
    const existing = await seedUser(ctx().app);
    const sub = uniqueSub();
    const before = await users().countDocuments();
    const res = await login(
      await makeIdToken({ sub, email: existing.email.toUpperCase() }),
    );
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      statusCode: 409,
      code: ErrorCode.LOGIN_FAILED,
    });
    expect(await users().countDocuments()).toBe(before);
    expect(await audit().countDocuments({ targetId: sub })).toBe(0);
    expect(await tokens().countDocuments({ userId: sub })).toBe(0);
  });

  it.each([
    ['another domain', 'gmail.com'],
    ['no hd', null],
  ])('403 WRONG_DOMAIN for %s; nothing stored', async (_label, hd) => {
    const sub = uniqueSub();
    const res = await login(
      await makeIdToken({ sub, email: `${sub}@gmail.com`, hd }),
    );
    expect(res.status).toBe(403);
    expect(codeOf(res)).toBe(ErrorCode.WRONG_DOMAIN);
    expect(await users().countDocuments({ id: sub })).toBe(0);
    expect(refreshCookieOf(res)).toBeUndefined();
  });

  it('accepts hd in another letter case', async () => {
    const sub = uniqueSub();
    const res = await login(
      await makeIdToken({ sub, email: `${sub}@instea.co`, hd: 'INSTEA.co' }),
    );
    expect(res.status).toBe(200);
  });

  it('401 LOGIN_FAILED when email_verified is false', async () => {
    const sub = uniqueSub();
    const res = await login(
      await makeIdToken({
        sub,
        email: `${sub}@instea.co`,
        email_verified: false,
      }),
    );
    expect(res.status).toBe(401);
    expect(codeOf(res)).toBe(ErrorCode.LOGIN_FAILED);
    expect(await users().countDocuments({ id: sub })).toBe(0);
  });

  describe('401 LOGIN_FAILED for an invalid token', () => {
    const claims = () => ({ sub: uniqueSub(), email: 'x.y@instea.co' });

    it('expired', async () => {
      const res = await login(
        await makeIdToken(claims(), {
          now: new Date(Date.parse(TEST_CLOCK_START) - 2 * 3600_000),
        }),
      );
      expect(res.status).toBe(401);
      expect(codeOf(res)).toBe(ErrorCode.LOGIN_FAILED);
    });

    it('wrong audience', async () => {
      const res = await login(
        await makeIdToken({
          ...claims(),
          aud: 'other.apps.googleusercontent.com',
        }),
      );
      expect(res.status).toBe(401);
      expect(codeOf(res)).toBe(ErrorCode.LOGIN_FAILED);
    });

    it('wrong issuer', async () => {
      const res = await login(
        await makeIdToken({ ...claims(), iss: 'https://evil.example' }),
      );
      expect(res.status).toBe(401);
    });

    it('signed by another key (tampered)', async () => {
      const { privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
      });
      const key = await crypto.subtle.importKey(
        'pkcs8',
        privateKey.export({ format: 'der', type: 'pkcs8' }),
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign'],
      );
      const res = await login(await makeIdToken(claims(), { key }));
      expect(res.status).toBe(401);
      expect(codeOf(res)).toBe(ErrorCode.LOGIN_FAILED);
    });

    it('payload edited after signing', async () => {
      const token = await makeIdToken(claims());
      const [h, p, s] = token.split('.') as [string, string, string];
      const payload = JSON.parse(Buffer.from(p, 'base64url').toString()) as {
        hd: string;
      };
      payload.hd = 'other.co';
      const forged = `${h}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${s}`;
      const res = await login(forged);
      expect(res.status).toBe(401);
    });

    it('not a JWT at all', async () => {
      const res = await login('garbage');
      expect(res.status).toBe(401);
      expect(codeOf(res)).toBe(ErrorCode.LOGIN_FAILED);
    });
  });

  it('403 USER_DEACTIVATED: user unchanged, no refresh token stored', async () => {
    const user = await seedUser(ctx().app, { active: false });
    const res = await login(
      await makeIdToken({ sub: user.id, email: user.email }),
    );
    expect(res.status).toBe(403);
    expect(codeOf(res)).toBe(ErrorCode.USER_DEACTIVATED);
    const stored = await users().findOne({ id: user.id }).lean();
    expect(stored?.active).toBe(false);
    expect(await tokens().countDocuments({ userId: user.id })).toBe(0);
    expect(refreshCookieOf(res)).toBeUndefined();
  });

  it('two parallel first logins of one sub: one user, one audit entry, both 200', async () => {
    const sub = uniqueSub();
    const token = await makeIdToken({ sub, email: `${sub}@instea.co` });
    const [a, b] = await Promise.all([login(token), login(token)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await users().countDocuments({ id: sub })).toBe(1);
    expect(
      await audit().countDocuments({
        targetId: sub,
        action: 'USER_REGISTERED',
      }),
    ).toBe(1);
  });

  it.each([
    ['missing', {}],
    ['empty', { idToken: '' }],
    ['not a string', { idToken: 42 }],
    ['too long', { idToken: 'a'.repeat(4097) }],
  ])('400 VALIDATION_FAILED when idToken is %s', async (_label, body) => {
    const res = await ctx().request().post('/api/auth/google').send(body);
    expect(res.status).toBe(400);
    expect(codeOf(res)).toBe(ErrorCode.VALIDATION_FAILED);
  });
});

describe('POST /api/auth/google with the real Google verifier', () => {
  // Google's cert endpoint fails: verification cannot complete → 401.
  let certFetches = 0;
  const google = setupServer(
    http.get('https://www.googleapis.com/oauth2/*', () => {
      certFetches++;
      return HttpResponse.json({ error: 'unavailable' }, { status: 503 });
    }),
  );
  beforeAll(() => google.listen({ onUnhandledFrame: 'bypass' }));
  afterAll(() => google.close());

  const real = useTestApp({ env: { AUTH_GOOGLE_VERIFIER: 'google' } });

  it('401 LOGIN_FAILED when the Google cert fetch fails', async () => {
    const token = await makeIdToken({
      sub: uniqueSub(),
      email: 'cert.fail@instea.co',
    });
    const res = await real()
      .request()
      .post('/api/auth/google')
      .send({ idToken: token });
    expect(res.status).toBe(401);
    expect(codeOf(res)).toBe(ErrorCode.LOGIN_FAILED);
    expect(certFetches).toBeGreaterThan(0);
  });
});
