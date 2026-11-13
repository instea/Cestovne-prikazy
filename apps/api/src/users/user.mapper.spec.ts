import { describe, expect, it } from 'vitest';
import { toUserDto, toUserRefDto } from './user.mapper';

const doc = {
  _id: 'internal-object-id',
  __v: 3,
  id: 'g-1',
  email: 'jana@instea.co',
  firstName: 'Jana',
  surname: 'Novák',
  isAdmin: true,
  active: false,
  deactivatedAt: new Date('2026-03-01T10:00:00Z'),
  anonymizedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-03-01T10:00:00Z'),
};

describe('toUserDto', () => {
  it('maps fields, ISO dates, and hides _id and __v', () => {
    const dto = toUserDto(doc);
    expect(dto).toEqual({
      id: 'g-1',
      email: 'jana@instea.co',
      firstName: 'Jana',
      surname: 'Novák',
      isAdmin: true,
      active: false,
      deactivatedAt: '2026-03-01T10:00:00.000Z',
      anonymizedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-03-01T10:00:00.000Z',
    });
    expect(dto).not.toHaveProperty('_id');
    expect(dto).not.toHaveProperty('__v');
  });
});

describe('toUserRefDto', () => {
  it('has no email and derives anonymized', () => {
    expect(toUserRefDto(doc)).toEqual({
      id: 'g-1',
      firstName: 'Jana',
      surname: 'Novák',
      active: false,
      anonymized: false,
    });
    expect(toUserRefDto({ ...doc, anonymizedAt: new Date() }).anonymized).toBe(
      true,
    );
    expect(toUserRefDto(doc)).not.toHaveProperty('email');
  });
});
