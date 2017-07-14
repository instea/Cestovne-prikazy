import React, {Component} from 'react';
import {connect} from 'react-redux';
import * as actions from '../actions/tripActions';
import TripForm from './TripForm';
import moment from 'moment';
import {gql, graphql, compose} from 'react-apollo';
import * as TravelType from '../data/TravelType';

class AddTripForm extends Component {

  render() {
    return (
      <TripForm header="Add trip" onSave={this.props.onSave} initialValues={this.props.initialValues} />
    );
  }

}

const mapStateToProps = (state) => ({
  initialValues: {
    departureTime: moment().add(1, 'days').hours(8).minutes(0).seconds(0),
    arrivalTime: moment().add(1, 'days').hours(17).minutes(0).seconds(0),
    travelType: TravelType.values[0].code
  }
});

const mapDispatchToProps = (dispatch, ownProps) => ({
  onSave: (trip) => {
    dispatch(actions.addTrip(trip, ownProps.mutate));
  }
});

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
