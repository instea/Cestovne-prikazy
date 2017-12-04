import { AUTH_INITIAL_STATE, authReducer, AuthState } from './auth';

interface AppState {
  auth: AuthState
}

export const INITIAL_STATE: AppState = {
  auth: AUTH_INITIAL_STATE
};

export const reducerDefinitions = {
  authReducer
};