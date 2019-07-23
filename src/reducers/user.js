import {Map} from 'immutable';
import * as a from '../actions/authActions';
import {LoginResults} from '../data/LoginResults';

export default function user(state = Map(), action) {
  if (action.type === a.REFRESH_JWT) {
    return state
      .set('jwt', action.jwt);
  }
  if (action.type === a.USER_INFO_RETRIEVED) {
    return state
      .set('info', action.user);
  }
  if (action.type === a.LOGIN) {
    return state
      .set('jwt', action.jwt)
      .delete('loginResult')
  }
  if (action.type === a.LOGIN_FAILED) {
    return state
      .delete('jwt')
      .set('loginResult', LoginResults.FAILED)
  }
  if (action.type === a.USER_NEED_APPROVAL) {
    return state
      .delete('jwt')
      .set('loginResult', LoginResults.NEED_APPROVAL)
  }
  if (action.type === a.LOGIN_FAILED_WRONG_DOMAIN) {
    return state
      .delete('jwt')
      .set('loginResult', LoginResults.WRONG_DOMAIN)
  }
  if (action.type === a.LOGOUT) {
    return Map();
  }
  return state;
}
