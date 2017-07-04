import {emptyTrip} from '../models/Trip';
import {saveData, loadData} from '../core/persistence';

export const SHOW_FORM = 'SHOW_FORM';
export const CANCEL_FORM = 'CANCEL_FORM';
export const ADD_TRIP = 'ADD_TRIP';
export const EDIT_TRIP = 'EDIT_TRIP';
export const REMOVE_TRIP = 'REMOVE_TRIP';
export const LOAD_STATE_PROGRESS = 'LOAD_STATE_PROGRESS';
export const LOAD_STATE_SUCCESS = 'LOAD_STATE_SUCCESS';

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

export function cancelForm() {
  return {
    type: CANCEL_FORM
  };
}

function saveState(action) {
   return (dispatch, getState) => {
      dispatch(action);
      saveData(getState().data);
   };
}

export function addTrip(trip) {
   return saveState({
      type: ADD_TRIP,
      trip: trip
   });
}

export function editTrip(trip) {
   return saveState({
      type: EDIT_TRIP,
      trip: trip
   });
}

export function removeTrip(tripId) {
   return saveState({
      type: REMOVE_TRIP,
      tripId: tripId
   });
}

export function loadState() {
   return (dispatch, getState) => {
      dispatch({
         type: LOAD_STATE_PROGRESS
      });
      loadData((data) => {
         dispatch({
            type: LOAD_STATE_SUCCESS,
            data: data
         });
      });
   };
}
