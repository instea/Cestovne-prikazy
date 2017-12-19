import { Leave } from './leave';
import { LeaveListFilter } from '../state/leaves';
import { uniqBy, uniq, flatten } from 'lodash';

const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const monthOptions = monthNames.map((name, id) => ({ id, name }));

function isBetween(start: Date, end: Date, middle: Date): boolean {
  const middleTime = middle.getTime();
  return start.getTime() <= middleTime && end.getTime() >= middleTime;
}

function isMonthBetween(start: Date, end: Date, month: number): boolean {
  const middle = new Date(start);
  middle.setMonth(month);
  if (start.getMonth() > month) {
    // not within one year
    middle.setFullYear(end.getFullYear());
  }
  const middleTime = middle.getTime();
  return isBetween(start, end, middle);
}

function isYearBetween(start: Date, end: Date, year: number): boolean {
  return start.getFullYear() <= year && end.getFullYear() >= year;
}

function matchYearAndMonth(
  months: number[],
  years: number[],
  leave: Leave
): boolean {
  const startDate = new Date(leave.startDate);
  const endDate = new Date(leave.endDate);
  // TODO: not needed when all dates will be stored in unified form
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);
  return months.some(month =>
    years.some(year => {
      const middleStart = new Date(year, month, startDate.getDate());
      const middleEnd = new Date(year, month, endDate.getDate());
      return (
        isBetween(startDate, endDate, middleStart) ||
        isBetween(startDate, endDate, middleEnd)
      );
    })
  );
}

export function isMatchingFilter(
  leave: Leave,
  filter: LeaveListFilter
): boolean {
  if (!filter) {
    return true;
  }
  const { startDate, endDate, requester } = leave;
  const { months, years, requesterIds } = filter;
  const requesterFilter = requesterIds && requesterIds.length;
  const monthFilter = months && months.length;
  const yearFilter = years && years.length;
  if (!yearFilter && !monthFilter && !requesterFilter) {
    return true;
  }
  if (requesterFilter && !requesterIds.includes(requester.id)) {
    return false;
  }
  if (monthFilter && yearFilter) {
    return matchYearAndMonth(months, years, leave);
  }
  const matchMonth =
    !monthFilter ||
    months.some(month => isMonthBetween(startDate, endDate, month));
  const matchYear =
    !yearFilter || years.some(year => isYearBetween(startDate, endDate, year));
  return matchMonth && matchYear;
}

export function makeMonthOptions() {
  return monthOptions;
}

export function makeRequesterOptions(leaves) {
  const users = uniqBy(leaves.map(leave => leave.requester), user => user.id);
  return users.map(user => ({
    id: user.id,
    name: user.getFullName(),
  }));
}

export function makeYearOptions(leaves) {
  const currentYear = new Date().getFullYear();
  const years = uniq(
    flatten(
      leaves
        .map(leave => [
          leave.startDate.getFullYear(),
          leave.endDate.getFullYear(),
        ])
        .concat(currentYear)
    )
  );
  const desc = (a, b) => b - a;
  return years.sort(desc).map(year => ({
    id: year,
    name: year.toString(),
  }));
}
