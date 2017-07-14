import React from 'react';
import {connect} from 'react-redux';
import * as actions from '../dispatch/actions';
import {gql, graphql, compose} from 'react-apollo';
import * as Place from '../data/Place';

import PlaceForm from './PlaceForm';
import withProgress from './withProgress';

const EditPlaceForm = (props) => (
  <PlaceForm header="Edit place" onSave={props.onSave} initialValues={Place.serializableToFull(props.place)} />
);

const mapStateToProps = (state) => ({});

const mapDispatchToProps = (dispatch, ownProps) => {
  return {
    onSave: (place) => {
      dispatch(actions.editPlace(place, ownProps.match.params.id, ownProps.mutate));
    }
  };
};

export default compose(
  graphql(gql`
    query GetPlace ($id: String!) {
      getPlace(id: $id) {
        name,
        destinationName,
        originName,
        travelDuration
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
    mutation ($id: String!, $place: PlaceInput) {
      updatePlace(id: $id, place: $place) {
        success
      }
    }
  `, {
    options: {
      refetchQueries: ['GetPlace', 'GetPlaces']
    }
  }),
  connect(
    mapStateToProps,
    mapDispatchToProps
  ),
  withProgress({
    errorMessage: (error) => `Error while fetching the place: ${error.message}`,
    dataMappings: {
      place: 'getPlace'
    }
  })
)(EditPlaceForm);
