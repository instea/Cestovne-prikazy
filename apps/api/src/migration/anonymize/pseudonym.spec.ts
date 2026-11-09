import { createHmac } from 'node:crypto';
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import {
  isOpaqueValue,
  Pseudonymizer,
  UnsupportedValueError,
} from './pseudonym';

const SECRET = 'unit-test-secret-'.padEnd(40, 'x');
const p = new Pseudonymizer(SECRET);
const hmac = (v: string, secret = SECRET) =>
  createHmac('sha256', secret).update(v, 'utf8').digest('hex');

/** The User schema email rule (DATA-01), applied by MIG-01 after trim + lowercase. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const valid = (e: unknown) =>
  typeof e === 'string' && EMAIL.test(e.trim().toLowerCase());

describe('Pseudonymizer (MIG-02)', () => {
  it('refuses a short secret', () => {
    expect(() => new Pseudonymizer('short')).toThrow(UnsupportedValueError);
  });

  describe('userId', () => {
    it('is anon- + the first 16 hex of HMAC-SHA256(secret, id)', () => {
      expect(p.userId('110248495921238986420')).toBe(
        `anon-${hmac('110248495921238986420').slice(0, 16)}`,
      );
    });

    it('is deterministic per secret', () => {
      expect(new Pseudonymizer(SECRET).userId('1001')).toBe(p.userId('1001'));
      expect(new Pseudonymizer(`${SECRET}-other`).userId('1001')).not.toBe(
        p.userId('1001'),
      );
      expect(p.userId('1001')).not.toBe(p.userId('1002'));
    });

    it('keeps missing / blank ids and the type of a numeric id', () => {
      for (const v of [undefined, null, '', '  ', true])
        expect(p.userId(v)).toBe(v);
      const n = p.userId(1001);
      expect(typeof n).toBe('number');
      expect(n).not.toBe(1001);
      expect(p.userId(1001)).toBe(n);
    });

    it('redacts strings inside a structured id', () => {
      expect(p.userId({ sub: '1001' })).toEqual({
        sub: expect.stringMatching(/^redacted-[0-9a-f]{12}$/) as string,
      });
    });
  });

  describe('email', () => {
    it('replaces the local part, keeps the domain', () => {
      expect(p.email('jana.nova@instea.co')).toBe(
        `user-${hmac('jana.nova@instea.co').slice(0, 12)}@instea.co`,
      );
    });

    it('hashes the trimmed lowercased email; uppercases the first letter for an uppercase original', () => {
      const lower = p.email('jana.nova@instea.co') as string;
      expect(p.email('Jana.Nova@instea.co')).toBe(`U${lower.slice(1)}`);
      expect(p.email('  jana.nova@instea.co ')).toBe(`  ${lower} `);
    });

    it('keeps A@x and a@x distinct but colliding when lowercased (USER_DUPLICATE_EMAIL)', () => {
      const upper = p.email('A@instea.co') as string;
      const lower = p.email('a@instea.co') as string;
      expect(upper).not.toBe(lower);
      expect(upper.toLowerCase()).toBe(lower.toLowerCase());
      expect(p.email('b@instea.co')).not.toBe(lower);
    });

    it.each([
      'jana@instea.co',
      'Jana@Instea.co',
      ' jana@instea.co ',
      'no-at-sign',
      '@instea.co',
      'jana nova@instea.co',
      'jana@localhost',
      'a@b@instea.co',
      'jana@',
    ])('keeps the validity of %j', (email) => {
      expect(valid(p.email(email))).toBe(valid(email));
    });

    it('keeps empty and non-string values', () => {
      expect(p.email('')).toBe('');
      expect(p.email(null)).toBeNull();
      expect(p.email(undefined)).toBeUndefined();
    });
  });

  it('names: Name-<hex>, blank kept, duplicates stay duplicates', () => {
    expect(p.name('Eva')).toMatch(/^Name-[0-9a-f]{12}$/);
    expect(p.name('Eva')).toBe(p.name('Eva'));
    expect(p.name('Eva')).not.toBe(p.name('Ema'));
    expect(p.name('')).toBe('');
  });

  it('redactDeep replaces strings and keeps opaque values', () => {
    const id = new Types.ObjectId();
    const date = new Date();
    const out = p.redactDeep({ a: 'x', b: [1, 'y'], c: { d: true }, id, date });
    expect(out).toEqual({
      a: expect.stringMatching(/^redacted-/) as string,
      b: [1, expect.stringMatching(/^redacted-/) as string],
      c: { d: true },
      id,
      date,
    });
    expect(() => p.redactDeep(new Map())).toThrow(UnsupportedValueError);
  });

  it('isOpaqueValue', () => {
    expect(isOpaqueValue(new Types.ObjectId())).toBe(true);
    expect(isOpaqueValue(new Types.Double(1))).toBe(true);
    expect(isOpaqueValue(1n)).toBe(true);
    expect(isOpaqueValue('x')).toBe(false);
    expect(isOpaqueValue({})).toBe(false);
  });
});
