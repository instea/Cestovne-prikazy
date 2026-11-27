import { getConnectionToken } from '@nestjs/mongoose';
import { ErrorCode } from '@leaves/shared/enums';
import type { Connection } from 'mongoose';
import { beforeEach, describe, expect, it } from 'vitest';
import { hashRefreshToken } from '../../src/auth/refresh-token';
import { useTestApp } from '../support/app';
import { cookieHeader, loginAs } from '../support/auth';
import { seedUser } from '../support/seed';

/**
 * NFR-02 secure sessions. Most targets are proven where the mechanism lives;
 * this file adds the remaining cross-cutting checks.
 *
 * | Target | Test |
 * |---|---|
 * | Access JWT ≤ TTL, HS256 only, `alg` pinned, `typ=access` | `src/auth/access-token.service.spec.ts`; API level `test/auth/access-guard.int-spec.ts` (wrong key, `alg:none`, edited payload, `typ` ≠ access → 401; expired → 401 `ACCESS_TOKEN_EXPIRED`) |
 * | `JWT_ACCESS_SECRET` ≥ 32 bytes, `HOSTED_DOMAIN` required, `fake` verifier refused in production — boot fails | `src/config/env.schema.spec.ts`; exit on invalid config `test/health/process.int-spec.ts` |
 * | Access token never in storage, cookies or URLs | web `src/pages/LoginPage.spec.tsx` (after login: storage, cookies, URL) |
 * | Refresh token ≥ 256 bits | `src/auth/refresh-token.spec.ts` |
 * | Refresh stored only as SHA-256 | `test/auth/session.int-spec.ts`; whole-DB scan below |
 * | Cookie `HttpOnly; Secure; SameSite=Strict; Path=<base>/api/auth` | `src/auth/refresh-token.spec.ts`, `test/auth/session.int-spec.ts` |
 * | Single-use rotation, reuse revokes the family | `test/auth/session.int-spec.ts` |
 * | Revoked on logout / deactivation | `test/auth/logout.int-spec.ts`, `test/auth/deactivated.int-spec.ts` |
 * | Refresh never accepts an access JWT (old forgery) | `test/auth/session.int-spec.ts` (forged JWT as cookie / Bearer); valid JWT below |
 * | Google token: signature, `aud`, `iss`, `exp`, `email_verified`, `hd` | `test/contract/google.contract.int-spec.ts`, `test/auth/google-login.int-spec.ts` |
 * | Admin flag / active read from the DB per request | `test/auth/access-guard.int-spec.ts` (demoted → 403), `test/auth/deactivated.int-spec.ts` |
 * | No token values in logs | `test/http.int-spec.ts` (authorization, cookie, set-cookie, idToken redacted) |
 */

const ctx = useTestApp();

beforeEach(() => {
  ctx().clock.set('2026-12-21T08:00:00.000Z');
});

describe('NFR-02 secure sessions', () => {
  it('refresh rejects a valid access JWT sent as the refresh cookie', async () => {
    const user = await seedUser(ctx().app);
    const { accessToken } = await loginAs(ctx().app, user);

    const res = await ctx()
      .request()
      .post('/api/auth/refresh')
      .set('Cookie', cookieHeader(accessToken));

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: ErrorCode.REFRESH_TOKEN_INVALID });
    expect((res.body as { accessToken?: string }).accessToken).toBeUndefined();
  });

  it('no collection stores a raw refresh token or an access token', async () => {
    const user = await seedUser(ctx().app);
    const { accessToken, refreshToken } = await loginAs(ctx().app, user);
    expect(refreshToken).not.toBe('');

    const db = ctx().app.get<Connection>(getConnectionToken()).db!;
    const dump: string[] = [];
    for (const { name } of await db.listCollections().toArray()) {
      const docs = await db.collection(name).find().toArray();
      dump.push(JSON.stringify(docs));
    }
    const all = dump.join('\n');
    expect(all).not.toContain(refreshToken);
    expect(all).not.toContain(accessToken);
    // Only the hash is stored.
    expect(all).toContain(hashRefreshToken(refreshToken));
  });
});
