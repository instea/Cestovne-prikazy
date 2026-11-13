/**
 * MIG-03 leave-list parity: session tokens for both apps, signed by the
 * harness. Both apps verify HS256 JWTs with a secret the harness controls
 * (old: `secrets/key.pem`, mounted from the work dir; new:
 * `JWT_ACCESS_SECRET` in the compose file), so the harness signs in as any
 * user without Google.
 */
import { createHmac } from 'node:crypto';

const b64url = (data: string | Buffer) =>
  Buffer.from(data).toString('base64url');

/** Compact HS256 JWT of `payload`. */
export function signHs256(
  payload: Record<string, unknown>,
  key: string,
): string {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', key)
    .update(`${head}.${body}`)
    .digest('base64url');
  return `${head}.${body}.${sig}`;
}

/**
 * Old app session (`server/auth/operations.js` `createJwt`): `{ sub }`,
 * HMAC key = the bytes of `secrets/key.pem`. No `exp`: express-jwt 5 only
 * checks it when present.
 */
export const oldAppToken = (userId: string, keyPem: string): string =>
  signHs256({ sub: userId }, keyPem);

/**
 * New app access token (AUTH-02, `access-token.service.ts`):
 * `{ sub, typ: "access", iat, exp }`, valid for 15 minutes from `now`.
 */
export function newAppToken(
  userId: string,
  secret: string,
  now: Date = new Date(),
): string {
  const iat = Math.floor(now.getTime() / 1000);
  return signHs256(
    { typ: 'access', sub: userId, iat, exp: iat + 15 * 60 },
    secret,
  );
}
