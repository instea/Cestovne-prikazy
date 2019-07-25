import { AppState } from './root';
import { Store } from '@ngrx/store';
import { REFRESH_JWT_INTERVAL, REFRESH_JWT_URL } from '../constants';
import { AuthService } from '../auth.service';
import { Actions, Effect } from '@ngrx/effects';
import {
  AUTOLOGIN,
  JWL_LOCAL_STORAGE_NAME,
  LOGIN_ATTEMPT,
  LOGIN_SUCCESSFUL,
  LoginFailedAction,
  LoginSuccessfulAction,
  LOGOUT,
  LogoutAction,
  RefreshJwtAction,
  UserInfoRetrievedAction,
  LoginResult,
  LoginNeedApprovalAction,
  LoginWrongDomainAction,
} from './auth';
import 'rxjs/add/operator/switchMap';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/do';
import 'rxjs/add/operator/filter';
import 'rxjs/add/operator/takeWhile';
import 'rxjs/add/operator/delay';
import { of } from 'rxjs/observable/of';
import { interval } from 'rxjs/observable/interval';
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LoginResults } from './login.result';

@Injectable()
export class AuthEffects {
  constructor(
    private actions: Actions,
    private authService: AuthService,
    private httpClient: HttpClient,
    private store: Store<AppState>
  ) {}

  @Effect()
  autologin = this.actions
    .ofType(AUTOLOGIN)
    .map(() => localStorage.getItem(JWL_LOCAL_STORAGE_NAME))
    .filter(jwt => !!jwt)
    .switchMap(jwt => of(new LoginSuccessfulAction({ jwt })));

  @Effect()
  login = this.actions.ofType(LOGIN_ATTEMPT).switchMap(action =>
    this.authService
      .loginUser(action.payload)
      // .delay(500) // Just for effect
      .map((loginResult: LoginResult) => {
        switch (loginResult.status) {
          case LoginResults.SUCCESS:
            return new LoginSuccessfulAction({ jwt: loginResult.jwt });
          case LoginResults.NEED_APPROVAL:
            return new LoginNeedApprovalAction();
          case LoginResults.WRONG_DOMAIN:
            return new LoginWrongDomainAction();
          case LoginResults.FAILED:
            return new LoginFailedAction();
          default:
            return new LoginFailedAction();
        }
      })
  );

  @Effect()
  refreshJwt = this.actions.ofType(LOGIN_SUCCESSFUL).switchMap(() =>
    this.createRefresher().switchMap(jwt =>
      this.httpClient
        .post(REFRESH_JWT_URL, undefined)
        .do((newJwt: any) => this.authService.afterLogin(newJwt))
        .map((newJwt: any) => new RefreshJwtAction({ jwt: newJwt }))
    )
  );

  @Effect({ dispatch: false })
  afterLogin = this.actions
    .ofType(LOGIN_SUCCESSFUL)
    .do((action: LoginSuccessfulAction) =>
      this.authService.afterLogin(action.payload.jwt)
    );

  @Effect({ dispatch: false })
  logout = this.actions.ofType(LOGOUT).do(() => this.authService.logoutUser());

  @Effect()
  loadUserInfo = this.actions.ofType(LOGIN_SUCCESSFUL).switchMap(action =>
    this.authService
      .getUserInfo()
      // Empty response means stale jwt - we need to perform autologout
      .map(
        userInfo =>
          userInfo
            ? new UserInfoRetrievedAction({ userInfo })
            : new LogoutAction()
      )
  );

  createRefresher() {
    return interval(REFRESH_JWT_INTERVAL).takeWhile(
      () => !!this.authService.getJwtToken()
    );
  }
}
