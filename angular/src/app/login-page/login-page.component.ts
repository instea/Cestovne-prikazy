import { getLoginResult } from '../state/selectors';
import { Component, OnInit } from '@angular/core';
import { Store } from '@ngrx/store';
import { AppState } from '../state/root';
import { LoginAttemptAction } from '../state/auth';
import { Observable } from 'rxjs/Observable';
import { LoginResults } from '../state/login.result';
import { NgZone } from '@angular/core';

@Component({
  selector: 'app-login-page',
  templateUrl: './login-page.component.html',
  styleUrls: ['./login-page.component.scss'],
})
export class LoginPageComponent implements OnInit {
  errorMessage: Observable<{ message: string; isError: boolean }>;

  constructor(
    private store: Store<AppState>,
    private ngZone: NgZone
  ) {
    this.errorMessage = getLoginResult(store).map(value => {
      switch (value) {
        case LoginResults.FAILED:
          return { message: 'Login failed. Try again later.', isError: true };
        case LoginResults.WRONG_DOMAIN:
          return {
            message: 'Used email does not belong to given hosted domain.',
            isError: true,
          };
        case LoginResults.NEED_APPROVAL:
          return {
            message: 'Account needs to be approved by admin first.',
            isError: false,
          };
      }
    });
  }

  ngOnInit() {
    this.loadGoogleSSO()
  }

  loadGoogleSSO() {
    window["google"].accounts.id.initialize({
      client_id: '914978031481-bk8e8bj1ur0vhq4qlh7n7875drin9r0e.apps.googleusercontent.com', // Google id from console
      callback: this.handleCredentialResponse.bind(this)
    })
    window["google"].accounts.id.renderButton(document.getElementById("google-button"), {theme: 'outline', size: 'large'})
  }

  handleCredentialResponse(response: any) {
    this.ngZone.run(() => {
      this.store.dispatch(new LoginAttemptAction(response.credential));
    })
  }
}
