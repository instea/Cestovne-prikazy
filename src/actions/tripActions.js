import * as Trip from '../data/Trip';

export const ADD_TRIP = 'ADD_TRIP';
export const EDIT_TRIP = 'EDIT_TRIP';

export function addTrip(trip, mutate) {
  return (dispatch) => {
    mutate({
      variables: {
        trip: Trip.toSerializable(trip)
      }
    }).then(() => dispatch({
      type: ADD_TRIP,
      trip: trip
    }));
  };
}

export function editTrip(trip, id, mutate) {
  mutate({
    variables: {
      id: id,
      trip: Trip.toSerializable(trip)
    }
  });
  return ({
    type: EDIT_TRIP,
    trip: trip
  });
}
