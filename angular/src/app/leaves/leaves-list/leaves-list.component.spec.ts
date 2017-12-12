import { of } from 'rxjs/observable/of';
import { LeavesService } from './../../services/leaves.service';
import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { LeavesListComponent } from './leaves-list.component';

describe('LeavesListComponent', () => {
  let component: LeavesListComponent;
  let fixture: ComponentFixture<LeavesListComponent>;

  beforeEach(
    async(() => {
      const mockService = {
        getLeaves: () => of([])
      };
      TestBed.configureTestingModule({
        declarations: [LeavesListComponent],
        providers: [{ provide: LeavesService, useValue: mockService }]
      }).compileComponents();
    })
  );

  beforeEach(() => {
    fixture = TestBed.createComponent(LeavesListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
