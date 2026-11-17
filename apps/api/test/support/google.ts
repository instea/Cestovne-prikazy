import { readFileSync } from 'node:fs';
import path from 'node:path';
import { importJWK, type JWK, SignJWT } from 'jose';
import { TEST_ENV } from './env';
import { TEST_CLOCK_START } from './test-clock';

/**
 * AUTH-01 / TST-04: signs Google-shaped ID tokens with the TEST-ONLY private
 * key that `FakeGoogleVerifier` (`AUTH_GOOGLE_VERIFIER=fake`) trusts.
 */

const KEY_FILE = path.resolve(
  __dirname,
  '../../../../packages/shared/test-fixtures/google/fake-google-key.json',
);

export const FAKE_GOOGLE_PRIVATE_JWK = (
  JSON.parse(readFileSync(KEY_FILE, 'utf8')) as { privateJwk: JWK }
).privateJwk;

const privateKey = importJWK(FAKE_GOOGLE_PRIVATE_JWK, 'RS256');

export interface IdTokenClaims {
  sub: string;
  email: string;
  email_verified?: boolean;
  /** `null` omits the claim (consumer account). */
  hd?: string | null;
  given_name?: string;
  family_name?: string;
  aud?: string;
  iss?: string;
}

export interface IdTokenOptions {
  /** `iat`; default: the TestClock start. */
  now?: Date | string;
  /** Lifetime in seconds (Google: 3600). Negative → already expired. */
  ttlSeconds?: number;
  /** Sign with another key (tampered / unknown signer). */
  key?: Parameters<SignJWT['sign']>[0];
  kid?: string;
}

/** Defaults to a verified `instea.co` account for `GOOGLE_CLIENT_ID`. */
export async function makeIdToken(
  claims: IdTokenClaims,
  options: IdTokenOptions = {},
): Promise<string> {
  const iat = Math.floor(
    new Date(options.now ?? TEST_CLOCK_START).getTime() / 1000,
  );
  const { hd = 'instea.co', aud, iss, ...rest } = claims;
  const payload: Record<string, unknown> = {
    email_verified: true,
    given_name: 'Jana',
    family_name: 'Nová',
    ...rest,
  };
  if (hd !== null) payload.hd = hd;
  return new SignJWT(payload)
    .setProtectedHeader({
      alg: 'RS256',
      kid: options.kid ?? FAKE_GOOGLE_PRIVATE_JWK.kid ?? 'fake-google-key-1',
      typ: 'JWT',
    })
    .setIssuer(iss ?? 'https://accounts.google.com')
    .setAudience(aud ?? TEST_ENV.GOOGLE_CLIENT_ID!)
    .setIssuedAt(iat)
    .setExpirationTime(iat + (options.ttlSeconds ?? 3600))
    .sign(options.key ?? (await privateKey));
}
