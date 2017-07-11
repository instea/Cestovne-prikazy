import {Map} from 'immutable';

import * as actions from './actions';
import {LOCATION_CHANGE} from 'react-router-redux';

export function user(state = Map(), action) {
  if (action.type === actions.LOGIN) {
    return state.set('jwt', action.jwt).delete('failed');
  }
  if (action.type === actions.LOGIN_FAILED) {
    return state.delete('jwt').set('failed', true);
  }
  if (action.type === actions.LOGOUT) {
    return Map();
  }
  return state;
}

export function _export(state = Map(), action) {
  if (action.type === actions.PREPARE_EXPORT) {
    return state.set('loading', true).delete('url').delete('error');
  }
  if (action.type === actions.PREPARE_EXPORT_FAILURE) {
    return state.set('loading', false).set('error', true);
  }
  if (action.type === actions.PREPARE_EXPORT_SUCCESS) {
    return state.set('loading', false).set('url', action.url).set('error', false);
  }
  if (action.type === LOCATION_CHANGE && action.payload.pathname.startsWith('/export')) {
    return Map();
  }
  return state;
}
