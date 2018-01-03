const { enumarateTripsWorkingDays } = require('../tripService');

const BASE = '2017-12-';
const mockDayStr = day => {
  if (day < 10) {
    day = '0' + day;
  }
  return BASE + day;
};
const mockTime = (day, hour) => {
  const d = new Date(mockDayStr(day));
  if (hour) {
    d.setHours(hour);
  }
  return d;
};

function mt(from, to, fromHour, toHour) {
  return {
    departureTime: mockTime(from, fromHour),
    arrivalTime: mockTime(to, toHour)
  };
}

describe('enumarateTripsWorkingDays', () => {
  it('enumarates days within week (starting hour > end hour)', () => {
    const days = enumarateTripsWorkingDays([mt(4, 6, 18, 9)]);
    expect(days).toEqual([4, 5, 6].map(mockDayStr));
  });

  it('joins overlaping trips and sort them', () => {
    const days = enumarateTripsWorkingDays([mt(5, 6), mt(5, 5), mt(4, 5)]);
    expect(days).toEqual([4, 5, 6].map(mockDayStr));
  });

  it('skips holidays', () => {
    const days = enumarateTripsWorkingDays([mt(24, 27)]);
    expect(days).toEqual([27].map(mockDayStr));
  });

  it('skips weekend', () => {
    const days = enumarateTripsWorkingDays([mt(8, 11)]);
    expect(days).toEqual([8, 11].map(mockDayStr));
  });

});
