import { ErrorCode } from '@leaves/shared/enums';
import { SignJWT, UnsecuredJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { AppException } from '../common/app-exception';
import type { Clock } from '../common/clock';
import type { AppConfig } from '../config/env.schema';
import { AccessTokenService } from './access-token.service';

const SECRET = 'unit-test-access-secret-'.padEnd(40, 'x');
const START = new Date('2026-12-21T09:00:00.000Z');

function setup(ttl = 900) {
  let now = START.getTime();
  const clock: Clock = { now: () => new Date(now) };
  const config = {
    JWT_ACCESS_SECRET: SECRET,
    ACCESS_TOKEN_TTL_SECONDS: ttl,
  } as AppConfig;
  return {
    service: new AccessTokenService(config, clock),
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const key = (secret = SECRET) => new TextEncoder().encode(secret);
const iat = Math.floor(START.getTime() / 1000);

async function codeOf(p: Promise<unknown>): Promise<string> {
  const e = await p.then(
    () => undefined,
    (x: unknown) => x,
  );
  expect(e).toBeInstanceOf(AppException);
  expect((e as AppException).getStatus()).toBe(401);
  return (e as AppException).code;
}

describe('AccessTokenService', () => {
  it('signs HS256 with sub, typ=access, iat and exp = iat + TTL', async () => {
    const { service } = setup();
    const { token, expiresAt } = await service.sign('user-1');
    expect(expiresAt.toISOString()).toBe('2026-12-21T09:15:00.000Z');

    const [header, payload] = token
      .split('.')
      .slice(0, 2)
      .map((p) => JSON.parse(Buffer.from(p, 'base64url').toString()) as object);
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(payload).toEqual({
      sub: 'user-1',
      typ: 'access',
      iat,
      exp: iat + 900,
    });
    await expect(service.verify(token)).resolves.toBe('user-1');
  });

  it('accepts the token until just before exp, then ACCESS_TOKEN_EXPIRED', async () => {
    const { service, advance } = setup();
    const { token } = await service.sign('user-1');
    advance(899_000);
    await expect(service.verify(token)).resolves.toBe('user-1');
    advance(1_000);
    expect(await codeOf(service.verify(token))).toBe(
      ErrorCode.ACCESS_TOKEN_EXPIRED,
    );
  });

  it('rejects a token signed with another key', async () => {
    const { service } = setup();
    const forged = await new SignJWT({ typ: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-1')
      .setIssuedAt(iat)
      .setExpirationTime(iat + 900)
      .sign(key('another-secret-of-at-least-32-bytes!!'));
    expect(await codeOf(service.verify(forged))).toBe(
      ErrorCode.ACCESS_TOKEN_INVALID,
    );
  });

  it('rejects alg:none', async () => {
    const { service } = setup();
    const unsecured = new UnsecuredJWT({ typ: 'access' })
      .setSubject('user-1')
      .setIssuedAt(iat)
      .setExpirationTime(iat + 900)
      .encode();
    expect(await codeOf(service.verify(unsecured))).toBe(
      ErrorCode.ACCESS_TOKEN_INVALID,
    );
  });

  it('rejects a modified sub (signature no longer matches)', async () => {
    const { service } = setup();
    const { token } = await service.sign('user-1');
    const [h, , s] = token.split('.');
    const payload = Buffer.from(
      JSON.stringify({ sub: 'admin-1', typ: 'access', iat, exp: iat + 900 }),
    ).toString('base64url');
    expect(await codeOf(service.verify(`${h}.${payload}.${s}`))).toBe(
      ErrorCode.ACCESS_TOKEN_INVALID,
    );
  });

  it('rejects another alg even with the right key (HS512)', async () => {
    const { service } = setup();
    const token = await new SignJWT({ typ: 'access' })
      .setProtectedHeader({ alg: 'HS512' })
      .setSubject('user-1')
      .setIssuedAt(iat)
      .setExpirationTime(iat + 900)
      .sign(key(SECRET.padEnd(64, 'y')));
    expect(await codeOf(service.verify(token))).toBe(
      ErrorCode.ACCESS_TOKEN_INVALID,
    );
  });

  it.each([
    ['wrong typ', { typ: 'refresh', sub: 'user-1' }],
    ['missing typ', { sub: 'user-1' }],
    ['missing sub', { typ: 'access' }],
    ['non-string sub', { typ: 'access', sub: 42 }],
  ])('rejects %s', async (_name, claims) => {
    const { service } = setup();
    const token = await new SignJWT(claims as Record<string, unknown>)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(iat)
      .setExpirationTime(iat + 900)
      .sign(key());
    expect(await codeOf(service.verify(token))).toBe(
      ErrorCode.ACCESS_TOKEN_INVALID,
    );
  });

  it('rejects a token without exp', async () => {
    const { service } = setup();
    const token = await new SignJWT({ typ: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-1')
      .setIssuedAt(iat)
      .sign(key());
    expect(await codeOf(service.verify(token))).toBe(
      ErrorCode.ACCESS_TOKEN_INVALID,
    );
  });

  it.each(['', 'garbage', 'a.b.c', 'a.b'])(
    'rejects malformed %j',
    async (t) => {
      const { service } = setup();
      expect(await codeOf(service.verify(t))).toBe(
        ErrorCode.ACCESS_TOKEN_INVALID,
      );
    },
  );

  it('checks the signature before expiry (expired forgery is INVALID)', async () => {
    const { service, advance } = setup();
    const forged = await new SignJWT({ typ: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-1')
      .setIssuedAt(iat)
      .setExpirationTime(iat + 900)
      .sign(key('another-secret-of-at-least-32-bytes!!'));
    advance(3_600_000);
    expect(await codeOf(service.verify(forged))).toBe(
      ErrorCode.ACCESS_TOKEN_INVALID,
    );
  });
});
