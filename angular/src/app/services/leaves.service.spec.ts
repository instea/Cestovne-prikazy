import { TestBed, inject } from '@angular/core/testing';

import { LeavesService } from './leaves.service';

describe('LeavesService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LeavesService]
    });
  });

  it('should be created', inject([LeavesService], (service: LeavesService) => {
    expect(service).toBeTruthy();
  }));
});
