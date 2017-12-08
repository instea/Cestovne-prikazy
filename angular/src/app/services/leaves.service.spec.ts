import { Apollo } from 'apollo-angular/Apollo';
import { ApolloMock } from './../mocks/apollo.mock';
import { TestBed, inject } from '@angular/core/testing';

import { LeavesService } from './leaves.service';

describe('LeavesService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LeavesService, { provide: Apollo, useValue: new ApolloMock() }]
    });
  });

  it('should be created', inject([LeavesService], (service: LeavesService) => {
    expect(service).toBeTruthy();
  }));
});
