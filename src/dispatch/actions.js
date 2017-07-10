import moment from 'moment';

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

export function login(username, password, loginMutate, userPing) {
  return (dispatch) => {
    loginMutate({
      variables: {
        user: {
          name: username,
          password
        }
      }
    }).then((res) => {
      const token = res.data.loginUser.payload;
      localStorage.setItem('jwt-token', token);
      dispatch({
        type: LOGIN,
        token
      });
      userPing();
    });
  };
}

export function logout(userPing) {
  return (dispatch) => {
    localStorage.removeItem('jwt-token');
    userPing().then((res) => {
      if (res.data.userPing.success) {
        dispatch({
          type: LOGOUT
        });
      }
    });
  };
}
