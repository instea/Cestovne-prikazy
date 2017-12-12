import { TestBed, inject } from '@angular/core/testing';

import { HolidayCountService } from './holiday-count.service';

describe('HolidayCountService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [HolidayCountService]
    });
  });

  it('should be created', inject([HolidayCountService], (service: HolidayCountService) => {
    expect(service).toBeTruthy();
  }));
});
