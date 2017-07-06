import React, {Component} from 'react';
import {connect} from 'react-redux';
import * as actions from '../dispatch/actions';
import {Redirect} from 'react-router-dom';

import TripForm from './TripForm';

class AddTripForm extends Component {

  render() {
    const iv = this.props.initialValues;

    if (iv) {
      return <TripForm header="Edit trip" onSave={this.props.onSave} initialValues={iv} />;
    } else {
      return <Redirect to="/" />;
    }
  }

}

const mapStateToProps = (state, ownProps) => {
  const iv = state.data.find(trip => trip.id === ownProps.match.params.id);
  return {
    initialValues: iv && iv.toObject()
  };
}

const mapDispatchToProps = (dispatch) => {
  return {
    onSave: (trip) => {
      dispatch(actions.editTrip(trip));
    }
  };
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(AddTripForm);
