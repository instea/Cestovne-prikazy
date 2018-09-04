import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { forkJoin } from 'rxjs/observable/forkJoin';
import { of } from 'rxjs/observable/of';
import { SummaryComponent } from './summary.component';
import { mockStoreModule, mockState } from '../../mocks/store.mock';
import { LeavesService } from '../../services/leaves.service';
import { HolidayCountService } from '../../services/holiday-count.service';
import { LeaveType, LeaveState } from '../leave';
import { Store } from '@ngrx/store';
import { AppState } from '../../state/root';
import { getUserInfo } from '../../state/selectors';

const user = {
  id: 565,
};

const leaves = [
  {
    id: '1',
    startDate: new Date(2017, 11, 10),
    endDate: new Date(2017, 11, 14),
    type: LeaveType.ANNUAL,
    state: LeaveState.PENDING,
    requester: user,
  },
  {
    id: '2',
    startDate: new Date(2017, 11, 27),
    endDate: new Date(2018, 0, 5),
    type: LeaveType.ANNUAL,
    state: LeaveState.PENDING,
    requester: user,
  },
  {
    id: '3',
    startDate: new Date(2018, 0, 10),
    endDate: new Date(2018, 0, 14),
    type: LeaveType.ANNUAL,
    state: LeaveState.PENDING,
    requester: user,
  },
];

describe('SummaryComponent', () => {
  let component: SummaryComponent;
  let fixture: ComponentFixture<SummaryComponent>;
  let store: Store<AppState>;

  beforeEach(
    async(() => {
      const lMockService = {
        getLeaves: () => of(leaves),
      };
      const hMockService = {
        numWorkDays: () => 5,
      };
      TestBed.configureTestingModule({
        declarations: [SummaryComponent],
        imports: [mockStoreModule()],
        providers: [
          { provide: LeavesService, useValue: lMockService },
          { provide: HolidayCountService, useValue: hMockService },
        ],
      }).compileComponents();
    })
  );

  beforeEach(() => {
    store = TestBed.get(Store);
    mockState(store, 'auth.userInfo', { username: 'testName', id: user.id });
    fixture = TestBed.createComponent(SummaryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should produce correct summary data', () => {
    component.summary$.subscribe(data =>
      expect(data).toEqual([
        { year: 2018, byType: [{ type: 'ANNUAL', count: 10 }] },
        { year: 2017, byType: [{ type: 'ANNUAL', count: 10 }] },
      ])
    );
  });
});
