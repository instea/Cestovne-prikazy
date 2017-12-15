import { LeavesService } from './../../services/leaves.service';
import { Leave, LeaveType } from './../leave';
import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs/Observable';
import { HolidayCountService } from '../../services/holiday-count.service';
import { Store } from '@ngrx/store';
import { AppState } from '../../state/root';
import { LeaveView, SetLeaveView } from '../../state/leaves';
import { getLeaveView } from '../../state/selectors';

@Component({
  selector: 'app-leaves-list',
  templateUrl: './leaves-list.component.html',
  styleUrls: ['./leaves-list.component.scss']
})
export class LeavesListComponent implements OnInit {
  leaves: Observable<Leave[]>;
  view: Observable<LeaveView>;

  constructor(
    private leaveService: LeavesService,
    public holidayCountService: HolidayCountService,
    private store: Store<AppState>
  ) {}

  ngOnInit() {
    this.leaves = this.leaveService.getLeaves();
    this.view = getLeaveView(this.store);
  }

  removeLeave(leave: Leave) {
    this.leaveService
      .removeLeave(leave.id)
      .subscribe(data => console.log('done', data));
  }

  setView(view: LeaveView) {
    this.store.dispatch(new SetLeaveView(view));
  }
}
