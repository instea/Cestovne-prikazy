import { describe, expect, it } from 'vitest';
import {
  LEAVE_DATE_RULE_MESSAGES,
  LEAVE_STATE_LABELS_EN,
  LEAVE_STATES,
  LEAVE_TYPE_LABELS_EN,
  LEAVE_TYPES,
  LeaveState,
  LeaveType,
  leaveDateRuleError,
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
      LEAVE_HALF_DAY_MULTIPLE_DAYS:
        'Half day option is allowed only within single day',
    });
  });
});
