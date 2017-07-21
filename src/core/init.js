import request from 'superagent';
import {getJwt} from '../selectors/user';
import * as actions from '../actions/authActions';

let interval = undefined;
function periodicallyRefreshJwt(store) {
  if (interval) {
    clearInterval(interval);
  }
  interval = setInterval(() => {
    request
      .post('/refresh-jwt')
      .auth(getJwt(store.getState()) || '', {
        type: 'bearer'
      })
      .end((err, res) => {
        if (!err && res.ok) {
          return store.dispatch(actions.refreshJwt(res.body));
        }
      });
  }, 15 * 60 * 1000);
}

export default function doInit(store) {

  const jwt = localStorage.getItem('jwt');
  if (jwt) {
    store.dispatch(actions.autologin(jwt));
    periodicallyRefreshJwt(store);
  }

}
