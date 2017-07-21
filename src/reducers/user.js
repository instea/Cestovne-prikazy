import {Map} from 'immutable';
import * as a from '../actions/authActions';

export default function user(state = Map(), action) {
  if (action.type === a.LOGIN) {
    return state
      .set('jwt', action.jwt)
      .delete('loginFailed');
  }
  if (action.type === a.REFRESH_JWT) {
    return state
      .set('jwt', action.jwt);
  }
  if (action.type === a.USER_INFO_RETRIEVED) {
    return state
      .set('info', action.user);
  }
  if (action.type === a.LOGIN_FAILED) {
    return state
      .delete('jwt')
      .set('loginFailed', true);
  }
  if (action.type === a.LOGOUT) {
    return Map();
  }
  return state;
}
