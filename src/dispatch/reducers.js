import {List, Map} from 'immutable';
import moment from 'moment';

import Trip from '../models/Trip';
import * as actions from './actions';

export function form(state = Map(), action) {
   switch (action.type) {
      case actions.SHOW_FORM:
         return action.trip;
      case actions.FORM_MODIFY_FIELD:
         return state.set(action.key, action.value);
      case actions.CANCEL_FORM:
      case actions.ADD_TRIP:
      case actions.EDIT_TRIP:
      case actions.REMOVE_TRIP:
         return Map();
      default:
         return state;
   }
}

function saveState(data) {
   localStorage.trips = JSON.stringify(data);
   return data;
}

export function data(state = List(), action) {
   switch (action.type) {
      case actions.ADD_TRIP:
         return saveState(state.push(action.trip));
      case actions.EDIT_TRIP:
         return saveState(state.map(trip => action.trip.id === trip.id ? action.trip : trip));
      case actions.REMOVE_TRIP:
         return saveState(state.filter(trip => action.tripId !== trip.id));
      case actions.LOAD_STATE:
         let trips = List();
         try {
            trips = localStorage.trips && JSON.parse(localStorage.trips);
            if (!trips || !trips.length) {
              trips = List();
            } else {
              trips = List(trips.filter(trip => trip && trip.id).map(trip => new Trip({
                ...trip,
                from: moment(trip.from),
                to: moment(trip.to)
              })));
            }
         } catch (e) {}
         return trips;
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
