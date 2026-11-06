import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import { REFRESH_COOKIE } from '../../src/auth/refresh-token';
import { SessionService } from '../../src/auth/session.service';
import { CLOCK, type Clock } from '../../src/common/clock';
import { User } from '../../src/users/user.schema';
import { makeIdToken } from './google';

/**
 * TST-02 `loginAs(user)`: an access token obtained through the real
 * `POST /api/auth/google` path with a fake Google ID token (`makeIdToken`),
 * verified by the `AUTH_GOOGLE_VERIFIER=fake` verifier at the app clock.
 * Unknown users are registered by that login (AUTH-01).
 */
export async function loginAs(
  app: INestApplication,
  user: Pick<User, 'id' | 'email'> &
    Partial<Pick<User, 'firstName' | 'surname'>>,
): Promise<{ accessToken: string; refreshToken: string }> {
  const idToken = await makeIdToken(
    {
      sub: user.id,
      email: user.email,
      given_name: user.firstName ?? 'Jana',
      family_name: user.surname ?? 'Nová',
    },
    { now: app.get<Clock>(CLOCK).now() },
  );
  const res = await request(
    app.getHttpServer() as Parameters<typeof request>[0],
  )
    .post('/api/auth/google')
    .send({ idToken });
  if (res.status !== 200) {
    throw new Error(
      `loginAs ${user.id}: ${res.status} ${JSON.stringify(res.body)}`,
    );
  }
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = cookies.find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
  const refreshToken = cookie?.split(';')[0]?.split('=')[1] ?? '';
  return {
    accessToken: (res.body as { accessToken: string }).accessToken,
    refreshToken,
  };
}

/**
 * AUTH-02: a session for `user` straight from `SessionService.startSession`
 * (what AUTH-01 login calls after Google verification). For tests of the
 * session layer itself; route tests should prefer `loginAs`.
 */
export async function startSession(
  app: INestApplication,
  user: Pick<User, 'id'>,
): Promise<{ accessToken: string; refreshToken: string }> {
  const users = app.get<Model<User>>(getModelToken(User.name));
  const doc = await users.findOne({ id: user.id }).lean();
  if (!doc) throw new Error(`startSession: no user ${user.id}`);
  const { session, refreshToken } = await app
    .get(SessionService)
    .startSession(doc);
  return { accessToken: session.accessToken, refreshToken };
}

/** `Cookie` header value carrying the refresh token. */
export function cookieHeader(refreshToken: string): string {
  return `${REFRESH_COOKIE}=${refreshToken}`;
}
