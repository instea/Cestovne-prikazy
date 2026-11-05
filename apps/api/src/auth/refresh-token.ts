import { createHash, randomBytes } from 'node:crypto';
import { parseCookie, stringifySetCookie } from 'cookie';
import type { AppConfig } from '../config/env.schema';

/** AUTH-02 refresh cookie name. */
export const REFRESH_COOKIE = 'refresh_token';

/** Raw refresh token: 32 random bytes, base64url. Never stored or logged. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Stored form of a refresh token: hex SHA-256. */
export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** `<BASE_URL pathname without trailing slash>/api/auth`. */
export function refreshCookiePath(baseUrl: string): string {
  return `${new URL(baseUrl).pathname.replace(/\/+$/, '')}/api/auth`;
}

type CookieConfig = Pick<AppConfig, 'BASE_URL' | 'REFRESH_TOKEN_TTL_SECONDS'>;

function setCookie(value: string, maxAge: number, baseUrl: string): string {
  return stringifySetCookie({
    name: REFRESH_COOKIE,
    value,
    maxAge,
    path: refreshCookiePath(baseUrl),
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
  });
}

/** `Set-Cookie` value carrying a new refresh token. */
export function refreshCookie(raw: string, config: CookieConfig): string {
  return setCookie(raw, config.REFRESH_TOKEN_TTL_SECONDS, config.BASE_URL);
}

/** `Set-Cookie` value that deletes the refresh cookie (same attributes). */
export function clearedRefreshCookie(config: CookieConfig): string {
  return setCookie('', 0, config.BASE_URL);
}

/** The refresh token from a `Cookie` request header, if any. */
export function readRefreshCookie(
  header: string | undefined,
): string | undefined {
  if (!header) return undefined;
  return parseCookie(header)[REFRESH_COOKIE] || undefined;
}
