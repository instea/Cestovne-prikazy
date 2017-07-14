import './App.css';

import {Grid, Row, Col} from 'react-bootstrap';
import React from 'react';
import {Route, Redirect} from 'react-router';
import {ConnectedRouter} from 'react-router-redux';

import history from './singletons/history';
import store from './singletons/store';
import init from './core/init';

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
