import { LeavesService } from './../services/leaves.service';
import { TestBed, inject } from '@angular/core/testing';
import { EffectsTestingModule, EffectsRunner } from '@ngrx/effects/testing';
import { LeavesEffects } from './leave.effects';
import { HttpClientTestingModule } from '@angular/common/http/testing';

describe('LeavesEffects', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EffectsTestingModule, HttpClientTestingModule],
      providers: [LeavesEffects, { provide: LeavesService, useValue: {} }],
    });
  });

  it(
    'should be created',
    inject([LeavesEffects], (service: LeavesEffects) => {
      expect(service).toBeTruthy();
    })
  );
});
