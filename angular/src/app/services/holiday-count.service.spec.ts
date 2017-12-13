import { Leave } from './../leaves/leave';
import { TestBed, inject } from '@angular/core/testing';

import { HolidayCountService } from './holiday-count.service';

describe('HolidayCountService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [HolidayCountService]
    });
  });

  function createLeave(start: string, end: string): Leave {
    const l = new Leave();
    l.startDate = new Date(start);
    l.endDate = new Date(end);
    return l;
  }

  it(
    'should be created',
    inject([HolidayCountService], (service: HolidayCountService) => {
      expect(service).toBeTruthy();
    })
  );

  it(
    'should take weekends in account',
    inject([HolidayCountService], (service: HolidayCountService) => {
      const l = createLeave('2017-12-07', '2017-12-11');
      expect(service.numWorkDays(l)).toBe(3);
    })
  );

  it(
    'should take SVK holidays in account',
    inject([HolidayCountService], (service: HolidayCountService) => {
      const l = createLeave('2017-12-22', '2017-12-30');
      expect(service.numWorkDays(l)).toBe(4);
    })
  );

  it(
    'should account half day',
    inject([HolidayCountService], (service: HolidayCountService) => {
      const l = createLeave('2017-12-11', '2017-12-13');
      l.isHalfDay = true;
      expect(service.numWorkDays(l)).toBeCloseTo(2.5);
    })
  );
});
