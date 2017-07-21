import * as Place from '../data/Place';
import {push} from 'react-router-redux';
import client from '../singletons/apolloClient';
import {gql} from 'react-apollo';
import {query as listQuery} from '../containers/places/PlaceList';

export const ADD_PLACE = 'ADD_PLACE';
export const EDIT_PLACE = 'EDIT_PLACE';

const mutateAdd = (opts) => client.mutate({
  mutation: gql`
    mutation ($place: PlaceInput!) {
      createPlace(place: $place) {
        id
      }
    }
  `,
  refetchQueries: [{
    query: listQuery
  }],
  ...opts
});

const mutateEdit = (opts) => client.mutate({
  mutation: gql`
    mutation ($id: String!, $place: PlaceInput) {
      updatePlace(id: $id, place: $place) {
        success
      }
    }
  `,
  refetchQueries: ['GetPlaces', 'GetPlace'],
  ...opts
});

const mutateRemove = (opts) => client.mutate({
  mutation: gql`
    mutation ($id: String!) {
      removePlace(id: $id) {
        success
      }
    }
  `,
  refetchQueries: ['GetPlaces'],
  ...opts
});

export function addPlace(place) {
  return (dispatch) => {
    mutateAdd({
      variables: {
        place: Place.fullToSerializable(place)
      }
    }).then(() => {
      dispatch({
        type: ADD_PLACE,
        place: place
      });
      dispatch(push('/places'));
    });
  };
}

export function editPlace(place, id) {
  return (dispatch) => {
    mutateEdit({
      variables: {
        id: id,
        place: Place.fullToSerializable(place)
      }
    }).then(() => {
      dispatch({
        type: EDIT_PLACE,
        place: place
      });
    });
    dispatch(push('/places'));
  };
}

export function removePlace(id) {
  return (dispatch) => {
    mutateRemove({
      variables: {
        id: id
      }
    });
  };
}
