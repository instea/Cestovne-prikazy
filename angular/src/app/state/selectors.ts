import { AppState } from './root';
import { Store } from '@ngrx/store';
import { map } from 'async';
import { Observable } from 'rxjs/Observable';
import { of } from 'zen-observable';

// AUTH SELECTORS
export const isLoggedIn = (store: Store<AppState>) =>
  store.select(state => !!state.auth.jwt);
export const getJwt = (store: Store<AppState>) =>
  store.select(state => state.auth.jwt);
export const getUserInfo = (store: Store<AppState>) =>
  store.select(state => state.auth.userInfo);
export const isLoginInProgess = (store: Store<AppState>) =>
  store.select(state => state.auth.loginInProgress);
export const getLoginErrorMessage = (store: Store<AppState>) =>
  store.select(state => state.auth.loginError);
export const getLeaveListFilter = (store: Store<AppState>) =>
  store.select(state => state.leaves.leaveListFilter);

// LEAVES SELECTORS
export const getLeaveView = (store: Store<AppState>) =>
  store.select(state => state.leaves.view);
export const getExportProgress = (store: Store<AppState>) =>
  store.select(state => state.leaves.exportInProgress);
export const getExportedUrl = (store: Store<AppState>) =>
  store.select(state => state.leaves.exportedUrl);
