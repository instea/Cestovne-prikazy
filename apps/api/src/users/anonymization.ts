import { randomBytes } from 'node:crypto';

/**
 * NFR-08 pure rules of GDPR anonymization: placeholder identity, the
 * confirm-email comparison and the token pick on a unique-email collision.
 */

/** Domain of every placeholder email (`.invalid` TLD, RFC 2606: never deliverable). */
export const PLACEHOLDER_EMAIL_DOMAIN = 'anonymized.invalid';

/** First name of every anonymized user. */
export const PLACEHOLDER_FIRST_NAME = 'Anonymized';

/** Regenerations after the first token collides (then 500 `INTERNAL_ERROR`). */
export const PLACEHOLDER_TOKEN_RETRIES = 3;

/** 8 lowercase hex characters from a CSPRNG. */
export function generatePlaceholderToken(): string {
  return randomBytes(4).toString('hex');
}

/** `anonymized-<token>@anonymized.invalid`. */
export const placeholderEmail = (token: string): string =>
  `anonymized-${token}@${PLACEHOLDER_EMAIL_DOMAIN}`;

/** The User fields that replace the personal data (DATA-01 / NFR-08 table). */
export function placeholderIdentity(token: string): {
  email: string;
  firstName: string;
  surname: string;
} {
  return {
    email: placeholderEmail(token),
    firstName: PLACEHOLDER_FIRST_NAME,
    surname: `User ${token}`,
  };
}

/**
 * The admin typed the stored email: `confirmEmail.trim().toLowerCase()`
 * equals it (stored emails are lowercase, DATA-01).
 */
export const confirmEmailMatches = (
  confirmEmail: string,
  storedEmail: string,
): boolean => confirmEmail.trim().toLowerCase() === storedEmail;

/** Thrown when every candidate token collides; maps to 500 `INTERNAL_ERROR`. */
export class PlaceholderCollisionError extends Error {
  constructor(attempts: number) {
    super(`No free placeholder email after ${attempts} attempts`);
    this.name = 'PlaceholderCollisionError';
  }
}

/**
 * A token whose placeholder email no user has: the first one, else up to
 * `PLACEHOLDER_TOKEN_RETRIES` regenerations. Throws
 * `PlaceholderCollisionError` when all of them are taken.
 */
export async function pickPlaceholderToken(
  isEmailTaken: (email: string) => Promise<boolean>,
  generate: () => string = generatePlaceholderToken,
): Promise<string> {
  const attempts = 1 + PLACEHOLDER_TOKEN_RETRIES;
  for (let i = 0; i < attempts; i++) {
    const token = generate();
    if (!(await isEmailTaken(placeholderEmail(token)))) return token;
  }
  throw new PlaceholderCollisionError(attempts);
}
