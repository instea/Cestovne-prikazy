import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  clearedRefreshCookie,
  generateRefreshToken,
  hashRefreshToken,
  readRefreshCookie,
  REFRESH_COOKIE,
  refreshCookie,
  refreshCookiePath,
} from './refresh-token';

describe('generateRefreshToken', () => {
  it('returns 32 random bytes as base64url (256 bits)', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(a, 'base64url')).toHaveLength(32);
    expect(a).not.toBe(b);
  });
});

describe('hashRefreshToken', () => {
  it('is the hex SHA-256 of the raw token', () => {
    const raw = generateRefreshToken();
    const hash = hashRefreshToken(raw);
    expect(hash).toBe(createHash('sha256').update(raw).digest('hex'));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(raw);
  });
});

describe('refreshCookiePath', () => {
  it.each([
    ['https://cestaky.instea.co', '/api/auth'],
    ['https://cestaky.instea.co/', '/api/auth'],
    ['https://instea.co/cestaky', '/cestaky/api/auth'],
    ['https://instea.co/cestaky/', '/cestaky/api/auth'],
    ['http://localhost:5173', '/api/auth'],
  ])('%s → %s', (baseUrl, path) => {
    expect(refreshCookiePath(baseUrl)).toBe(path);
  });
});

describe('refreshCookie', () => {
  const config = {
    BASE_URL: 'https://instea.co/cestaky/',
    REFRESH_TOKEN_TTL_SECONDS: 604800,
  };

  it('sets HttpOnly, Secure, SameSite=Strict, Path and Max-Age', () => {
    expect(refreshCookie('abc_-1', config)).toBe(
      'refresh_token=abc_-1; Max-Age=604800; Path=/cestaky/api/auth; HttpOnly; Secure; SameSite=Strict',
    );
  });

  it('clears with the same attributes and Max-Age=0', () => {
    expect(clearedRefreshCookie(config)).toBe(
      'refresh_token=; Max-Age=0; Path=/cestaky/api/auth; HttpOnly; Secure; SameSite=Strict',
    );
  });
});

describe('readRefreshCookie', () => {
  it('reads the refresh cookie from a Cookie header', () => {
    expect(readRefreshCookie(`a=1; ${REFRESH_COOKIE}=tok-1; b=2`)).toBe(
      'tok-1',
    );
  });

  it.each([undefined, '', 'a=1', `${REFRESH_COOKIE}=`])(
    'returns undefined for %j',
    (header) => {
      expect(readRefreshCookie(header)).toBeUndefined();
    },
  );
});
