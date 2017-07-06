import React, {Component} from 'react';
import {connect} from 'react-redux';
import * as actions from '../dispatch/actions';
import TripForm from './TripForm';
import moment from 'moment';
import {gql, graphql, compose} from 'react-apollo';

class AddTripForm extends Component {

  render() {
    return (
      <TripForm header="Add trip" onSave={this.props.onSave} initialValues={this.props.initialValues} />
    );
  }

}

const mapStateToProps = (state) => {
  return {
    initialValues: {
      from: moment().add(27, 'hours'),
      to: moment().add(30, 'hours')
    }
  };
}

const mapDispatchToProps = (dispatch, ownProps) => {
  return {
    onSave: (trip) => {
      dispatch(actions.addTrip(trip, ownProps.mutate));
    }
  };
}

export default compose(
  graphql(gql`
    mutation ($trip: TripInput!) {
      createTrip(trip: $trip) {
        id
      }
    }
  `, {
    options: {
      refetchQueries: ['GetTrips']
    }
  }),
  connect(
    mapStateToProps,
    mapDispatchToProps
  )
)(AddTripForm);
