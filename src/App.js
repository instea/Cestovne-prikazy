import './App.css';

import thunk from 'redux-thunk';
import {Grid, Row, Col} from 'react-bootstrap';
import React from 'react';
import {createStore, combineReducers, applyMiddleware, compose} from 'redux';
import {Route, Redirect} from 'react-router';
import {ConnectedRouter, routerReducer, routerMiddleware} from 'react-router-redux';
import createHistory from 'history/createBrowserHistory';

import MenuBar from './components/MenuBar';
import TripList from './components/TripList';
import AddTripForm from './components/AddTripForm';
import EditTripForm from './components/EditTripForm';
import LoginForm from './components/LoginForm';
import UserList from './components/UserList';
import AddUserForm from './components/AddUserForm';
import EditUserForm from './components/EditUserForm';
import PlaceList from './components/PlaceList';
import AddPlaceForm from './components/AddPlaceForm';
import EditPlaceForm from './components/EditPlaceForm';
import ExportForm from './components/ExportForm';

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
          <Route exact path="/users" component={UserList} />
          <Route path="/users/add" component={AddUserForm} />
          <Route path="/users/edit/:id" component={EditUserForm} />
          <Route exact path="/places" component={PlaceList} />
          <Route path="/places/add" component={AddPlaceForm} />
          <Route path="/places/edit/:id" component={EditPlaceForm} />
          <Route exact path="/export" component={ExportForm} />
        </Col>
      </Row>
    </Grid>
  </ConnectedRouter>
);
