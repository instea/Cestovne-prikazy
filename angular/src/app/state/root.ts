import { AUTH_INITIAL_STATE, authReducer, AuthState } from './auth';
import { routerReducer, RouterState } from '@ngrx/router-store';

export interface AppState {
  auth: AuthState;
  router: RouterState;
}

export const INITIAL_STATE: AppState = {
  auth: AUTH_INITIAL_STATE,
  router: {
    path: window.location.pathname + window.location.search
  }
};

export const reducerDefinitions = {
  auth: authReducer,
  router: routerReducer,
};