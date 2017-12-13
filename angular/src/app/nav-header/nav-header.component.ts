import { UserInfo, LogoutAction } from './../state/auth';
import { Observable } from 'rxjs/Observable';
import { Leave, LeaveState } from './../leaves/leave';
import { LeavesService } from './../services/leaves.service';
import { Component, OnInit } from '@angular/core';
import { Store } from '@ngrx/store';
import { AppState } from '../state/root';
import { getUserInfo } from '../state/selectors';

function isPending(leave: Leave): boolean {
  return leave.state === LeaveState.PENDING;
}

@Component({
  selector: 'app-nav-header',
  templateUrl: './nav-header.component.html',
  styleUrls: ['./nav-header.component.scss']
})
export class NavHeaderComponent implements OnInit {
  userInfo?: UserInfo;
  pendingCount: Observable<number>;

  constructor(
    private store: Store<AppState>,
    private leaveService: LeavesService
  ) {
    getUserInfo(store).subscribe(userInfo => this.userInfo = userInfo);
  }

  ngOnInit() {
    this.pendingCount = this.leaveService
      .getPendingLeaves()
      .map(leaves => leaves.length);
  }

  logout() {
    this.store.dispatch(new LogoutAction());
  }

}
