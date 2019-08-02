import {gql} from 'react-apollo';
import {goBack, push} from 'react-router-redux';
import client from '../singletons/apolloClient';
import { LoginResults } from '../data/LoginResults';

export const LOGIN = 'LOGIN';
export const REFRESH_JWT = 'REFRESH_JWT';
export const LOGIN_FAILED = 'LOGIN_FAILED';
export const LOGOUT = 'LOGOUT';
export const USER_INFO_RETRIEVED = 'USER_INFO_RETRIEVED';

const loginMutate = (opts) => client.mutate({
  mutation: gql`
  mutation ($token_id: String!) {
    loginUser(token_id: $token_id) {
      status,
      jwt
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
        firstName,
        surname,
        isAdmin,
        email,
        approved
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
      jwt,
      status: LoginResults.SUCCESS
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

export function login(token_id) {
  return (dispatch) => {
    loginMutate({
      variables: {
        token_id
      }
    }).then((res) => {
      const status = res.data.loginUser.status;
      switch (status) {
      case LoginResults.SUCCESS:
        const jwt = res.data.loginUser.jwt;
        dispatch(autologin(jwt, true));
        break;
      case LoginResults.NEED_APPROVAL:
        dispatch(loginFailed(LoginResults.NEED_APPROVAL));
        break;
      case LoginResults.WRONG_DOMAIN:
        dispatch(loginFailed(LoginResults.WRONG_DOMAIN));
        break;
      case LoginResults.FAILED:
        dispatch(loginFailed(LoginResults.FAILED));
        break;
      default:
        dispatch(loginFailed(LoginResults.FAILED));
      }
    }).catch(() => {
      dispatch(loginFailed(LoginResults.FAILED));
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
    dispatch(push('/'));
  };
}

export function userInfoRetrieved(user) {
  return {
    type: USER_INFO_RETRIEVED,
    user: user
  };
}

export function loginFailed(loginResult) {
  return {
    type: LOGIN_FAILED,
    loginResult: loginResult
  };
}
