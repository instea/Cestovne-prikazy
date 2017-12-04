import { Action, ActionReducer } from '@ngrx/store';

const LOCAL_STORAGE_NAME = "jwt";

/*export const LOGIN = 'LOGIN';
export const REFRESH_JWT = 'REFRESH_JWT';
export const LOGIN_FAILED = 'LOGIN_FAILED';
export const LOGOUT = 'LOGOUT';
export const USER_INFO_RETRIEVED = 'USER_INFO_RETRIEVED';*/

export interface AuthState {
  jwt?: string;
}

export const AUTH_INITIAL_STATE: AuthState = {
  jwt: localStorage.getItem(LOCAL_STORAGE_NAME)
};

export function authReducer(state: AuthState, action: Action) {
  return state;
}