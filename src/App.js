import './App.css';

import thunk from 'redux-thunk';
import {Grid, Row, Col} from 'react-bootstrap';
import React from 'react';
import {createStore, combineReducers, applyMiddleware, compose} from 'redux';
import {Route, Redirect} from 'react-router-dom';
import {ConnectedRouter, routerReducer, routerMiddleware} from 'react-router-redux';
import createHistory from 'history/createBrowserHistory';

import MenuBar from './components/MenuBar';
import TripList from './components/TripList';
import AddTripForm from './components/AddTripForm';
import EditTripForm from './components/EditTripForm';
import LoginForm from './components/LoginForm';

import * as reducers from './dispatch/reducers';
import init from './core/init';
import {reducer as formReducer} from 'redux-form';

const reducer = combineReducers({
  ...reducers,
  router: routerReducer,
  form: formReducer
});

const history = createHistory();
const composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose;
const enhancer = composeEnhancers(applyMiddleware(thunk, routerMiddleware(history)));

export const store = createStore(reducer, /* preloadedState, */enhancer);

init(store);

const IndexRedirect = () => <Redirect to="/trips/" />;

export default () => (
  <ConnectedRouter history={history}>
    <Grid>
      <MenuBar />
      <Row>
        <Col sm={12}>
          <Route exact path="/" component={IndexRedirect} />
          <Route exact path="/trips" component={TripList} />
          <Route path="/trips/add" component={AddTripForm} />
          <Route path="/trips/edit/:id" component={EditTripForm} />
          <Route path="/login" component={LoginForm} />
        </Col>
      </Row>
    </Grid>
  </ConnectedRouter>
);
