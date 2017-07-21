import {gql} from 'react-apollo';
import {goBack, push} from 'react-router-redux';
import client from '../singletons/apolloClient';

export const LOGIN = 'LOGIN';
export const REFRESH_JWT = 'REFRESH_JWT';
export const LOGIN_FAILED = 'LOGIN_FAILED';
export const LOGOUT = 'LOGOUT';
export const USER_INFO_RETRIEVED = 'USER_INFO_RETRIEVED';

const loginMutate = (opts) => client.mutate({
  mutation: gql`
    mutation ($user: Credentials) {
      loginUser(user: $user) {
        success,
        message,
        payload
      }
    }
  `,
  ...opts
});

const getUserInfo = (opts) => client.query({
  query: gql`
    query GetUserInfo {
      getUserInfo {
        id,
        username,
        firstName,
        surname,
        isAdmin
      }
    }
  `,
  ...opts
});

export function refreshJwt(jwt) {
  return {
    type: REFRESH_JWT,
    jwt
  };
};

export function autologin(jwt, doGoBack) {
  return (dispatch) => {
    localStorage.setItem('jwt', jwt);
    dispatch({
      type: LOGIN,
      jwt
    });
    client.resetStore();
    getUserInfo().then(res => {
      const info = res.data.getUserInfo;
      if (info) {
        dispatch(userInfoRetrieved(info));
        if (doGoBack) {
          dispatch(goBack());
        }
      }
    });
  };
}

export function login(username, password) {
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
        dispatch(autologin(jwt, true));
      } else {
        dispatch({
          type: LOGIN_FAILED
        });
      }
    }).catch(() => {
      dispatch({
        type: LOGIN_FAILED
      });
    });
  };
}

export function logout() {
  return (dispatch) => {
    localStorage.removeItem('jwt');
    dispatch({
      type: LOGOUT
    });
    client.resetStore();
    dispatch(push("/"));
  };
}

export function userInfoRetrieved(user) {
  return {
    type: USER_INFO_RETRIEVED,
    user: user
  };
}
