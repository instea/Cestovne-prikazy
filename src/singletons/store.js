import thunk from 'redux-thunk';
import * as reducers from '../dispatch/reducers';
import {createStore, combineReducers, applyMiddleware, compose} from 'redux';
import {reducer as formReducer} from 'redux-form';
import {routerReducer, routerMiddleware} from 'react-router-redux';
import history from './history';

const reducer = combineReducers({
  ...reducers,
  router: routerReducer,
  form: formReducer
});

const composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose;
const enhancer = composeEnhancers(applyMiddleware(thunk, routerMiddleware(history)));

const store = createStore(reducer, /* preloadedState, */enhancer);
export default store;
