import React from 'react';
import {connect} from 'react-redux';
import * as actions from '../../actions/tripActions';
import {gql, graphql, compose} from 'react-apollo';
import * as Trip from '../../data/Trip';
import {bindActionCreators} from 'redux';
import TripForm from './TripForm';
import withProgress from '../../components/withProgress';

const EditTripForm = (props) => (
  <TripForm header="Edit trip" onSave={props.onSave} initialValues={Trip.toFull(props.trip)} />
);

const mapStateToProps = (state) => ({});

const mapDispatchToProps = (dispatch, ownProps) => bindActionCreators({
  onSave: (trip) => actions.editTrip(trip, ownProps.match.params.id)
}, dispatch);

export default compose(
  graphql(gql`
    query GetTrip ($id: String!) {
      getTrip(id: $id) {
        userId,
        placeId,
        departureTime,
        arrivalTime,
        purpose,
        travelType,
        priceOfTravel
      }
    }
  `, {
    options: (ownProps) => ({
      variables: {
        id: ownProps.match.params.id
      }
    })
  }),
  connect(
    mapStateToProps,
    mapDispatchToProps
  ),
  withProgress({
    errorMessage: (error) => `Error while fetching the trip: ${error.message}`,
    dataMappings: {
      trip: 'getTrip'
    }
  })
)(EditTripForm);
