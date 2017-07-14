import thunk from 'redux-thunk';
import userReducer from '../reducers/user';
import exportReducer from '../reducers/export';
import {createStore, combineReducers, applyMiddleware, compose} from 'redux';
import {reducer as formReducer} from 'redux-form';
import {routerReducer, routerMiddleware} from 'react-router-redux';
import history from './history';
import client from './apolloClient';

const reducer = combineReducers({
  user: userReducer,
  _export: exportReducer,
  router: routerReducer,
  form: formReducer,
  apollo: client.reducer()
});

const composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose;
const enhancer = composeEnhancers(applyMiddleware(thunk, routerMiddleware(history), client.middleware()));

const store = createStore(reducer, /* preloadedState, */enhancer);
export default store;
