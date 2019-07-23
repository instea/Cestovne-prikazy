import './App.css';

import {Grid, Row, Col} from 'react-bootstrap';
import React from 'react';
import {Route, Redirect} from 'react-router';
import {ConnectedRouter} from 'react-router-redux';

import history from './singletons/history';
import store from './singletons/store';
import init from './core/init';

import MenuBar from './containers/auth/MenuBar';
import TripList from './containers/trips/TripList';
import AddTripForm from './containers/trips/AddTripForm';
import EditTripForm from './containers/trips/EditTripForm';
import LoginForm from './containers/auth/LoginForm';
import UserList from './containers/users/UserList';
import EditUserForm from './containers/users/EditUserForm';
import PlaceList from './containers/places/PlaceList';
import AddPlaceForm from './containers/places/AddPlaceForm';
import EditPlaceForm from './containers/places/EditPlaceForm';
import ExportForm from './containers/export/ExportForm';

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
