import { LeavesService } from './../services/leaves.service';
import { TestBed, inject } from '@angular/core/testing';
import { EffectsTestingModule, EffectsRunner } from '@ngrx/effects/testing';
import { LeavesEffects } from './leave.effects';

describe('LeavesEffects', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EffectsTestingModule],
      providers: [LeavesEffects, { provide: LeavesService, useValue: {} }]
    });
  });

  it(
    'should be created',
    inject([LeavesEffects], (service: LeavesEffects) => {
      expect(service).toBeTruthy();
    })
  );
});
