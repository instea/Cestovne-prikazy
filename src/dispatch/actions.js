import moment from 'moment';

export const SHOW_FORM = 'SHOW_FORM';
export const CANCEL_FORM = 'CANCEL_FORM';
export const ADD_TRIP = 'ADD_TRIP';
export const EDIT_TRIP = 'EDIT_TRIP';
export const LOGIN = 'LOGIN';
export const LOGOUT = 'LOGOUT';

const normalizeTrip = (trip) => ({
   id: trip.id,
   place: trip.place,
   from: moment(trip.from).toISOString(),
   to: moment(trip.to).toISOString()
});

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
        trip: normalizeTrip(trip)
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
      trip: normalizeTrip(trip)
    }
  });
  return ({
    type: EDIT_TRIP,
    trip: trip
  });
}

export function login(username, password, mutate) {
  return (dispatch) => {
    mutate({
      variables: {
        username,
        password
      }
    }).then((res) => {
      const token = res.data.loginUser.payload;
      localStorage.setItem('jwt-token', token);
      dispatch({
        type: LOGIN,
        token
      });
    });
  };
}

export function logout(mutate) {
  return (dispatch) => {
    localStorage.removeItem('jwt-token');
    mutate().then((res) => {
      if (res.data.logoutUser.success) {
        dispatch({
          type: LOGOUT
        });
      }
    });
  };
}
