import moment from 'moment';
import {goBack} from 'react-router-redux';

export const ADD_TRIP = 'ADD_TRIP';
export const EDIT_TRIP = 'EDIT_TRIP';
export const ADD_USER = 'ADD_USER';
export const EDIT_USER = 'EDIT_USER';
export const LOGIN = 'LOGIN';
export const LOGIN_FAILED = 'LOGIN_FAILED';
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
      trip: normalizeTrip(trip)
    }
  });
  return ({
    type: EDIT_TRIP,
    trip: trip
  });
}

export function addUser(user, mutate) {
  return (dispatch) => {
    mutate({
      variables: {
        user: user
      }
    }).then(() => dispatch({
      type: ADD_USER,
      user: user
    }));
  };
}

export function editUser(user, id, mutate) {
  mutate({
    variables: {
      id: id,
      user: user
    }
  });
  return ({
    type: EDIT_USER,
    user: user
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
      if (token) {
        localStorage.setItem('jwt-token', token);
        dispatch({
          type: LOGIN,
          token
        });
        dispatch(goBack());
        userPing();
      } else {
        dispatch({
          type: LOGIN_FAILED
        });
      }
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
