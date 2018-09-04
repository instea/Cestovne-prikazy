import { of } from 'rxjs/observable/of';
import { DebugElement } from '@angular/core';
import { By } from '@angular/platform-browser';
import { AppState } from '../../state/root';
import { Store } from '@ngrx/store';
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
import { mockState, mockStoreModule } from '../../mocks/store.mock';
import { LeaveType, LeaveState } from '../leave';
import { User } from '../../login-page/user';

const makeUser = id => {
  const user = new User();
  user.id = id;
  user.firstName = id;
  user.surname = id;
  user.username = id;
  return user;
};

const user1 = makeUser('1');
const user2 = makeUser('2');
const user3 = makeUser('3');

const leaves = [
  {
    id: '1',
    startDate: new Date(2017, 11, 5),
    endDate: new Date(2017, 11, 5),
    type: LeaveType.ANNUAL,
    state: LeaveState.PENDING,
    requester: user1,
  },
  {
    id: '2',
    startDate: new Date(2018, 11, 5),
    endDate: new Date(2018, 11, 5),
    type: LeaveType.ANNUAL,
    state: LeaveState.PENDING,
    requester: user2,
  },
  {
    id: '3',
    startDate: new Date(2017, 10, 5),
    endDate: new Date(2019, 3, 1),
    type: LeaveType.ANNUAL,
    state: LeaveState.PENDING,
    requester: user3,
  },
];

describe('LeavesListComponent', () => {
  let component: LeavesListComponent;
  let fixture: ComponentFixture<LeavesListComponent>;
  let store: Store<AppState>;
  let de: DebugElement;

  beforeEach(
    async(() => {
      const lMockService = {
        getLeaves: () => of(leaves),
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
    store = TestBed.get(Store);
    fixture = TestBed.createComponent(LeavesListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display all leaves', () => {
    de = fixture.debugElement.query(By.css('#leaveList tbody'));
    const rows = de.children;
    expect(rows.length).toBe(3);
    expect(rows[0].nativeElement.textContent).toContain(user1.getFullName());
    expect(rows[1].nativeElement.textContent).toContain(user2.getFullName());
    expect(rows[2].nativeElement.textContent).toContain(user3.getFullName());
  });

  it('should display filtered leaves', () => {
    mockState(store, 'leaves.leaveListFilter', { months: [11], years: [2017] });
    fixture.detectChanges();
    de = fixture.debugElement.query(By.css('#leaveList tbody'));
    const rows = de.children;
    expect(rows.length).toBe(2);
    expect(rows[0].nativeElement.textContent).toContain(user1.getFullName());
    expect(rows[1].nativeElement.textContent).toContain(user3.getFullName());
  });
});
