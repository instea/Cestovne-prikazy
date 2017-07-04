import {List} from 'immutable';
import {combineReducers} from 'redux';

import * as actions from './actions';

const initialValueReducers = {
   trip: (state = {}, action) => {
      switch (action.type) {
         case actions.SHOW_FORM:
            return action.trip.toObject();
         case actions.CANCEL_FORM:
         case actions.ADD_TRIP:
         case actions.EDIT_TRIP:
         case actions.REMOVE_TRIP:
            return {};
         default:
            return state;
      }
   }
};
export const formInitialValues = combineReducers(initialValueReducers);

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

export function mode(state = actions.MODE_LIST, action) {
   switch (action.type) {
      case actions.SHOW_FORM:
         return action.isNew ? actions.MODE_FORM_ADD : actions.MODE_FORM_EDIT;
      case actions.CANCEL_FORM:
         return actions.MODE_LIST;
      case actions.ADD_TRIP:
      case actions.EDIT_TRIP:
      case actions.REMOVE_TRIP:
         return actions.MODE_LIST;
      default:
         return state;
   }
}
