import { LeavesService } from './../../services/leaves.service';
import { Leave, LeaveType, LeaveState } from './../leave';
import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs/Observable';
import { Store } from '@ngrx/store';
import { AppState } from './../../state/root';
import { ApproveLeave, RejectLeave } from './../../state/leaves';

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
    private store: Store<AppState>
  ) { }

  ngOnInit() {
    this.leaves = this.leaveService.getLeaves();
  }

  // TODO: reuse with leaves-list
  translateLeaveType(type: LeaveType): string {
    return LeaveType[type];
  }

  // TODO: reuse with leaves-list
  translateLeaveState(state: LeaveState): string {
    return LeaveState[state];
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
