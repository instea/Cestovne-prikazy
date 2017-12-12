import { LEAVES_INITIAL_STATE, LeavesState, leavesReducer } from './leaves';
import { AUTH_INITIAL_STATE, authReducer, AuthState } from './auth';
import { routerReducer, RouterState } from '@ngrx/router-store';

export interface AppState {
  auth: AuthState;
  router: RouterState;
  leaves: LeavesState;
}

export const INITIAL_STATE: AppState = {
  auth: AUTH_INITIAL_STATE,
  router: {
    path: window.location.pathname + window.location.search
  },
  leaves: LEAVES_INITIAL_STATE,
};

export const reducerDefinitions = {
  auth: authReducer,
  router: routerReducer,
  leaves: leavesReducer,
};
