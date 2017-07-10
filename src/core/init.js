import * as actions from '../dispatch/actions';

export default function doInit(store) {

   const token = localStorage.getItem('jwt-token');
   if (token) {
      store.dispatch({
         type: actions.LOGIN,
         token
      });
   }

}
