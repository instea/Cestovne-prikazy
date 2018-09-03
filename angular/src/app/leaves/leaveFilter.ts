import { Leave } from './leave';
import { LeaveListFilter } from '../state/leaves';
import { uniqBy, uniq, flatten, stubTrue } from 'lodash';
import * as moment from 'moment';

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

interface YearDefinition {
  year: number;
  startMonth: number;
  endMonth: number;
}

function splitByYear(
  startDate: moment.Moment,
  endDate: moment.Moment
): Array<YearDefinition> {
  const yearParts = [];
  let current = startDate.clone();
  while (current.year() <= endDate.year()) {
    yearParts.push({
      year: current.year(),
      startMonth: current.month(),
      endMonth:
        current.year() === endDate.year()
          ? endDate.month()
          : current
              .clone()
              .endOf('year')
              .month(),
    });
    current = current.add(1, 'year').month(0);
  }
  return yearParts;
}

export function isMatchingFilter(
  leave: Leave,
  filter: LeaveListFilter
): boolean {
  if (!filter) {
    return true;
  }
  const { startDate: sd, endDate: ed, requester } = leave;
  const startDate = moment(sd);
  const endDate = moment(ed);

  const { months, years, requesterIds } = filter;

  // Requester
  if (
    requesterIds &&
    requesterIds.length > 0 &&
    !requesterIds.includes(requester.id)
  ) {
    return false;
  }

  // Date
  const byYear = splitByYear(startDate, endDate);

  // Year
  const yearMatches =
    years && years.length > 0 ? year => years.includes(year) : stubTrue;

  if (years && years.length > 0) {
    if (!byYear.map(({ year }) => year).some(yearMatches)) {
      return false;
    }
  }

  // Month
  if (months && months.length > 0) {
    if (
      !byYear.some(({ year, startMonth, endMonth }) => {
        return (
          yearMatches(year) &&
          months.some(month => startMonth <= month && endMonth >= month)
        );
      })
    ) {
      return false;
    }
  }

  return true;
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
