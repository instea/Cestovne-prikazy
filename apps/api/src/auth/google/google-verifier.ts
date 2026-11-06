/**
 * AUTH-01: verification of a Google ID token. The implementation is chosen
 * by `AUTH_GOOGLE_VERIFIER`: `google` (real, `google-auth-library`) or
 * `fake` (contract mock with a local test key; refused in production).
 */

/** Injection token of the active `GoogleVerifier`. */
export const GOOGLE_VERIFIER = Symbol('GOOGLE_VERIFIER');

/** The claims AUTH-01 uses from a verified token. */
export interface GoogleIdentity {
  sub: string;
  email: string;
  /** `email_verified === true` only. */
  emailVerified: boolean;
  /** Hosted domain (`hd`); missing for consumer accounts. */
  hostedDomain: string | undefined;
  givenName: string | undefined;
  familyName: string | undefined;
}

export interface GoogleVerifier {
  /**
   * Verifies signature, `aud` (= `GOOGLE_CLIENT_ID`), `iss` and `exp`.
   * Rejects on any failure, including a failed Google cert fetch.
   */
  verify(idToken: string): Promise<GoogleIdentity>;
}

/** Google's documented issuers. */
export const GOOGLE_ISSUERS = [
  'accounts.google.com',
  'https://accounts.google.com',
] as const;

const str = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : undefined;

/**
 * Maps a verified payload. Throws when `sub` or `email` is missing: such a
 * token cannot identify a user.
 */
export function identityFromPayload(
  payload: Record<string, unknown>,
): GoogleIdentity {
  const sub = str(payload.sub);
  const email = str(payload.email);
  if (!sub || !email) throw new Error('ID token has no sub or email');
  return {
    sub,
    email,
    emailVerified: payload.email_verified === true,
    hostedDomain: str(payload.hd),
    givenName: str(payload.given_name),
    familyName: str(payload.family_name),
  };
}
