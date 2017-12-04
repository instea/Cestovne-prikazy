import { Action, ActionReducer } from '@ngrx/store';

const LOCAL_STORAGE_NAME = "jwt";

export const LOGIN_ATTEMPT = 'LOGIN_ATTEMPT';
export const LOGIN_SUCCESSFUL = 'LOGIN_SUCCESSFUL';
export const REFRESH_JWT = 'REFRESH_JWT';
export const LOGIN_FAILED = 'LOGIN_FAILED';
export const LOGOUT = 'LOGOUT';
export const USER_INFO_RETRIEVED = 'USER_INFO_RETRIEVED';

export interface LoginInfo {
  username: string;
  password: string;
}

export interface UserInfo {
  username: string;
  firstName: string;
  surname: string;
  degrees: string;
  address: string;
  isAdmin: boolean;
}

export interface AuthState {
  jwt?: string;
  userInfo?: UserInfo;
}

export const AUTH_INITIAL_STATE: AuthState = {
  jwt: localStorage.getItem(LOCAL_STORAGE_NAME)
};

export function authReducer(state: AuthState, action: AuthAction) {
  return state;
}

export class LoginAttemptAction implements Action {
  readonly type = LOGIN_ATTEMPT;
  constructor(public readonly payload: LoginInfo) {}
}

export class LoginSuccessfulAction implements Action {
  readonly type = LOGIN_SUCCESSFUL;
  constructor(public readonly payload: { jwt: string }) {}
}

export class LoginFailedAction implements Action {
  readonly type = LOGIN_FAILED;
  constructor(public readonly payload: { message: string }) {}
}

export class RefreshJwtAction implements Action {
  readonly type = REFRESH_JWT;
  constructor(public readonly payload: { jwt: string }) {}
}

export class LogoutAction implements Action {
  readonly type = LOGOUT;
  constructor() {}
}

export class UserInfoRetrievedAction implements Action {
  readonly type = USER_INFO_RETRIEVED;
  constructor(public readonly payload: { userInfo: UserInfo }) {}
}

export type AuthAction = LoginAttemptAction
                          | LoginSuccessfulAction
                          | LoginFailedAction
                          | RefreshJwtAction
                          | LogoutAction
                          | UserInfoRetrievedAction;