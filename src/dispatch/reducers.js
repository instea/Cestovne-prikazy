import {List} from 'immutable';

import * as actions from './actions';

export function data(state = List(), action) {
   switch (action.type) {
      case actions.ADD_TRIP:
         return state.push(action.trip);
      case actions.EDIT_TRIP:
         return state.map(trip => action.trip.id === trip.id ? action.trip : trip);
      case actions.REMOVE_TRIP:
         return state.filter(trip => action.tripId !== trip.id);
      case actions.LOAD_STATE_SUCCESS:
         return action.data;
      default:
         return state;
   }
}
