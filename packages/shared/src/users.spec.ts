import { describe, expect, it } from 'vitest';
import {
  colorForUser,
  formatUserName,
  formatUserRef,
  isMissingUserRef,
  missingUserRef,
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

describe('formatUserRef (LST-01)', () => {
  const jana = {
    id: 'g-1',
    firstName: 'Jana',
    surname: 'Nová',
    active: true,
    anonymized: false,
  };

  it('formats an active, deactivated and anonymized user', () => {
    expect(formatUserRef(jana)).toBe('Jana Nová');
    expect(formatUserRef({ ...jana, active: false })).toBe(
      'Jana Nová (deactivated)',
    );
    // Anonymized: whatever names NFR-08 stored, with the same suffix.
    expect(
      formatUserRef({
        ...jana,
        firstName: 'Anonymized',
        surname: 'User',
        active: false,
        anonymized: true,
      }),
    ).toBe('Anonymized User (deactivated)');
  });

  it('renders the missing-user placeholder and null as "Deleted <id>"', () => {
    const ref = missingUserRef('g-gone');
    expect(ref).toEqual({
      id: 'g-gone',
      firstName: 'Deleted',
      surname: 'g-gone',
      active: false,
      anonymized: false,
    });
    expect(isMissingUserRef(ref)).toBe(true);
    expect(isMissingUserRef(jana)).toBe(false);
    expect(formatUserRef(ref)).toBe('Deleted g-gone');
    expect(formatUserRef(ref, { deletedPrefix: 'Zmazaný' })).toBe(
      'Zmazaný g-gone',
    );
    expect(formatUserRef(null, { id: 'x' })).toBe('Deleted x');
  });

  it('a real user named "Deleted" is not the placeholder', () => {
    expect(
      formatUserRef({ ...jana, firstName: 'Deleted', surname: 'Smith' }),
    ).toBe('Deleted Smith');
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
