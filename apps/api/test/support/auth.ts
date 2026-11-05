import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { REFRESH_COOKIE } from '../../src/auth/refresh-token';
import { SessionService } from '../../src/auth/session.service';
import { User } from '../../src/users/user.schema';

/**
 * TODO(AUTH-01): `FakeGoogleVerifier` + `loginAs(user)`.
 *
 * TST-02 wants `loginAs(user)` to return an access token obtained through
 * `POST /api/auth/google` with a fake Google ID token (format: TST-03 /
 * TST-04 `makeIdToken`), verified by the `AUTH_GOOGLE_VERIFIER=fake`
 * verifier, so the real auth path runs. Neither the endpoint nor the
 * verifier exists before AUTH-01, so this stub fails loudly instead of
 * minting tokens that would bypass that path.
 */
export function loginAs(user?: { id: string; email: string }): Promise<string> {
  void user;
  return Promise.reject(
    new Error(
      'TODO(AUTH-01): loginAs needs POST /api/auth/google and FakeGoogleVerifier',
    ),
  );
}

/**
 * AUTH-02: a session for `user` straight from `SessionService.startSession`
 * (what AUTH-01 login calls after Google verification). For tests of the
 * session layer itself; route tests should use `loginAs` once AUTH-01 exists.
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
