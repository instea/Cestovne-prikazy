import React from 'react';
import {connect} from 'react-redux';
import * as actions from '../dispatch/actions';
import {gql, graphql, compose} from 'react-apollo';
import moment from 'moment';

import TripForm from './TripForm';
import WithProgress from './WithProgress';

class EditTripForm extends WithProgress {

  errorMessage(error) {
    return `Error while fetching the trip: ${error.message}`;
  }

  normalizeData(data) {
    return {
      place: data.place,
      from: moment(data.from),
      to: moment(data.to)
    };
  }

  renderData(data) {
    return <TripForm header="Edit trip" onSave={this.props.onSave} initialValues={this.normalizeData(data.getTrip)} />;
  }

}

const mapStateToProps = (state) => ({});

const mapDispatchToProps = (dispatch, ownProps) => {
  return {
    onSave: (trip) => {
      dispatch(actions.editTrip(trip, ownProps.match.params.id, ownProps.mutate));
    }
  };
}

export default compose(
  graphql(gql`
    query GetTrip ($id: String!) {
      getTrip(id: $id) {
        from,
        to,
        place
      }
    }
  `, {
    options: (ownProps) => ({
      variables: {
        id: ownProps.match.params.id
      }
    })
  }),
  graphql(gql`
    mutation ($id: String!, $trip: TripInput) {
      updateTrip(id: $id, trip: $trip) {
        id
      }
    }
  `, {
    options: {
      refetchQueries: ['GetTrip', 'GetTrips']
    }
  }),
  connect(
    mapStateToProps,
    mapDispatchToProps
  )
)(EditTripForm);
