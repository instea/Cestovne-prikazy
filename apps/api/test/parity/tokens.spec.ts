import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AccessTokenService } from '../../src/auth/access-token.service';
import type { AppConfig } from '../../src/config/env.schema';
import { newAppToken, oldAppToken, signHs256 } from './tokens.mts';

const SECRET = 'parity-secret-at-least-32-bytes-long-xxxxxxxx';
const NOW = new Date('2026-11-13T10:00:00Z');

const service = (now: Date) =>
  new AccessTokenService(
    { JWT_ACCESS_SECRET: SECRET, ACCESS_TOKEN_TTL_SECONDS: 900 } as AppConfig,
    { now: () => now },
  );

const decode = (part: string) =>
  JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as unknown;

describe('parity session tokens (MIG-03 leave list)', () => {
  it('signs a new-app access token the app itself accepts', async () => {
    await expect(
      service(NOW).verify(newAppToken('1001', SECRET, NOW)),
    ).resolves.toBe('1001');
  });

  it('is refused by the new app when signed with another key or expired', async () => {
    await expect(
      service(NOW).verify(newAppToken('1001', `${SECRET}-other`, NOW)),
    ).rejects.toMatchObject({ code: 'ACCESS_TOKEN_INVALID' });
    const later = new Date(NOW.getTime() + 16 * 60_000);
    await expect(
      service(later).verify(newAppToken('1001', SECRET, NOW)),
    ).rejects.toMatchObject({ code: 'ACCESS_TOKEN_EXPIRED' });
  });

  it('signs an old-app token as { sub } with the key.pem bytes (HS256)', () => {
    const token = oldAppToken('1001', 'abc123');
    const [head, body, sig] = token.split('.') as [string, string, string];
    expect(decode(head)).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(decode(body)).toEqual({ sub: '1001' });
    expect(sig).toBe(
      createHmac('sha256', 'abc123')
        .update(`${head}.${body}`)
        .digest('base64url'),
    );
  });

  it('produces a compact JWT of the payload', () => {
    const token = signHs256({ a: 1 }, 'k');
    expect(token.split('.')).toHaveLength(3);
    expect(decode(token.split('.')[1]!)).toEqual({ a: 1 });
  });
});
