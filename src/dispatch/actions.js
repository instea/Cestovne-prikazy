//import {gql, graphql} from 'react-apollo';

export const SHOW_FORM = 'SHOW_FORM';
export const CANCEL_FORM = 'CANCEL_FORM';
export const ADD_TRIP = 'ADD_TRIP';
export const EDIT_TRIP = 'EDIT_TRIP';

export function showForm(tripId) {
   return {
      type: SHOW_FORM,
      tripId: tripId
   }
}

export function cancelForm() {
  return {
    type: CANCEL_FORM
  };
}

export function addTrip(trip, mutate) {
   return (dispatch) => {
      mutate({
         variables: {
            trip: trip
         }
      }).then(()=> dispatch({
         type: ADD_TRIP,
         trip: trip
      }));
   };
}

export function editTrip(trip, id, mutate) {
   mutate({
      variables: {
         id: id,
         trip: trip
      }
   });
   return ({
      type: EDIT_TRIP,
      trip: trip
   });
}
