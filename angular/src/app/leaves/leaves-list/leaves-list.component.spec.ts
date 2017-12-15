import { of } from 'rxjs/observable/of';
import { ReactiveFormsModule } from '@angular/forms';
import { MultiselectDropdownModule } from 'angular-2-dropdown-multiselect';
import { LeavesService } from './../../services/leaves.service';
import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { TranslateLeaveStatePipe } from '../../pipes/translate-leave-state.pipe';
import { TranslateLeaveTypePipe } from '../../pipes/translate-leave-type.pipe';
import { LeavesListComponent } from './leaves-list.component';
import { HolidayCountService } from '../../services/holiday-count.service';
import { CalendarComponent } from 'ng-fullcalendar';
import { LeavesCalendarComponent } from '../leaves-calendar/leaves-calendar.component';
import { StoreModule } from '@ngrx/store';
import { mockState, mockStoreModule } from '../../mocks/store.mock';

describe('LeavesListComponent', () => {
  let component: LeavesListComponent;
  let fixture: ComponentFixture<LeavesListComponent>;

  beforeEach(
    async(() => {
      const lMockService = {
        getLeaves: () => of([]),
      };
      const hMockService = {
        numWorkDays: () => 0,
      };
      TestBed.configureTestingModule({
        declarations: [
          LeavesListComponent,
          TranslateLeaveStatePipe,
          TranslateLeaveTypePipe,
          LeavesCalendarComponent,
          CalendarComponent,
        ],
        imports: [
          ReactiveFormsModule,
          mockStoreModule(),
          MultiselectDropdownModule,
        ],
        providers: [
          { provide: LeavesService, useValue: lMockService },
          { provide: HolidayCountService, useValue: hMockService },
        ],
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
