import { UserInfo, LogoutAction } from './../state/auth';
import { Component, OnInit } from '@angular/core';
import { Store } from '@ngrx/store';
import { AppState } from '../state/root';
import { getUserInfo } from '../state/selectors';

@Component({
  selector: 'app-nav-header',
  templateUrl: './nav-header.component.html',
  styleUrls: ['./nav-header.component.scss']
})
export class NavHeaderComponent implements OnInit {
  userInfo?: UserInfo;

  constructor(private store: Store<AppState>) {
    getUserInfo(store).subscribe(userInfo => this.userInfo = userInfo);
  }

  ngOnInit() {
  }

  logout() {
    this.store.dispatch(new LogoutAction());
  }

}
