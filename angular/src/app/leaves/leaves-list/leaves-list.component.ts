import { getLeaveView } from './../../state/selectors';
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
import { User } from '../../login-page/user';
import {
  FilterLeaves,
  ClearLeavesFilter,
  LeaveListFilter,
  SetLeaveView,
  LeaveView,
} from '../../state/leaves';
import { getLeaveListFilter } from '../../state/selectors';
import {
  isMatchingFilter,
  makeYearOptions,
  makeMonthOptions,
  makeRequesterOptions,
} from '../leaveFilter';

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
  leaves: Observable<Leave[]>;
  view: Observable<LeaveView>;

  constructor(
    private leaveService: LeavesService,
    private formBuilder: FormBuilder,
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
    this.view = getLeaveView(this.store);
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
  setView(view: LeaveView) {
    this.store.dispatch(new SetLeaveView(view));
  }
}
