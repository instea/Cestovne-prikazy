import { describe, expect, it } from 'vitest';
import {
  colorForUser,
  formatUserName,
  USER_COLOR_COUNT,
  USER_NAME_MAX_LENGTH,
  userNameError,
} from '@leaves/shared/users';

const ref = { firstName: 'Jana', surname: 'Novák', active: true };

describe('formatUserName', () => {
  it('joins first name and surname', () => {
    expect(formatUserName(ref)).toBe('Jana Novák');
  });

  it('trims when a part is empty', () => {
    expect(formatUserName({ ...ref, firstName: '' })).toBe('Novák');
    expect(formatUserName({ ...ref, surname: '  ' })).toBe('Jana');
  });

  it('marks a deactivated user', () => {
    expect(formatUserName({ ...ref, active: false })).toBe(
      'Jana Novák (deactivated)',
    );
  });

  it('renders a missing user as "Deleted <id>"', () => {
    expect(formatUserName(null, { id: 'g-123' })).toBe('Deleted g-123');
    expect(formatUserName(undefined, { id: 'g-123' })).toBe('Deleted g-123');
  });

  it('accepts translated labels', () => {
    expect(
      formatUserName(
        { ...ref, active: false },
        { deactivatedSuffix: '(deaktivovaný)' },
      ),
    ).toBe('Jana Novák (deaktivovaný)');
    expect(formatUserName(null, { id: 'x', deletedPrefix: 'Zmazaný' })).toBe(
      'Zmazaný x',
    );
  });
});

describe('colorForUser', () => {
  it('is deterministic and within 0–14', () => {
    const ids = ['', '1', '106277880000000000001', 'g-abc', 'žluťoučký'];
    for (const id of ids) {
      const c = colorForUser(id);
      expect(c).toBe(colorForUser(id));
      expect(Number.isInteger(c)).toBe(true);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(USER_COLOR_COUNT);
    }
  });

  it('matches FNV-1a 32-bit reference values', () => {
    // FNV-1a("") = 0x811c9dc5 = 2166136261; ("a") = 0xe40c292c = 3826002220
    expect(colorForUser('')).toBe(2166136261 % 15);
    expect(colorForUser('a')).toBe(3826002220 % 15);
  });

  it('hashes the UTF-8 bytes of non-ASCII ids', () => {
    // Reference: FNV-1a over Buffer.from(id, 'utf8') for 1-, 2-, 3- and 4-byte chars.
    const fnv = (bytes: Uint8Array) => {
      let h = 0x811c9dc5;
      for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
      return h % 15;
    };
    for (const id of ['a', 'ž', '€', '😀', 'žluťoučký kůň 😀']) {
      expect(colorForUser(id)).toBe(fnv(new TextEncoder().encode(id)));
    }
  });

  it('spreads ids over all colours', () => {
    const used = new Set(
      Array.from({ length: 300 }, (_, i) => colorForUser(`user-${i}`)),
    );
    expect(used.size).toBe(USER_COLOR_COUNT);
  });
});

describe('userNameError', () => {
  it('accepts 1–100 characters after trimming', () => {
    expect(userNameError('J')).toBeNull();
    expect(userNameError('  Jana  ')).toBeNull();
    expect(userNameError('x'.repeat(USER_NAME_MAX_LENGTH))).toBeNull();
    expect(userNameError(` ${'x'.repeat(USER_NAME_MAX_LENGTH)} `)).toBeNull();
  });

  it('requires a non-blank value', () => {
    expect(userNameError('')).toBe('required');
    expect(userNameError('   ')).toBe('required');
  });

  it('rejects more than 100 characters', () => {
    expect(userNameError('x'.repeat(USER_NAME_MAX_LENGTH + 1))).toBe(
      'maxLength',
    );
  });
});
