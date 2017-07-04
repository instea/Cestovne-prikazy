import {emptyTrip} from '../models/Trip';

export const SHOW_FORM = 'SHOW_FORM';
export const FORM_MODIFY_FIELD = 'FORM_MODIFY_FIELD';
export const CANCEL_FORM = 'CANCEL_FORM';
export const ADD_TRIP = 'ADD_TRIP';
export const EDIT_TRIP = 'EDIT_TRIP';
export const REMOVE_TRIP = 'REMOVE_TRIP';
export const LOAD_STATE = 'LOAD_STATE';

export const MODE_LIST = 'MODE_LIST';
export const MODE_FORM_EDIT = 'MODE_FORM_EDIT';
export const MODE_FORM_ADD = 'MODE_FORM_ADD';

export function showForm(trip) {
   return {
      type: SHOW_FORM,
      trip: trip || emptyTrip(),
      isNew: !trip
   }
}

export function modifyFormField(key, value) {
  return {
    type: FORM_MODIFY_FIELD,
    key,
    value
  };
}

export function cancelForm() {
  return {
    type: CANCEL_FORM
  };
}

export function addTrip(trip) {
   return {
      type: ADD_TRIP,
      trip: trip
   };
}

export function editTrip(trip) {
   return {
      type: EDIT_TRIP,
      trip: trip
   };
}

export function removeTrip(tripId) {
   return {
      type: REMOVE_TRIP,
      tripId: tripId
   };
}

export function loadState() {
   return {
      type: LOAD_STATE
   };
}
