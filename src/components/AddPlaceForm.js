import React, {Component} from 'react';
import {connect} from 'react-redux';
import * as actions from '../dispatch/actions';
import PlaceForm from './PlaceForm';
import {gql, graphql, compose} from 'react-apollo';

class AddPlaceForm extends Component {

  render() {
    return (
      <PlaceForm header="Add place" onSave={this.props.onSave} />
    );
  }

}

const mapStateToProps = (state) => ({});

const mapDispatchToProps = (dispatch, ownProps) => ({
  onSave: (place) => {
    dispatch(actions.addPlace(place, ownProps.mutate));
  }
});

export default compose(
  graphql(gql`
    mutation ($place: PlaceInput!) {
      createPlace(place: $place) {
        id
      }
    }
  `, {
    options: {
      refetchQueries: ['GetPlaces']
    }
  }),
  connect(
    mapStateToProps,
    mapDispatchToProps
  )
)(AddPlaceForm);
