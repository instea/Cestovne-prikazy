import { describe, expect, it } from 'vitest';
import {
  LEAVE_DATE_RULE_MESSAGES,
  LEAVE_STATE_LABELS_EN,
  LEAVE_STATES,
  LEAVE_TYPE_LABELS_EN,
  LEAVE_TYPES,
  LeaveState,
  LeaveType,
  leaveDateFieldError,
  leaveDateRuleError,
  leaveEndDateLimit,
  newLeaveRuleError,
} from '@leaves/shared/leaves';

describe('LeaveType / LeaveState (DATA-02)', () => {
  it('LEAVE_TYPES holds exactly the 6 codes in display order', () => {
    expect(LEAVE_TYPES).toEqual([
      'ANNUAL',
      'SICKNESS',
      'DOCTOR',
      'MATERNITY',
      'PARENTAL',
      'CARING',
    ]);
    expect(Object.values(LeaveType)).toEqual(LEAVE_TYPES);
  });

  it('LEAVE_STATES holds exactly the 3 codes in order', () => {
    expect(LEAVE_STATES).toEqual(['PENDING', 'APPROVED', 'REJECTED']);
    expect(Object.values(LeaveState)).toEqual(LEAVE_STATES);
  });

  it('enum values equal their keys', () => {
    for (const [key, value] of Object.entries(LeaveType))
      expect(value).toBe(key);
    for (const [key, value] of Object.entries(LeaveState))
      expect(value).toBe(key);
  });

  it('has the fixed EN labels (email label source, NOT-*)', () => {
    expect(LEAVE_TYPE_LABELS_EN).toEqual({
      ANNUAL: 'Annual leave',
      SICKNESS: 'Sick leave',
      DOCTOR: 'Doctor visit',
      MATERNITY: 'Maternity leave',
      PARENTAL: 'Parental leave',
      CARING: 'Caring for a relative at home',
    });
    expect(LEAVE_STATE_LABELS_EN).toEqual({
      PENDING: 'Pending',
      APPROVED: 'Approved',
      REJECTED: 'Rejected',
    });
  });
});

describe('leaveDateRuleError (DATA-02)', () => {
  const day = { startDate: '2026-11-09', endDate: '2026-11-09' };

  it('accepts a range, a single day and a single half day', () => {
    expect(
      leaveDateRuleError({ ...day, endDate: '2026-11-13', isHalfDay: false }),
    ).toBeNull();
    expect(leaveDateRuleError({ ...day, isHalfDay: false })).toBeNull();
    expect(leaveDateRuleError({ ...day, isHalfDay: true })).toBeNull();
  });

  it('rejects endDate before startDate', () => {
    expect(
      leaveDateRuleError({ ...day, endDate: '2026-11-08', isHalfDay: false }),
    ).toBe('LEAVE_END_BEFORE_START');
  });

  it('rejects a half day over several days', () => {
    expect(
      leaveDateRuleError({ ...day, endDate: '2026-11-10', isHalfDay: true }),
    ).toBe('LEAVE_HALF_DAY_MULTIPLE_DAYS');
  });

  it('gives END_BEFORE_START when both rules fail', () => {
    expect(
      leaveDateRuleError({ ...day, endDate: '2026-11-08', isHalfDay: true }),
    ).toBe('LEAVE_END_BEFORE_START');
  });

  it('has the old UI messages', () => {
    expect(LEAVE_DATE_RULE_MESSAGES).toEqual({
      LEAVE_END_BEFORE_START: 'Start date must not be greater than end date',
      LEAVE_TOO_LONG: 'Leave must be shorter than 2 years',
      LEAVE_HALF_DAY_MULTIPLE_DAYS:
        'Half day option is allowed only within single day',
    });
  });
});

describe('leaveDateFieldError (LV-01 / LV-02)', () => {
  it.each(['2000-01-01', '2026-11-09', '2100-12-31'])('accepts %s', (d) => {
    expect(leaveDateFieldError('startDate', d)).toBeNull();
  });

  it.each(['1999-12-31', '2101-01-01', '0100-01-01', '9999-12-31'])(
    'rejects %s as out of range, naming the field',
    (d) => {
      expect(leaveDateFieldError('endDate', d)).toBe(
        'endDate must be between 2000-01-01 and 2100-12-31',
      );
    },
  );

  it.each(['2026-02-30', '9.11.2026', '', null, 20261109])(
    'rejects %j as malformed',
    (d) => {
      expect(leaveDateFieldError('startDate', d)).toBe(
        'startDate must be a date in YYYY-MM-DD format',
      );
    },
  );
});

describe('leaveEndDateLimit / newLeaveRuleError (LV-01 / LV-02)', () => {
  it('is the same calendar day 2 years later', () => {
    expect(leaveEndDateLimit('2026-03-01')).toBe('2028-03-01');
    expect(leaveEndDateLimit('2026-01-01')).toBe('2028-01-01');
    expect(leaveEndDateLimit('2100-12-31')).toBe('2102-12-31');
  });

  it('maps a 29 February start to 28 February of a non-leap year', () => {
    expect(leaveEndDateLimit('2028-02-29')).toBe('2030-02-28');
    // With 2 years the target year of a 29 February is never a leap year.
    expect(leaveEndDateLimit('2000-02-29')).toBe('2002-02-28');
  });

  const rule = (startDate: string, endDate: string, isHalfDay = false) =>
    newLeaveRuleError({ startDate, endDate, isHalfDay });

  it('allows an end before the limit, rejects one on it', () => {
    expect(rule('2026-03-01', '2028-02-29')).toBeNull();
    expect(rule('2026-03-01', '2028-03-01')).toBe('LEAVE_TOO_LONG');
    expect(rule('2028-02-29', '2030-02-27')).toBeNull();
    expect(rule('2028-02-29', '2030-02-28')).toBe('LEAVE_TOO_LONG');
    expect(rule('2028-02-28', '2030-02-27')).toBeNull();
    expect(rule('2028-02-28', '2030-02-28')).toBe('LEAVE_TOO_LONG');
  });

  it('precedence: END_BEFORE_START > TOO_LONG > HALF_DAY_MULTIPLE_DAYS', () => {
    expect(rule('2030-01-01', '2026-01-01', true)).toBe(
      'LEAVE_END_BEFORE_START',
    );
    expect(rule('2026-01-01', '2029-01-01', true)).toBe('LEAVE_TOO_LONG');
    expect(rule('2026-01-01', '2026-01-02', true)).toBe(
      'LEAVE_HALF_DAY_MULTIPLE_DAYS',
    );
    expect(rule('2026-01-01', '2026-01-01', true)).toBeNull();
  });
});
