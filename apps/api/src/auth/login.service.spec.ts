import { describe, expect, it } from 'vitest';
import {
  hostedDomainMatches,
  newUserFromIdentity,
  normalizeEmail,
} from './login.service';

describe('hostedDomainMatches (AUTH-01)', () => {
  it.each([
    ['instea.co', true],
    ['INSTEA.CO', true],
    ['Instea.Co', true],
    ['gmail.com', false],
    ['sub.instea.co', false],
    ['instea.co.evil', false],
    ['', false],
    [undefined, false],
  ])('hd=%s → %s', (hd, expected) => {
    expect(hostedDomainMatches(hd, 'instea.co')).toBe(expected);
  });

  it('compares the configured domain case-insensitively too', () => {
    expect(hostedDomainMatches('instea.co', 'Instea.CO')).toBe(true);
  });
});

describe('newUserFromIdentity', () => {
  const identity = {
    sub: '111',
    email: ' Jan.Novak@instea.co ',
    emailVerified: true,
    hostedDomain: 'instea.co',
    givenName: 'Jan',
    familyName: 'Novák',
  };

  it('maps the spec example: lowercased email, active non-admin', () => {
    expect(newUserFromIdentity(identity)).toEqual({
      id: '111',
      email: 'jan.novak@instea.co',
      firstName: 'Jan',
      surname: 'Novák',
      isAdmin: false,
      active: true,
      deactivatedAt: null,
      anonymizedAt: null,
    });
  });

  it("falls back to '' when Google sends no names", () => {
    const user = newUserFromIdentity({
      ...identity,
      givenName: undefined,
      familyName: undefined,
    });
    expect(user.firstName).toBe('');
    expect(user.surname).toBe('');
  });

  it('normalizeEmail trims and lowercases', () => {
    expect(normalizeEmail('  A.B@Instea.CO ')).toBe('a.b@instea.co');
  });
});
