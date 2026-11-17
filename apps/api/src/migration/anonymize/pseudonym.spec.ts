import { createHmac } from 'node:crypto';
import { mongo, Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import {
  emailCollisionWarning,
  isOpaqueValue,
  numericValue,
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

  it('redactDeep replaces strings and numbers, keeps other scalars', () => {
    const id = new Types.ObjectId();
    const date = new Date();
    const out = p.redactDeep({ a: 'x', b: [1, 'y'], c: { d: true }, id, date });
    expect(out).toEqual({
      a: expect.stringMatching(/^redacted-/) as string,
      b: [p.fakeNumber(1), expect.stringMatching(/^redacted-/) as string],
      c: { d: true },
      id,
      date,
    });
    expect(() => p.redactDeep(new Map())).toThrow(UnsupportedValueError);
  });

  it('isOpaqueValue', () => {
    expect(isOpaqueValue(new Types.ObjectId())).toBe(true);
    expect(isOpaqueValue(new mongo.Double(1))).toBe(true);
    expect(isOpaqueValue(1n)).toBe(true);
    expect(isOpaqueValue('x')).toBe(false);
    expect(isOpaqueValue({})).toBe(false);
  });

  it('redactDeep fakes numeric PII in every JS / BSON numeric type, keeping the type', () => {
    const phone = 421_900_123_456;
    const out = p.redactDeep({
      phone,
      big: 421900123456n,
      dbl: new mongo.Double(phone),
      i32: new mongo.Int32(123_456),
      long: mongo.Long.fromNumber(phone),
      dec: mongo.Decimal128.fromString(String(phone)),
      nan: Number.NaN,
    }) as Record<string, unknown>;
    expect(typeof out.phone).toBe('number');
    expect(out.phone).not.toBe(phone);
    expect(typeof out.big).toBe('bigint');
    expect(out.dbl).toBeInstanceOf(mongo.Double);
    expect(out.i32).toBeInstanceOf(mongo.Int32);
    expect(out.long).toBeInstanceOf(mongo.Long);
    expect(out.dec).toBeInstanceOf(mongo.Decimal128);
    for (const k of ['big', 'dbl', 'long', 'dec'])
      expect(numericValue(out[k])).toBe(out.phone);
    expect(numericValue(out.i32)).not.toBe(123_456);
    expect(out.nan).toBeNaN();
  });

  it('a numeric user id maps to the same value whatever its BSON type', () => {
    const asInt = p.userId(new mongo.Int32(42));
    const asDouble = p.userId(new mongo.Double(42));
    expect(asInt).toBeInstanceOf(mongo.Int32);
    expect(numericValue(asInt)).toBe(numericValue(asDouble));
    expect(numericValue(asInt)).not.toBe(42);
    expect(numericValue(asInt)).toBe(p.userId(42));
  });

  describe('emailCollisions', () => {
    it('reports every pair of distinct emails sharing a pseudonym, by path', () => {
      const collisions = p.emailCollisions([
        ['u1', 'HANA@instea.co'],
        ['u2', 'Hana@instea.co'],
        ['u3', 'HaNa@instea.co'],
        ['u4', 'hana@instea.co'], // lowercase → `user-…`, no collision
        ['u5', 'Hana@instea.co'], // exact duplicate: collides in the source
        ['u6', 'eva@instea.co'],
        ['u7', ''],
        ['u8', null],
      ]);
      expect(collisions).toEqual([
        ['u1', 'u2'],
        ['u1', 'u3'],
        ['u2', 'u3'],
      ]);
    });

    it('is empty without case-only variants', () => {
      expect(
        p.emailCollisions([
          ['a', 'jana@instea.co'],
          ['b', 'Peter@instea.co'],
          ['c', 'jana@instea.co'],
        ]),
      ).toEqual([]);
    });

    it('warns with the count and the paths only', () => {
      expect(emailCollisionWarning([])).toBeNull();
      const warning = emailCollisionWarning(
        p.emailCollisions([
          ['users[1].email', 'HANA@instea.co'],
          ['users[2].email', 'Hana@instea.co'],
        ]),
      )!;
      expect(warning).toMatch(/^WARNING: 1 pair\(s\)/);
      expect(warning).toContain('- users[1].email / users[2].email');
      expect(warning).toContain('parity run is blind');
      expect(warning).not.toMatch(/hana|User-/i);
    });
  });
});
