import { describe, expect, it } from 'vitest';
import { LeaveState, LeaveType } from '@leaves/shared/leaves';
import { buildLeaveSummary, type SummaryLeave } from '@leaves/shared/summary';

const leave = (
  startDate: string,
  endDate: string,
  overrides: Partial<SummaryLeave> = {},
): SummaryLeave => ({
  startDate,
  endDate,
  isHalfDay: false,
  type: LeaveType.ANNUAL,
  state: LeaveState.APPROVED,
  ...overrides,
});

// Old spec dataset (summary.component.spec.ts) in real-count form.
const L1 = leave('2017-12-10', '2017-12-14'); // Mon 11 – Thu 14 = 4
const L2 = leave('2017-12-27', '2018-01-05'); // 2017: 3, 2018: 4 (1 Jan holiday)
const L3 = leave('2018-01-10', '2018-01-14'); // Wed 10 – Fri 12 = 3

describe('buildLeaveSummary (SUM-01)', () => {
  it('worked example: 7 / 7', () => {
    expect(buildLeaveSummary([L1, L2, L3])).toEqual({
      years: [
        { year: 2018, byType: [{ type: 'ANNUAL', workDays: 7 }] },
        { year: 2017, byType: [{ type: 'ANNUAL', workDays: 7 }] },
      ],
    });
  });

  it('counts APPROVED only: L3 REJECTED, L1 PENDING → 4 / 3', () => {
    expect(
      buildLeaveSummary([
        { ...L1, state: LeaveState.PENDING },
        L2,
        { ...L3, state: LeaveState.REJECTED },
      ]),
    ).toEqual({
      years: [
        { year: 2018, byType: [{ type: 'ANNUAL', workDays: 4 }] },
        { year: 2017, byType: [{ type: 'ANNUAL', workDays: 3 }] },
      ],
    });
  });

  it('empty input and only pending / rejected leaves → years: []', () => {
    expect(buildLeaveSummary([])).toEqual({ years: [] });
    expect(
      buildLeaveSummary([
        { ...L1, state: LeaveState.PENDING },
        { ...L3, state: LeaveState.REJECTED },
      ]),
    ).toEqual({ years: [] });
  });

  it('lists an empty year between two years with byType: []', () => {
    const { years } = buildLeaveSummary([
      leave('2023-03-06', '2023-03-06'),
      leave('2025-03-03', '2025-03-03'),
    ]);
    expect(years).toEqual([
      { year: 2025, byType: [{ type: 'ANNUAL', workDays: 1 }] },
      { year: 2024, byType: [] },
      { year: 2023, byType: [{ type: 'ANNUAL', workDays: 1 }] },
    ]);
  });

  it('orders types by LEAVE_TYPES, not first seen; keeps a 0 sum', () => {
    const { years } = buildLeaveSummary([
      leave('2026-11-02', '2026-11-03', { type: LeaveType.CARING }),
      leave('2026-11-04', '2026-11-04', { type: LeaveType.SICKNESS }),
      leave('2026-11-07', '2026-11-08', { type: LeaveType.DOCTOR }), // weekend
      leave('2026-11-05', '2026-11-06', { type: LeaveType.ANNUAL }),
    ]);
    expect(years).toEqual([
      {
        year: 2026,
        byType: [
          { type: 'ANNUAL', workDays: 2 },
          { type: 'SICKNESS', workDays: 1 },
          { type: 'DOCTOR', workDays: 0 },
          { type: 'CARING', workDays: 2 },
        ],
      },
    ]);
  });

  it('a half-day on a working day adds 0.5', () => {
    const { years } = buildLeaveSummary([
      leave('2026-11-04', '2026-11-04', { isHalfDay: true }),
      leave('2026-11-09', '2026-11-10'),
    ]);
    expect(years[0]!.byType).toEqual([{ type: 'ANNUAL', workDays: 2.5 }]);
  });

  it('splits a leave spanning 3 years (2024-12-30 → 2026-01-02) into 3 parts', () => {
    const { years } = buildLeaveSummary([leave('2024-12-30', '2026-01-02')]);
    expect(years).toEqual([
      // Thu 1 Jan is a holiday, Fri 2 Jan → 1.
      { year: 2026, byType: [{ type: 'ANNUAL', workDays: 1 }] },
      // The whole of 2025: 261 weekdays − 11 public holidays on weekdays.
      { year: 2025, byType: [{ type: 'ANNUAL', workDays: 250 }] },
      // Mon 30, Tue 31 Dec → 2.
      { year: 2024, byType: [{ type: 'ANNUAL', workDays: 2 }] },
    ]);
  });
});
