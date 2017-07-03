import './TripsApp.css';

import {Grid, Row, Col} from 'react-bootstrap';
import React, { Component } from 'react';
import moment from 'moment';

import Trip from './models/Trip';
import TripList from './components/TripList';
import TripForm from './components/TripForm';

const MODE_LIST = 'MODE_LIST';
const MODE_FORM = 'MODE_FORM';

const DEFAULT_TRIPS = [
  new Trip(moment().add(3, 'hours'), moment().add(3, 'hours'), 'Bratislava, Šoltésovej')
];

class TripsApp extends Component {

  constructor(props) {
    super(props);

    let trips = localStorage.trips && JSON.parse(localStorage.trips);
    if (!trips || !trips.length) {
      trips = DEFAULT_TRIPS;
    }

    this.state = {
      mode: MODE_LIST,
      editedTrip: undefined,
      trips: trips
    };
  }

  showForm = (trip) => {
    this.setState({
      mode: MODE_FORM,
      editedTrip: trip
    });
  }

  add = (trip) => {
    this.setState({
      trips: this.state.trips.concat(trip)
    });
    this.save();
  }

  edit = (trip) => {
    this.setState({
      trips: this.state.trips.map(_trip => trip.id === _trip.id ? trip : _trip)
    });
    this.save();
  }

  remove = (trip) => {
    this.setState({
      trips: this.state.trips.filter(_trip => trip.id !== _trip.id)
    });
    this.save();
  }

  save() {
    localStorage.trips = JSON.stringify(this.state.trips);
    this.setState({
      mode: MODE_LIST
    });
  }

  render() {
    return (
      <Grid>
        <Row>
          <Col sm={12}>
            {this.state.mode === MODE_LIST
              ? <TripList data={this.state.trips} onAdd={this.showForm} onEdit={this.showForm} onRemove={this.remove} />
              : <TripForm data={this.state.editedTrip} onSave={this.state.editedTrip ? this.edit : this.add} />}
          </Col>
        </Row>
      </Grid>
    );
  }

}

export default TripsApp;
