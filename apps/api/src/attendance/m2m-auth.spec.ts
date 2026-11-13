import { timingSafeEqual } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { m2mCredentialsMatch, parseBasicAuth } from './m2m-auth';

const b64 = (s: string) => Buffer.from(s).toString('base64');
const expected = { username: 'm2m', password: 'p:ss' };

describe('parseBasicAuth (basic-auth 2.0.1 grammar)', () => {
  it.each([
    [`Basic ${b64('m2m:p:ss')}`, { username: 'm2m', password: 'p:ss' }],
    [`basic ${b64('m2m:pw')}`, { username: 'm2m', password: 'pw' }],
    [`BASIC ${b64('m2m:pw')}`, { username: 'm2m', password: 'pw' }],
    [`  Basic   ${b64('m2m:pw')}  `, { username: 'm2m', password: 'pw' }],
    [`Basic ${b64('m2m:')}`, { username: 'm2m', password: '' }],
    [`Basic ${b64(':pw')}`, { username: '', password: 'pw' }],
  ])('%s → credentials', (header, creds) => {
    expect(parseBasicAuth(header)).toEqual(creds);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['Bearer scheme', 'Bearer abc.def.ghi'],
    ['no credentials', 'Basic'],
    ['no colon', `Basic ${b64('m2m')}`],
    ['invalid base64 characters', 'Basic !!!'],
    ['two tokens', `Basic ${b64('a:b')} extra`],
  ])('%s → null', (_name, header) => {
    expect(parseBasicAuth(header)).toBeNull();
  });
});

describe('m2mCredentialsMatch', () => {
  it('accepts matching credentials (password containing ":")', () => {
    expect(
      m2mCredentialsMatch(expected, { username: 'm2m', password: 'p:ss' }),
    ).toBe(true);
  });

  it.each([
    ['wrong password', { username: 'm2m', password: 'nope' }],
    ['wrong username', { username: 'other', password: 'p:ss' }],
    ['both wrong', { username: 'x', password: 'y' }],
    ['different length', { username: 'm2m-longer', password: 'p' }],
  ])('rejects %s', (_name, given) => {
    expect(m2mCredentialsMatch(expected, given)).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(m2mCredentialsMatch(expected, null)).toBe(false);
  });

  it.each([
    ['username unset', { username: undefined, password: 'p' }],
    ['password unset', { username: 'm2m', password: undefined }],
    ['username empty', { username: '', password: 'p' }],
    ['password empty', { username: 'm2m', password: '' }],
  ])('rejects everything when %s', (_name, config) => {
    expect(
      m2mCredentialsMatch(config, {
        username: config.username ?? '',
        password: config.password ?? '',
      }),
    ).toBe(false);
  });

  it('compares both fields over 32-byte digests even when the username mismatches', () => {
    const equal = vi.fn(timingSafeEqual);
    expect(
      m2mCredentialsMatch(
        expected,
        { username: 'wrong-and-longer', password: 'p:ss' },
        equal,
      ),
    ).toBe(false);
    expect(equal).toHaveBeenCalledTimes(2);
    for (const [a, b] of equal.mock.calls) {
      expect(a).toHaveLength(32);
      expect(b).toHaveLength(32);
    }
  });
});
