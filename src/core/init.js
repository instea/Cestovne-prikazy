import * as actions from '../dispatch/actions';

export default function doInit(store) {

  const jwt = localStorage.getItem('jwt');
  if (jwt) {
    store.dispatch({
      type: actions.LOGIN,
      jwt
    });
  }

}
