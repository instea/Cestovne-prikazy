import * as actions from '../actions/authActions';

export default function doInit(store) {

  const jwt = localStorage.getItem('jwt');
  if (jwt) {
    store.dispatch(actions.autologin(jwt));
  }

}
