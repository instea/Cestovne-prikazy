import { getLoginResult } from '../state/selectors';
import { Component, OnInit } from '@angular/core';
import { Store } from '@ngrx/store';
import { AppState } from '../state/root';
import { LoginAttemptAction } from '../state/auth';
import { Observable } from 'rxjs/Observable';
import { AuthService } from 'angularx-social-login';
import { GoogleLoginProvider } from 'angularx-social-login';
import { LoginResults } from '../state/login.result';

@Component({
  selector: 'app-login-page',
  templateUrl: './login-page.component.html',
  styleUrls: ['./login-page.component.scss'],
})
export class LoginPageComponent implements OnInit {
  errorMessage: Observable<{ message: string; isError: boolean }>;

  constructor(
    private store: Store<AppState>,
    private authService: AuthService
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

  ngOnInit() {}

  signIn(): void {
    this.authService.signIn(GoogleLoginProvider.PROVIDER_ID).then(res => {
      this.store.dispatch(new LoginAttemptAction(res.idToken));
    });
  }
}
