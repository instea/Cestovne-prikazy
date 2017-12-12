import * as Holidays from 'date-holidays';
import * as moment from 'moment';
import { Moment } from 'moment';

import { Injectable } from '@angular/core';
import { isWeekend } from 'date-fns';

type _Date = Date | Moment | string;
const normalizeDate = (date: _Date) => {
  if (typeof date === 'string' || date instanceof Date) {
    return moment(date)
      .hours(12)
      .minutes(0)
      .seconds(0);
  }
  return date;
};

@Injectable()
export class HolidayCountService {
  private holidays = new Holidays('SK');

  constructor() {}

  /**
   *
   * @param _startDate the first day of the interval
   * @param _endDate the last day of the interval
   * @returns number of days in the interval that are work days (thus neither a weekend nor public holiday)
   */
  numWorkDays(_startDate: _Date, _endDate: _Date): number {
    const startDate = normalizeDate(_startDate);
    const endDate = normalizeDate(_endDate);

    let count = 0;
    let date = startDate;
    while (!date.isAfter(endDate, 'day')) {
      if (this.isWorkDay(date)) {
        count++;
      }
      date = date.add(1, 'day');
    }

    return count;
  }

  isWorkDay(_date: _Date) {
    const date = normalizeDate(_date);
    return !this.isWeekend(date) && !this.isPublicHoliday(date);
  }

  private isWeekend(date: Moment) {
    return date.isoWeekday() >= 6;
  }

  private isPublicHoliday(date: Moment) {
    return !!this.holidays.isHoliday(date.toDate());
  }
}
