import { AuthService } from '../auth.service';
import { Actions, Effect } from '@ngrx/effects';
import {
  AuthAction,
  LOGIN_ATTEMPT,
  LoginAttemptAction,
  LoginFailedAction,
  LoginSuccessfulAction,
} from './auth';
import 'rxjs/add/operator/switchMap';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/catch';
import { of } from 'rxjs/observable/of';
import { Observable } from 'rxjs/Observable';
import { Injectable } from '@angular/core';

@Injectable()
export class AuthEffects {

  constructor(
    private actions: Actions,
    private authService: AuthService
  ) { }

  handleLogin(action: LoginAttemptAction): Observable<AuthAction> {
    return this.authService.loginUser(action.payload)
      .map(jwt => new LoginSuccessfulAction({ jwt }))
      .catch(err => of(new LoginFailedAction({ message: err })));
  }

  @Effect() login(): Observable<AuthAction> {
    return this.actions
      .ofType(LOGIN_ATTEMPT)
      .switchMap((action) => this.handleLogin(<LoginAttemptAction> action));
  }

}
