import './TripsApp.css';

import thunk from 'redux-thunk';
import {Grid, Row, Col} from 'react-bootstrap';
import React from 'react';
import {createStore, combineReducers, applyMiddleware, compose} from 'redux';
import {Route} from 'react-router-dom';
import {ConnectedRouter, routerReducer, routerMiddleware} from 'react-router-redux';
import createHistory from 'history/createBrowserHistory';

import TripList from './components/TripList';
import AddTripForm from './components/AddTripForm';
import EditTripForm from './components/EditTripForm';

import * as reducers from './dispatch/reducers';
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

export default () => (
  <ConnectedRouter history={history}>
    <Grid>
      <Row>
        <Col sm={12}>
          <Route exact path="/" component={TripList} />
          <Route path="/add" component={AddTripForm} />
          <Route path="/edit/:id" component={EditTripForm} />
        </Col>
      </Row>
    </Grid>
  </ConnectedRouter>
);
