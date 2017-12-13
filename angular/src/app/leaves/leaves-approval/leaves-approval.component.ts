import { LeavesService } from './../../services/leaves.service';
import { Leave, LeaveType, LeaveState } from './../leave';
import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs/Observable';
import { Store } from '@ngrx/store';
import { AppState } from './../../state/root';
import { ApproveLeave, RejectLeave } from './../../state/leaves';
import { HolidayCountService } from '../../services/holiday-count.service';

function isPending(leave: Leave): boolean {
  return leave.state === LeaveState.PENDING;
}

@Component({
  selector: 'app-leaves-approval',
  templateUrl: './leaves-approval.component.html',
  styleUrls: ['./leaves-approval.component.scss']
})
export class LeavesApprovalComponent implements OnInit {
  leaves: Observable<Leave[]>;
  leaveState: LeaveState;

  constructor(
    private leaveService: LeavesService,
    public holidayCountService: HolidayCountService,
    private store: Store<AppState>
  ) { }

  ngOnInit() {
    this.leaves = this.leaveService
      .getLeaves()
      .map(leaves => leaves.filter(isPending));
  }

  approve(leave: Leave) {
    console.log('approving: ', leave);
    this.store.dispatch(new ApproveLeave(leave));
  }

  reject(leave: Leave) {
    console.log('rejecting: ', leave);
    this.store.dispatch(new RejectLeave(leave));
  }
}
