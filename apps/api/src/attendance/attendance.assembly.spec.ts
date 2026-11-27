import { LEAVE_TYPES, LeaveType } from '@leaves/shared/leaves';
import { describe, expect, it } from 'vitest';
import {
  type AttendanceEntry,
  appendLeaveCode,
  applyLeaves,
  attendancePeriod,
  clippedDates,
  initDraft,
  keyByName,
  leaveCode,
  monthRange,
} from './attendance.assembly';
import type { SsoUser } from './sso/sso.client';
import { addEntry, entryHours } from './toggl/toggl.client';

const sso = (o: Record<string, unknown>): SsoUser => ({
  name: undefined,
  email: undefined,
  ...o,
});

const entry = (days: number): AttendanceEntry => ({
  days: Array.from({ length: days }, () => ({ logged_time: 0, leave: '' })),
  total: 0,
});

const march = monthRange(2024, 3);

describe('attendancePeriod (ATT-01 normalization)', () => {
  it.each([
    [2024, 3, 2024, 3, true],
    [2024, 13, 2025, 1, false],
    [2024, 0, 2023, 12, false],
    [2024, -1, 2023, 11, false],
    [2024, 24, 2025, 12, false],
    [2024, 25, 2026, 1, false],
    [2024, 1.5, 2024, 1, false],
    [2024, 0.5, 2024, 1, false],
    [2024.9, 12, 2024, 12, true],
  ])('%d/%d → %d-%d, codes %s', (y, m, year, month, leaveCodes) => {
    expect(attendancePeriod(y, m)).toEqual({ year, month, leaveCodes });
  });
});

describe('monthRange', () => {
  it.each([
    [2024, 3, '2024-03-01', '2024-03-31', 31],
    [2024, 2, '2024-02-01', '2024-02-29', 29],
    [2025, 2, '2025-02-01', '2025-02-28', 28],
    [2024, 4, '2024-04-01', '2024-04-30', 30],
    [99, 1, '0099-01-01', '0099-01-31', 31],
  ])('%d-%d', (y, m, startString, endString, daysInMonth) => {
    expect(monthRange(y, m)).toEqual({ startString, endString, daysInMonth });
  });
});

describe('leaveCode', () => {
  const expected: Record<LeaveType, [string, string]> = {
    ANNUAL: ['D8', 'D4'],
    SICKNESS: ['PN', 'PN'],
    DOCTOR: ['L', 'L'],
    MATERNITY: ['I', 'I'],
    PARENTAL: ['I', 'I'],
    CARING: ['I', 'I'],
  };
  it.each(LEAVE_TYPES)('%s full / half day', (type) => {
    expect([leaveCode(type, false), leaveCode(type, true)]).toEqual(
      expected[type],
    );
  });
});

describe('appendLeaveCode', () => {
  it('joins with ", " in call order', () => {
    const day = { logged_time: 0, leave: '' };
    appendLeaveCode(day, 'D8');
    appendLeaveCode(day, 'L');
    appendLeaveCode(day, 'PN');
    expect(day.leave).toBe('D8, L, PN');
  });
});

describe('clippedDates', () => {
  it('clips a leave crossing the month start', () => {
    expect(
      clippedDates({ startDate: '2024-02-26', endDate: '2024-03-05' }, march),
    ).toEqual([
      '2024-03-01',
      '2024-03-02',
      '2024-03-03',
      '2024-03-04',
      '2024-03-05',
    ]);
  });

  it('checks year and month (a year-long leave covers one January once)', () => {
    const dates = clippedDates(
      { startDate: '2024-01-02', endDate: '2025-01-31' },
      monthRange(2025, 1),
    );
    expect(dates).toHaveLength(31);
    expect(new Set(dates).size).toBe(31);
    expect(dates[0]).toBe('2025-01-01');
  });

  it('is empty for a leave outside the range', () => {
    expect(
      clippedDates({ startDate: '2024-04-01', endDate: '2024-04-02' }, march),
    ).toEqual([]);
  });
});

describe('applyLeaves', () => {
  const leave = (o: Partial<Parameters<typeof applyLeaves>[1][0]>) => ({
    startDate: '2024-03-04',
    endDate: '2024-03-04',
    type: LeaveType.ANNUAL,
    isHalfDay: false,
    ...o,
  });

  it('writes codes only on working days', () => {
    const e = entry(31);
    // Thu 7 – Mon 11 March 2024; 9–10 are the weekend.
    applyLeaves(
      e,
      [
        leave({
          startDate: '2024-03-07',
          endDate: '2024-03-11',
          isHalfDay: true,
        }),
      ],
      march,
    );
    expect(e.days.slice(6, 11).map((d) => d.leave)).toEqual([
      'D4',
      'D4',
      '',
      '',
      'D4',
    ]);
  });

  it('skips holidays via the working-day function', () => {
    const e = entry(31);
    applyLeaves(
      e,
      [leave({ startDate: '2024-03-04', endDate: '2024-03-05' })],
      march,
      (d) => d !== '2024-03-05',
    );
    expect(e.days[3]!.leave).toBe('D8');
    expect(e.days[4]!.leave).toBe('');
  });

  it('joins several leaves in the given order', () => {
    const e = entry(31);
    applyLeaves(e, [leave({}), leave({ type: LeaveType.DOCTOR })], march);
    expect(e.days[3]!.leave).toBe('D8, L');
  });

  it('writes nothing for a range with a non 4-digit year', () => {
    const e = entry(31);
    applyLeaves(e, [leave({})], monthRange(10000, 3), () => true);
    expect(e.days.every((d) => d.leave === '')).toBe(true);
  });
});

describe('initDraft', () => {
  it('lists users with truthy togglUserId in SSO order, any employee flag', () => {
    const draft = initDraft(
      [
        sso({
          name: 'A',
          togglUserId: '20',
          employee: '1',
          contractType: 'TPP',
        }),
        sso({ name: 'B', togglUserId: '7', employee: '0' }),
        sso({ name: 'C', employee: '1' }),
        sso({ name: 'D', togglUserId: '' }),
        sso({ name: 'Z', togglUserId: '0', contractType: null }),
      ],
      2,
    );
    expect(draft.names).toEqual({ '0': 'Z', '7': 'B', '20': 'A' });
    expect(JSON.stringify(draft.entries['20'])).toBe(
      '{"days":[{"logged_time":0,"leave":""},{"logged_time":0,"leave":""}],"total":0,"contractType":"TPP"}',
    );
    expect(Object.keys(draft.entries['7']!)).toEqual(['days', 'total']);
    expect(draft.entries['0']!.contractType).toBeNull();
    expect(JSON.stringify(draft.entries['0'])).toContain('"contractType":null');
  });

  it('re-initializes a duplicate togglUserId; the later name wins', () => {
    const draft = initDraft(
      [
        sso({ name: 'First', togglUserId: '5', contractType: 'A' }),
        sso({ name: 'Second', togglUserId: '5' }),
      ],
      1,
    );
    expect(draft.names).toEqual({ '5': 'Second' });
    expect(draft.entries['5']).toEqual({
      days: [{ logged_time: 0, leave: '' }],
      total: 0,
    });
  });
});

describe('keyByName', () => {
  const draftOf = (users: SsoUser[]) => initDraft(users, 1);

  it('orders integer-like ids ascending, then other ids in insertion order', () => {
    const out = keyByName(
      draftOf([
        sso({ name: 'Anna', togglUserId: '20' }),
        sso({ name: 'Xavier', togglUserId: 'abc' }),
        sso({ name: 'Boris', togglUserId: '7' }),
        sso({ name: 'Yvonne', togglUserId: '007' }),
        sso({ name: 'Cyril', togglUserId: '100' }),
      ]),
    );
    expect(Object.keys(out)).toEqual([
      'Boris',
      'Anna',
      'Cyril',
      'Xavier',
      'Yvonne',
    ]);
  });

  it('collides duplicate names: later data, first position', () => {
    const draft = draftOf([
      sso({ name: 'Eva', togglUserId: '5', contractType: 'D' }),
      sso({ name: 'Ivan', togglUserId: '7' }),
      sso({ name: 'Eva', togglUserId: '9', contractType: 'E' }),
    ]);
    const out = keyByName(draft);
    expect(Object.keys(out)).toEqual(['Eva', 'Ivan']);
    expect(out.Eva!.contractType).toBe('E');
  });

  it('keys a missing name as "undefined"', () => {
    expect(
      Object.keys(keyByName(draftOf([sso({ togglUserId: '1' })]))),
    ).toEqual(['undefined']);
  });
});

describe('float accumulation (old order)', () => {
  it('sums per entry, seconds/60/60, in entry order', () => {
    const draft = initDraft([sso({ name: 'A', togglUserId: '1' })], 31);
    const now = () => new Date('2024-03-15T12:00:00Z');
    for (const seconds of [1000, 1000, 1000]) {
      addEntry(
        draft.entries,
        { userId: 1, seconds, start: '2024-03-04T09:00:00+01:00' },
        'Europe/Bratislava',
        now,
      );
    }
    let reference = 0;
    for (let i = 0; i < 3; i++) reference += 1000 / 60 / 60;
    expect(draft.entries['1']!.total).toBe(reference);
    expect(draft.entries['1']!.days[3]!.logged_time).toBe(reference);
    expect(entryHours(1000)).toBe(0.2777777777777778);
    // Raw running sum of per-entry hours, serialized unrounded.
    expect(JSON.stringify(reference)).toBe('0.8333333333333334');
  });
});
