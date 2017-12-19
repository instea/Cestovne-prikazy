import { Leave, LeaveType, LeaveState } from './leave';
import { User } from '../login-page/user';
import { isMatchingFilter } from './leaveFilter';

let _lastId = 0;
function makeLeave(start, end, requesterId): Leave {
  const requester = new User();
  requester.id = requesterId;
  return {
    id: _lastId++ + '',
    startDate: new Date(start),
    endDate: new Date(end),
    type: LeaveType.ANNUAL,
    state: LeaveState.PENDING,
    requester,
  };
}

describe('leaveFilter', () => {
  describe('isMatchingFilter', () => {
    const oneDayLeave = makeLeave(
      new Date(2017, 11, 5),
      new Date(2017, 11, 5),
      '1'
    );
    const oneWeekLeave = makeLeave(
      new Date(2017, 11, 5),
      new Date(2017, 11, 12),
      '1'
    );
    const twoMonthsLeave = makeLeave(
      new Date(2017, 11, 5),
      new Date(2018, 1, 5),
      '2'
    );
    const threeYearLeave = makeLeave(
      new Date(2017, 11, 5),
      new Date(2020, 11, 1),
      '2'
    );

    it('should match for null filter', () => {
      expect(isMatchingFilter(oneDayLeave, null)).toBe(true);
      expect(isMatchingFilter(oneDayLeave, {})).toBe(true);
    });

    it('should match for empty filter', () => {
      const filter = { requesterIds: [], months: [], years: [] };
      expect(isMatchingFilter(oneDayLeave, filter)).toBe(true);
    });

    it('should match by year', () => {
      const filter = { years: [2018] };
      expect(isMatchingFilter(oneDayLeave, filter)).toBe(false);
      expect(isMatchingFilter(oneWeekLeave, filter)).toBe(false);
      expect(isMatchingFilter(twoMonthsLeave, filter)).toBe(true);
      expect(isMatchingFilter(threeYearLeave, filter)).toBe(true);
    });

    it('should match by multiple years', () => {
      const filter = { years: [2018, 2017] };
      expect(isMatchingFilter(oneDayLeave, filter)).toBe(true);
    });

    it('should match by months', () => {
      const filter = { months: [1, 6] };
      expect(isMatchingFilter(oneDayLeave, filter)).toBe(false);
      expect(isMatchingFilter(twoMonthsLeave, filter)).toBe(true);
      expect(isMatchingFilter(threeYearLeave, filter)).toBe(true);
    });

    it('should match by requester', () => {
      const filter = { requesterIds: ['1', '3'] };
      expect(isMatchingFilter(oneDayLeave, filter)).toBe(true);
      expect(isMatchingFilter(twoMonthsLeave, filter)).toBe(false);
    });

    it('should match by year and month', () => {
      const filter = { months: [12, 6], years: [2020] };
      expect(isMatchingFilter(oneDayLeave, filter)).toBe(false);
      expect(isMatchingFilter(twoMonthsLeave, filter)).toBe(false);
      expect(isMatchingFilter(threeYearLeave, filter)).toBe(true);
    });
  });
});
