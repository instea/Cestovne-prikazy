import { AppState } from './root';
import { Store } from '@ngrx/store';

// AUTH SELECTORS
export const isLoggedIn = (store: Store<AppState>) =>
  store.select(state => !!state.auth.jwt);
export const getJwt = (store: Store<AppState>) =>
  store.select(state => state.auth.jwt);
export const getUserInfo = (store: Store<AppState>) =>
  store.select(state => state.auth.userInfo);
export const isLoginInProgess = (store: Store<AppState>) =>
  store.select(state => state.auth.loginInProgress);
export const getLoginResult = (store: Store<AppState>) =>
  store.select(state => state.auth.loginResult);
export const getLeaveListFilter = (store: Store<AppState>) =>
  store.select(state => state.leaves.leaveListFilter);

// LEAVES SELECTORS
export const getLeaveView = (store: Store<AppState>) =>
  store.select(state => state.leaves.view);
export const getExportProgress = (store: Store<AppState>) =>
  store.select(state => state.leaves.exportInProgress);
export const getExportedUrl = (store: Store<AppState>) =>
  store.select(state => state.leaves.exportedUrl);
export const getExportError = (store: Store<AppState>) =>
  store.select(state => state.leaves.exportError);
