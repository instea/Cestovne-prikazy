import { Action, ActionReducer } from '@ngrx/store';

export interface AuthState {
  token?: string;
}

export const AUTH_INITIAL_STATE: AuthState = {
  token: undefined
};

export function authReducer(state: AuthState, action: Action) {
  return state;
}