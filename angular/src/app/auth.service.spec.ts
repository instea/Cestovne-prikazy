import { ApolloMock } from './mocks/apollo.mock';
import { Apollo } from 'apollo-angular/Apollo';
import { TestBed, inject } from '@angular/core/testing';

import { AuthService } from './auth.service';

describe('AuthService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AuthService, { provide: Apollo, useValue: new ApolloMock() }]
    });
  });

  it('should be created', inject([AuthService], (service: AuthService) => {
    expect(service).toBeTruthy();
  }));
});
