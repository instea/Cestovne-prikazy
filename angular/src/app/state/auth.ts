import { Action, ActionReducer } from '@ngrx/store';

export const JWL_LOCAL_STORAGE_NAME = 'jwt';

export const AUTOLOGIN = 'AUTOLOGIN';
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
  loginInProgress: boolean;
  loginError?: string;
}

export const AUTH_INITIAL_STATE: AuthState = {
  loginInProgress: false
};

export function authReducer(state: AuthState, action: AuthAction) {
  switch (action.type) {
    case LOGIN_ATTEMPT:
      return {
        ...state,
        loginInProgress: true,
        loginError: undefined,
        jwt: undefined,
        userInfo: undefined
      };
    case LOGIN_FAILED:
      return {
        ...state,
        loginInProgress: false,
        loginError: action.payload.message,
        jwt: undefined,
        userInfo: undefined
      };
    case LOGIN_SUCCESSFUL:
      return {
        ...state,
        loginInProgress: false,
        loginError: undefined,
        jwt: action.payload.jwt,
        userInfo: undefined
      };
    case LOGOUT:
      return {
        ...state,
        loginInProgress: false,
        loginError: undefined,
        jwt: undefined,
        userInfo: undefined
      };
    case REFRESH_JWT:
      return {
        ...state,
        jwt: action.payload.jwt,
      };
    case USER_INFO_RETRIEVED:
      return {
        ...state,
        userInfo: action.payload.userInfo
      };
    default:
      return state;
  }
}

export class AutologinAction implements Action {
  readonly type = AUTOLOGIN;
  constructor() {}
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

export type AuthAction = AutologinAction
                          | LoginAttemptAction
                          | LoginSuccessfulAction
                          | LoginFailedAction
                          | RefreshJwtAction
                          | LogoutAction
                          | UserInfoRetrievedAction;
