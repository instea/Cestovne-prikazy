import { AppState } from './root';
import { Store } from '@ngrx/store';
import { map } from 'async';
import { Observable } from 'rxjs/Observable';
import { of } from 'zen-observable';

// AUTH SELECTORS
export const isLoggedIn = (store: Store<AppState>) => store.select(state => !!state.auth.jwt);
export const getJwt = (store: Store<AppState>) => store.select(state => state.auth.jwt);