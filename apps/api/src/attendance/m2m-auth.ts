import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * ATT-01 M2M HTTP Basic authentication, 1:1 with the old `basic-auth` 2.0.1
 * parsing: scheme `Basic` (case-insensitive), base64 credentials split at
 * the first `:` (passwords may contain `:`).
 */

export interface BasicCredentials {
  username: string;
  password: string;
}

/** `basic-auth` 2.0.1 header and user-pass grammar. */
const CREDENTIALS = /^ *[Bb][Aa][Ss][Ii][Cc] +([A-Za-z0-9._~+/-]+=*) *$/;
const USER_PASS = /^([^:]*):(.*)$/;

/** `null` when the header is missing, not Basic or not `user:pass`. */
export function parseBasicAuth(
  header: string | undefined,
): BasicCredentials | null {
  if (typeof header !== 'string') return null;
  const match = CREDENTIALS.exec(header);
  if (!match) return null;
  const decoded = Buffer.from(match[1]!, 'base64').toString();
  const userPass = USER_PASS.exec(decoded);
  if (!userPass) return null;
  return { username: userPass[1]!, password: userPass[2]! };
}

export type TimingSafeEqual = (a: Buffer, b: Buffer) => boolean;

const digest = (value: string): Buffer =>
  createHash('sha256').update(value, 'utf8').digest();

/**
 * Constant-time check (client answer Q-S6): both fields are compared over
 * equal-length SHA-256 digests, always both, then ANDed. Access requires
 * both configured values to be non-empty (old truthiness check).
 */
export function m2mCredentialsMatch(
  expected: { username: string | undefined; password: string | undefined },
  given: BasicCredentials | null,
  equal: TimingSafeEqual = timingSafeEqual,
): boolean {
  if (!expected.username || !expected.password || !given) return false;
  const userOk = equal(digest(given.username), digest(expected.username));
  const passOk = equal(digest(given.password), digest(expected.password));
  return userOk && passOk;
}
