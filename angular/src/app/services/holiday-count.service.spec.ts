import { TestBed, inject } from '@angular/core/testing';

import { Holiday.CountService } from './holiday.count.service';

describe('Holiday.CountService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [Holiday.CountService]
    });
  });

  it('should be created', inject([Holiday.CountService], (service: Holiday.CountService) => {
    expect(service).toBeTruthy();
  }));
});
