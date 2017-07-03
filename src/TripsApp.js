import './TripsApp.css';

import {Grid, Row, Col} from 'react-bootstrap';
import React, { Component } from 'react';
import moment from 'moment';
import {List} from 'immutable';

import Trip from './models/Trip';
import TripList from './components/TripList';
import TripForm from './components/TripForm';

const MODE_LIST = 'MODE_LIST';
const MODE_FORM = 'MODE_FORM';

class TripsApp extends Component {

  constructor(props) {
    super(props);

    let trips = List();
    try {
      trips = localStorage.trips && JSON.parse(localStorage.trips);
      if (!trips || !trips.length) {
        trips = List();
      } else {
        trips = List(trips.map(trip => new Trip({
          ...trip,
          from: moment(trip.from),
          to: moment(trip.to)
        })));
      }
    } catch (e) {}

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
    const newState = {
      trips: this.state.trips.push(trip)
    }
    this.setState(newState);
    this.save(newState);
  }

  edit = (trip) => {
    const newState = {
      trips: this.state.trips.map(_trip => trip.id === _trip.id ? trip : _trip)
    }
    this.setState(newState);
    this.save(newState);
  }

  remove = (trip) => {
    const newState = {
      trips: this.state.trips.filter(_trip => trip.id !== _trip.id)
    }
    this.setState(newState);
    this.save(newState);
  }

  save(newState) {
    localStorage.trips = JSON.stringify(newState.trips);
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
              : <TripForm data={this.state.editedTrip} onSave={this.state.editedTrip ? this.edit.bind(this) : this.add.bind(this)} />}
          </Col>
        </Row>
      </Grid>
    );
  }

}

export default TripsApp;
