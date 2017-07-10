import {Map} from 'immutable';

import * as actions from './actions';

export function user(state = Map(), action) {
   if (action.type === actions.LOGIN) {
      return state.set('jwtToken', action.token);
   }
   if (action.type === actions.LOGOUT) {
      return state.delete('jwtToken');
   }
   return state;
}
