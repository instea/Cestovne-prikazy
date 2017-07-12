import {goBack} from 'react-router-redux';
import request from 'superagent';
import * as Trip from '../data/Trip';

export const ADD_TRIP = 'ADD_TRIP';
export const EDIT_TRIP = 'EDIT_TRIP';
export const ADD_USER = 'ADD_USER';
export const EDIT_USER = 'EDIT_USER';
export const LOGIN = 'LOGIN';
export const LOGIN_FAILED = 'LOGIN_FAILED';
export const LOGOUT = 'LOGOUT';
export const PREPARE_EXPORT = 'PREPARE_EXPORT';
export const PREPARE_EXPORT_SUCCESS = 'PREPARE_EXPORT_SUCCESS';
export const PREPARE_EXPORT_FAILURE = 'PREPARE_EXPORT_FAILURE';

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
          username,
          password
        }
      }
    }).then((res) => {
      const jwt = res.data.loginUser.payload;
      if (jwt) {
        localStorage.setItem('jwt', jwt);
        dispatch({
          type: LOGIN,
          jwt
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
    localStorage.removeItem('jwt');
    userPing().then((res) => {
      if (res.data.userPing.success) {
        dispatch({
          type: LOGOUT
        });
      }
    });
  };
}

export function prepareExport(values) {
  return (dispatch) => {

    dispatch({
      type: PREPARE_EXPORT,
      values
    });

    request
      .post('/export')
      .send(values)
      .auth(localStorage.getItem('jwt') || '', {
        type: 'bearer'
      })
      .end((err, res) => {
        if (err || !res.ok) {
          return dispatch({
            type: PREPARE_EXPORT_FAILURE
          });
        }

        dispatch({
          type: PREPARE_EXPORT_SUCCESS,
          url: res.body
        });
      });
  };
}
