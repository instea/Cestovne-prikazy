import {Map} from 'immutable';

import * as actions from './actions';

export function user(state = Map(), action) {
   if (action.type === actions.LOGIN) {
      return state.set('jwtToken', action.token).delete('failed');
   }
   if (action.type === actions.LOGIN_FAILED) {
      return state.delete('jwtToken').set('failed', true);
   }
   if (action.type === actions.LOGOUT) {
      return Map();
   }
   return state;
}
