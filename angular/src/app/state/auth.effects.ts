import { REFRESH_JWT_INTERVAL, REFRESH_JWT_URL } from '../constants';
import { AuthService } from '../auth.service';
import { Actions, Effect } from '@ngrx/effects';
import {
  AuthAction,
  AUTOLOGIN,
  JWL_LOCAL_STORAGE_NAME,
  LOGIN_ATTEMPT,
  LOGIN_SUCCESSFUL,
  LoginAttemptAction,
  LoginFailedAction,
  LoginSuccessfulAction,
  LOGOUT,
  LogoutAction,
  RefreshJwtAction,
  UserInfoRetrievedAction,
} from './auth';
import 'rxjs/add/operator/switchMap';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/catch';
import 'rxjs/add/operator/do';
import 'rxjs/add/operator/filter';
import 'rxjs/add/operator/takeWhile';
import { of } from 'rxjs/observable/of';
import { interval } from 'rxjs/observable/interval';
import { Observable } from 'rxjs/Observable';
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subscription } from 'rxjs/Subscription';

@Injectable()
export class AuthEffects {

  private refreshedJwt?: string;

  constructor(
    private actions: Actions,
    private authService: AuthService,
    private httpClient: HttpClient,
  ) { }

  @Effect() autologin = this.actions
    .ofType(AUTOLOGIN)
    .map(() => localStorage.getItem(JWL_LOCAL_STORAGE_NAME))
    .filter((jwt) => !!jwt)
    .switchMap((jwt) => of(new LoginSuccessfulAction({ jwt })));

  @Effect() login = this.actions
    .ofType(LOGIN_ATTEMPT)
    .switchMap((action) => this.authService.loginUser(action.payload)
      .map(jwt => new LoginSuccessfulAction({ jwt }))
      .catch(err => of(new LoginFailedAction({ message: err }))));

  stopRefreshing() {
    this.refreshedJwt = undefined;
  }

  createRefresher(jwt: string) {
    this.stopRefreshing();
    this.refreshedJwt = jwt;
    return interval(REFRESH_JWT_INTERVAL).takeWhile(() => jwt === this.refreshedJwt);
  }

  @Effect() refreshJwt = this.actions
    .ofType(LOGIN_SUCCESSFUL)
    .switchMap(({ payload: { jwt } }) => 
      this.createRefresher(jwt).switchMap(() =>
        this.httpClient.post(REFRESH_JWT_URL, undefined, {
          headers: new HttpHeaders({
            'Authorization': `Bearer ${jwt}`
          })
        }).map((newJwt: any) => new RefreshJwtAction({ jwt: newJwt }))));

  @Effect({ dispatch: false }) logout = this.actions
    .ofType(LOGOUT)
    .do(() => this.stopRefreshing())
    .do(() => this.authService.logoutUser());

  @Effect() loadUserInfo = this.actions
    .ofType(LOGIN_SUCCESSFUL)
    .switchMap((action) => this.authService.getUserInfo()
      // Empty response means stale jwt - we need to perform autologout
      .map((userInfo) => userInfo
        ? new UserInfoRetrievedAction({ userInfo })
        : new LogoutAction()));

}
