import React from 'react';
import {connect} from 'react-redux';
import * as actions from '../../actions/placeActions';
import {gql, graphql, compose} from 'react-apollo';
import * as Place from '../../data/Place';
import {bindActionCreators} from 'redux';
import PlaceForm from './PlaceForm';
import withProgress from '../../components/withProgress';

const EditPlaceForm = (props) => (
  <PlaceForm header="Edit place" onSave={props.onSave} initialValues={Place.serializableToFull(props.place)} />
);

const mapStateToProps = (state) => ({});

const mapDispatchToProps = (dispatch, ownProps) => bindActionCreators({
  onSave: (place) => actions.editPlace(place, ownProps.match.params.id)
}, dispatch);

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
