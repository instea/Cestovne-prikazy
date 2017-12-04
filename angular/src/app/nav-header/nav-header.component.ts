import { UserInfo } from './../state/auth';
import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-nav-header',
  templateUrl: './nav-header.component.html',
  styleUrls: ['./nav-header.component.scss']
})
export class NavHeaderComponent implements OnInit {
  userInfo?: UserInfo;

  constructor() {
    // TODO temp
    this.userInfo = {
      username: 'Test',
      firstName: 'First',
      surname: 'Surname',
      degrees: '',
      address: 'Address line 35',
      isAdmin: false,
    }
  }

  ngOnInit() {
  }

}
