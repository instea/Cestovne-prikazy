import type { LeaveDto, UserRefDto } from '@leaves/shared/dto';
import {
  type FilterableLeave,
  isMatchingFilter,
  makeMonthOptions,
  makeRequesterOptions,
  makeYearOptions,
  splitByYear,
  toFilterableLeave,
} from '@leaves/shared/filters';
import { describe, expect, it } from 'vitest';

const leave = (
  startDate: string,
  endDate: string,
  requesterId = '1',
): FilterableLeave => ({ requesterId, startDate, endDate });

// Fixtures of the old `angular/src/app/leaves/leaveFilter.spec.ts:19-40`.
const oneDay = leave('2017-12-05', '2017-12-05', '1');
const oneWeek = leave('2017-12-05', '2017-12-12', '1');
const twoMonths = leave('2017-12-05', '2018-02-05', '2');
const threeYear = leave('2017-12-05', '2020-12-01', '2');

describe('isMatchingFilter (LST-02, old leaveFilter.spec cases)', () => {
  it('matches everything for a null, undefined or empty filter', () => {
    expect(isMatchingFilter(oneDay, null)).toBe(true);
    expect(isMatchingFilter(oneDay, undefined)).toBe(true);
    expect(isMatchingFilter(oneDay, {})).toBe(true);
  });

  it('treats empty arrays as no restriction', () => {
    expect(
      isMatchingFilter(oneDay, { requesterIds: [], months: [], years: [] }),
    ).toBe(true);
  });

  it('years [2018]', () => {
    const filter = { years: [2018] };
    expect(isMatchingFilter(oneDay, filter)).toBe(false);
    expect(isMatchingFilter(oneWeek, filter)).toBe(false);
    expect(isMatchingFilter(twoMonths, filter)).toBe(true);
    expect(isMatchingFilter(threeYear, filter)).toBe(true);
  });

  it('years [2018, 2017]', () => {
    expect(isMatchingFilter(oneDay, { years: [2018, 2017] })).toBe(true);
  });

  it('months [1, 6]', () => {
    const filter = { months: [1, 6] };
    expect(isMatchingFilter(oneDay, filter)).toBe(false);
    expect(isMatchingFilter(twoMonths, filter)).toBe(true);
    expect(isMatchingFilter(threeYear, filter)).toBe(true);
  });

  it('months [0] matches a leave crossing into January', () => {
    expect(
      isMatchingFilter(leave('2017-12-18', '2018-01-12'), { months: [0] }),
    ).toBe(true);
  });

  it("requesterIds ['1', '3']", () => {
    const filter = { requesterIds: ['1', '3'] };
    expect(isMatchingFilter(oneDay, filter)).toBe(true);
    expect(isMatchingFilter(twoMonths, filter)).toBe(false);
  });

  it('months [12, 6] + years [2020]', () => {
    const filter = { months: [12, 6], years: [2020] };
    expect(isMatchingFilter(oneDay, filter)).toBe(false);
    expect(isMatchingFilter(twoMonths, filter)).toBe(false);
    expect(isMatchingFilter(threeYear, filter)).toBe(true);
  });

  it('a month matching only in a non-selected year does not match', () => {
    expect(
      isMatchingFilter(leave('2017-12-05', '2018-01-10'), {
        months: [11],
        years: [2018],
      }),
    ).toBe(false);
  });

  it('requester + month + year: only that requester covering July 2026', () => {
    const filter = { requesterIds: ['x'], months: [6], years: [2026] };
    expect(
      isMatchingFilter(leave('2026-07-10', '2026-07-12', 'x'), filter),
    ).toBe(true);
    expect(
      isMatchingFilter(leave('2026-06-01', '2026-08-01', 'x'), filter),
    ).toBe(true);
    expect(
      isMatchingFilter(leave('2026-07-10', '2026-07-12', 'y'), filter),
    ).toBe(false);
    expect(
      isMatchingFilter(leave('2026-08-01', '2026-08-02', 'x'), filter),
    ).toBe(false);
    expect(
      isMatchingFilter(leave('2025-07-01', '2025-07-02', 'x'), filter),
    ).toBe(false);
  });

  it('parses dates as calendar dates (no timezone shift at month edges)', () => {
    // 2026-01-01 must stay January / 2026 whatever the runtime timezone.
    const newYear = leave('2026-01-01', '2026-01-01');
    expect(isMatchingFilter(newYear, { months: [0], years: [2026] })).toBe(
      true,
    );
    expect(isMatchingFilter(newYear, { months: [11] })).toBe(false);
    expect(isMatchingFilter(newYear, { years: [2025] })).toBe(false);
  });
});

describe('splitByYear', () => {
  it('single year', () => {
    expect(splitByYear('2017-03-05', '2017-05-01')).toEqual([
      { year: 2017, startMonth: 2, endMonth: 4 },
    ]);
  });

  it('two years', () => {
    expect(splitByYear('2017-12-18', '2018-01-12')).toEqual([
      { year: 2017, startMonth: 11, endMonth: 11 },
      { year: 2018, startMonth: 0, endMonth: 0 },
    ]);
  });

  it('four years: middle years cover all months', () => {
    expect(splitByYear('2017-12-05', '2020-12-01')).toEqual([
      { year: 2017, startMonth: 11, endMonth: 11 },
      { year: 2018, startMonth: 0, endMonth: 11 },
      { year: 2019, startMonth: 0, endMonth: 11 },
      { year: 2020, startMonth: 0, endMonth: 11 },
    ]);
  });

  it('start year after end year → []', () => {
    expect(splitByYear('2019-01-01', '2018-12-31')).toEqual([]);
  });
});

const ref = (id: string, firstName: string, surname: string): UserRefDto => ({
  id,
  firstName,
  surname,
  active: true,
  anonymized: false,
});

const dto = (
  requester: UserRefDto | null,
  startDate = '2026-01-01',
  endDate = startDate,
): Pick<LeaveDto, 'requester' | 'startDate' | 'endDate'> => ({
  requester,
  startDate,
  endDate,
});

describe('filter options', () => {
  it('makeMonthOptions: 12 entries 0..11', () => {
    const options = makeMonthOptions();
    expect(options).toHaveLength(12);
    expect(options.map((o) => o.id)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
  });

  it('makeYearOptions: start / end years plus the current year, deduped, descending', () => {
    expect(
      makeYearOptions(
        [
          dto(null, '2024-03-01', '2024-03-02'),
          dto(null, '2024-12-30', '2025-01-02'),
          dto(null, '2017-12-05', '2020-12-01'), // 2018, 2019 not added
        ],
        2026,
      ).map((o) => o.id),
    ).toEqual([2026, 2025, 2024, 2020, 2017]);
  });

  it('makeYearOptions: leaves only in 2024, today in 2026 → 2026, 2024', () => {
    expect(
      makeYearOptions([dto(null, '2024-05-01')], 2026).map((o) => o.id),
    ).toEqual([2026, 2024]);
    expect(makeYearOptions([], 2026).map((o) => o.id)).toEqual([2026]);
  });

  it('makeRequesterOptions: unique by id, sorted by label', () => {
    const zora = ref('z', 'Zora', 'Malá');
    const adam = ref('a', 'Adam', 'Veľký');
    const stefan = ref('s', 'Štefan', 'Biely');
    const options = makeRequesterOptions(
      [dto(zora), dto(adam), dto(zora), dto(null), dto(stefan)],
      { locale: 'sk' },
    );
    expect(options).toEqual([
      { id: 'a', label: 'Adam Veľký' },
      { id: 's', label: 'Štefan Biely' },
      { id: 'z', label: 'Zora Malá' },
    ]);
  });

  it('makeRequesterOptions: default label formatUserRef, custom label', () => {
    const gone = {
      id: 'ghost',
      firstName: 'Deleted',
      surname: 'ghost',
      active: false,
      anonymized: false,
    };
    const old = { ...ref('o', 'Old', 'Man'), active: false };
    expect(makeRequesterOptions([dto(gone), dto(old)])).toEqual([
      { id: 'ghost', label: 'Deleted ghost' },
      { id: 'o', label: 'Old Man (deactivated)' },
    ]);
    expect(
      makeRequesterOptions([dto(old)], { label: (r) => r.surname }),
    ).toEqual([{ id: 'o', label: 'Man' }]);
  });

  it('toFilterableLeave maps the requester id', () => {
    expect(toFilterableLeave(dto(ref('a', 'A', 'B'), '2026-01-01'))).toEqual({
      requesterId: 'a',
      startDate: '2026-01-01',
      endDate: '2026-01-01',
    });
    expect(toFilterableLeave(dto(null)).requesterId).toBe('');
  });
});
