import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { mockStoreModule } from '../../mocks/store.mock';
import { Store } from '@ngrx/store';
import { of } from 'rxjs/observable/of';
import { LeavesService } from './../../services/leaves.service';

import { LeavesApprovalComponent } from './leaves-approval.component';
import { TranslateLeaveTypePipe } from '../../pipes/translate-leave-type.pipe';
import { TranslateLeaveStatePipe } from '../../pipes/translate-leave-state.pipe';

describe('LeavesApprovalComponent', () => {
  let component: LeavesApprovalComponent;
  let fixture: ComponentFixture<LeavesApprovalComponent>;

  beforeEach(
    async(() => {
      const mockService = {
        getPendingLeaves: () => of([])
      };
      TestBed.configureTestingModule({
        declarations: [
          LeavesApprovalComponent,
          TranslateLeaveStatePipe,
          TranslateLeaveTypePipe
        ],
        imports: [mockStoreModule()],
        providers: [{ provide: LeavesService, useValue: mockService }]
      }).compileComponents();
    })
  );

  beforeEach(() => {
    fixture = TestBed.createComponent(LeavesApprovalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
