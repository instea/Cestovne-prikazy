import React, {Component} from 'react';
import {connect} from 'react-redux';
import * as actions from '../dispatch/actions';

import {emptyTrip} from '../models/Trip';
import TripForm from './TripForm';

class AddTripForm extends Component {

  render() {
    return (
      <TripForm header="Add trip" onSave={this.props.onSave} initialValues={this.props.initialValues} />
    );
  }

}

const mapStateToProps = (state) => {
  return {
    initialValues: emptyTrip().toObject()
  };
}

const mapDispatchToProps = (dispatch) => {
  return {
    onSave: (trip) => {
      dispatch(actions.addTrip(trip));
    }
  };
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(AddTripForm);
