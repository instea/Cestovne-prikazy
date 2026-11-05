import { describe, expect, it } from 'vitest';
import {
  countWorkingDays,
  isWorkingDay,
  leaveWorkDays,
  publicHolidays,
} from '@leaves/shared/workdays';

// Worked examples from WD-01. The 2017 rows are the old Angular spec
// (holiday-count.service.spec.ts:30-53) and must keep passing.
const examples: Array<
  [start: string, end: string, isHalfDay: boolean, expected: number]
> = [
  ['2017-12-07', '2017-12-11', false, 3],
  ['2017-12-22', '2017-12-30', false, 4],
  ['2017-12-11', '2017-12-13', true, 2.5],
  ['2026-11-04', '2026-11-04', true, 0.5],
  ['2026-11-07', '2026-11-07', true, 0],
  ['2026-11-10', '2026-11-09', false, 0],
  ['2026-04-02', '2026-04-07', false, 2],
  ['2026-12-21', '2026-12-31', false, 7],
  ['2026-05-08', '2026-05-08', false, 1],
  ['2025-05-08', '2025-05-08', false, 0],
  ['2026-09-15', '2026-09-15', false, 1],
  ['2025-09-15', '2025-09-15', false, 0],
  ['2025-11-17', '2025-11-17', false, 1],
  ['2023-11-17', '2023-11-17', false, 0],
  ['2025-09-01', '2025-09-01', false, 1],
  ['2023-09-01', '2023-09-01', false, 0],
];

describe('leaveWorkDays', () => {
  it.each(examples)(
    '%s..%s half=%s -> %d',
    (startDate, endDate, isHalfDay, expected) => {
      expect(leaveWorkDays({ startDate, endDate, isHalfDay })).toBe(expected);
    },
  );

  it('never returns -0.5 for a half-day on a non-working day', () => {
    expect(
      leaveWorkDays({
        startDate: '2026-12-25',
        endDate: '2026-12-25',
        isHalfDay: true,
      }),
    ).toBe(0);
  });
});

describe('publicHolidays', () => {
  it('returns exactly the 11 SK public holidays of 2026', () => {
    expect([...publicHolidays(2026)].sort()).toEqual([
      '2026-01-01',
      '2026-01-06',
      '2026-04-03',
      '2026-04-06',
      '2026-05-01',
      '2026-07-05',
      '2026-08-29',
      '2026-11-01',
      '2026-12-24',
      '2026-12-25',
      '2026-12-26',
    ]);
  });

  // TST-01: pinned SK public holidays; a date-holidays bump that changes them fails here.
  it.each([
    [
      2024,
      [
        '01-01',
        '01-06',
        '03-29',
        '04-01',
        '05-01',
        '05-08',
        '07-05',
        '08-29',
        '09-15',
        '11-01',
        '11-17',
        '12-24',
        '12-25',
        '12-26',
      ],
    ],
    [
      2025,
      [
        '01-01',
        '01-06',
        '04-18',
        '04-21',
        '05-01',
        '05-08',
        '07-05',
        '08-29',
        '09-15',
        '11-01',
        '12-24',
        '12-25',
        '12-26',
      ],
    ],
    [
      2027,
      [
        '01-01',
        '01-06',
        '03-26',
        '03-29',
        '05-01',
        '07-05',
        '08-29',
        '11-01',
        '12-24',
        '12-25',
        '12-26',
      ],
    ],
  ])('pins SK public holidays of %d', (year, days) => {
    expect([...publicHolidays(year)].sort()).toEqual(
      days.map((d) => `${year}-${d}`),
    );
  });

  it('keeps historic 2017 rules (05-08, 09-01, 09-15, 11-17 public)', () => {
    const h = publicHolidays(2017);
    for (const d of ['2017-05-08', '2017-09-01', '2017-09-15', '2017-11-17']) {
      expect(h.has(d)).toBe(true);
    }
  });

  it('excludes observances', () => {
    // Easter Sunday is an observance in the SK data.
    expect(publicHolidays(2026).has('2026-04-05')).toBe(false);
  });

  it('caches per year', () => {
    expect(publicHolidays(2026)).toBe(publicHolidays(2026));
  });
});

describe('isWorkingDay', () => {
  it.each([
    ['2026-11-04', true], // Wed
    ['2026-11-07', false], // Sat
    ['2026-11-08', false], // Sun
    ['2026-01-06', false], // Epiphany, Tue
    ['2026-09-01', true], // observance since 2024, Tue
  ])('%s -> %s', (date, expected) => {
    expect(isWorkingDay(date)).toBe(expected);
  });
});

describe('countWorkingDays', () => {
  it('counts across a year boundary', () => {
    // 2025-12-29 Mon, 30 Tue, 31 Wed, 2026-01-01 holiday, 02 Fri
    expect(countWorkingDays('2025-12-29', '2026-01-02')).toBe(4);
  });

  it('returns 0 when end < start', () => {
    expect(countWorkingDays('2026-01-02', '2026-01-01')).toBe(0);
  });

  it('handles a 10-year range in under 50 ms', () => {
    publicHolidays(2010); // warm the date-holidays module, not the cache under test
    const t0 = performance.now();
    const n = countWorkingDays('2016-01-01', '2025-12-31');
    const ms = performance.now() - t0;
    expect(n).toBeGreaterThan(2400);
    expect(ms).toBeLessThan(50);
  });
});

describe('input validation', () => {
  it.each([
    '2026-02-30',
    '2026-13-01',
    '2026-1-01',
    '20260101',
    '',
    'abc',
    '2026-02-29',
  ])('%j throws RangeError', (bad) => {
    expect(() => isWorkingDay(bad)).toThrow(RangeError);
    expect(() => countWorkingDays(bad, '2026-12-31')).toThrow(RangeError);
    expect(() => countWorkingDays('2026-01-01', bad)).toThrow(RangeError);
  });

  it('accepts a leap day', () => {
    expect(isWorkingDay('2028-02-29')).toBe(true); // Tue
  });
});

describe('timezone independence', () => {
  it('returns identical results under UTC, Europe/Bratislava and America/Los_Angeles', () => {
    const original = process.env.TZ;
    const run = () =>
      examples.map(([startDate, endDate, isHalfDay]) =>
        leaveWorkDays({ startDate, endDate, isHalfDay }),
      );
    try {
      const results = ['UTC', 'Europe/Bratislava', 'America/Los_Angeles'].map(
        (tz) => {
          process.env.TZ = tz;
          return run();
        },
      );
      expect(results[1]).toEqual(results[0]);
      expect(results[2]).toEqual(results[0]);
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});
