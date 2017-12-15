import { LeavesService } from './../../services/leaves.service';
import { AppState } from './../../state/root';
import { Store } from '@ngrx/store';
import {
  FormBuilder,
  FormControl,
  Validators,
  FormGroup,
} from '@angular/forms';
import { Leave, LeaveType } from './../leave';
import {
  IMultiSelectOption,
  IMultiSelectTexts,
  IMultiSelectSettings,
} from 'angular-2-dropdown-multiselect';
import { Component, OnInit, Input } from '@angular/core';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/combineLatest';
import { HolidayCountService } from '../../services/holiday-count.service';
import { uniqBy, uniq, flatten } from 'lodash';
import { User } from '../../login-page/user';
import {
  FilterLeaves,
  ClearLeavesFilter,
  LeaveListFilter,
} from '../../state/leaves';
import { getLeaveListFilter } from '../../state/selectors';

function makeMonthOptions() {
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return monthNames.map((name, id) => ({ id, name }));
}

function makeRequesterOptions(leaves) {
  const users = uniqBy(leaves.map(leave => leave.requester), user => user.id);
  return users.map(user => ({
    id: user.id,
    name: user.getFullName(),
  }));
}

function makeYearOptions(leaves) {
  const currentYear = new Date().getFullYear();
  const years = uniq(
    flatten(
      leaves
        .map(leave => [
          leave.startDate.getFullYear(),
          leave.endDate.getFullYear(),
        ])
        .concat(currentYear)
    )
  );
  return years.map(year => ({
    id: year,
    name: year.toString(),
  }));
}

function isMatchingFilter(leave: Leave, filter: LeaveListFilter): boolean {
  if (!filter) {
    return true;
  }
  const matchRequester =
    !filter.requesterIds ||
    !filter.requesterIds.length ||
    filter.requesterIds.includes(leave.requester.id);
  const matchMonth =
    !filter.months ||
    !filter.months.length ||
    filter.months.includes(leave.startDate.getMonth()) ||
    filter.months.includes(leave.endDate.getMonth());
  const matchYear =
    !filter.years ||
    !filter.years.length ||
    filter.years.includes(leave.startDate.getFullYear()) ||
    filter.years.includes(leave.endDate.getFullYear());
  return matchRequester && matchMonth && matchYear;
}

@Component({
  selector: 'app-leaves-list',
  templateUrl: './leaves-list.component.html',
  styleUrls: ['./leaves-list.component.scss'],
})
export class LeavesListComponent implements OnInit {
  filteredLeaves$: Observable<Leave[]>;
  filterForm: FormGroup;
  monthOptions: IMultiSelectOption[];
  monthTexts: IMultiSelectTexts = {
    defaultTitle: 'Month',
  };
  requesterOptions: IMultiSelectOption[];
  requesterTexts: IMultiSelectTexts = {
    defaultTitle: 'Requester',
  };
  yearOptions: IMultiSelectOption[];
  yearTexts: IMultiSelectTexts = {
    defaultTitle: 'Year',
  };
  defaultSelectSettings: IMultiSelectSettings = {
    buttonClasses: 'btn btn-default btn-block',
    itemClasses: 'hellooo btn-danger',
    showCheckAll: true,
    showUncheckAll: true,
  };

  constructor(
    private leaveService: LeavesService,
    private formBuilder: FormBuilder,
    public holidayCountService: HolidayCountService,
    private store: Store<AppState>
  ) {}

  updateFilterOptions = leaves => {
    this.monthOptions = makeMonthOptions();
    this.yearOptions = makeYearOptions(leaves);
    this.requesterOptions = makeRequesterOptions(leaves);
  };

  ngOnInit() {
    const leaves$ = this.leaveService.getLeaves();
    const filter$ = getLeaveListFilter(this.store);
    leaves$.subscribe(this.updateFilterOptions);
    this.filteredLeaves$ = Observable.combineLatest(
      leaves$,
      filter$,
      this.filterLeaves
    );
    this.filterForm = this.formBuilder.group({
      requesterModel: new FormControl(),
      monthModel: new FormControl(),
      yearModel: new FormControl(),
    });
    this.filterForm.valueChanges.subscribe(this.updateFilterState);
    filter$.subscribe(this.updateFilterForm);
  }

  filterLeaves = (leaves, filter) => {
    return leaves.filter(leave => isMatchingFilter(leave, filter));
  };

  // update filter state: view -> store
  updateFilterState = model => {
    this.store.dispatch(
      new FilterLeaves({
        requesterIds: model.requesterModel,
        months: model.monthModel,
        years: model.yearModel,
      })
    );
  };

  // update filter state: store -> view
  updateFilterForm = (filter: LeaveListFilter) => {
    this.filterForm.setValue(
      {
        requesterModel: filter.requesterIds.slice(),
        monthModel: filter.months.slice(),
        yearModel: filter.years.slice(),
      },
      {
        emitEvent: false,
      }
    );
  };

  removeLeave(leave: Leave) {
    this.leaveService
      .removeLeave(leave.id)
      .subscribe(data => console.log('done', data));
  }

  clearFilter() {
    this.store.dispatch(new ClearLeavesFilter());
  }
}
