import {Map} from 'immutable';
import {LOCATION_CHANGE} from 'react-router-redux';
import * as a from '../actions/exportActions';

export default function _export(state = Map(), action) {
  if (action.type === a.PREPARE_EXPORT) {
    return state.set('loading', true).delete('url').delete('error');
  }
  if (action.type === a.PREPARE_EXPORT_FAILURE) {
    return state.set('loading', false).set('error', true);
  }
  if (action.type === a.PREPARE_EXPORT_SUCCESS) {
    return state.set('loading', false).set('url', action.url).set('error', false);
  }
  if (action.type === LOCATION_CHANGE && action.payload.pathname.startsWith('/export')) {
    return Map();
  }
  return state;
}
