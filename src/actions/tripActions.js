import * as Trip from '../data/Trip';
import { push } from 'react-router-redux';
import client from '../singletons/apolloClient';
import { gql } from 'react-apollo';
import { query as listQuery } from '../containers/trips/TripList';

export const ADD_TRIP = 'ADD_TRIP';
export const EDIT_TRIP = 'EDIT_TRIP';

const mutateAdd = opts =>
  client.mutate({
    mutation: gql`
      mutation($trip: TripInput!) {
        createTrip(trip: $trip) {
          id
        }
      }
    `,
    refetchQueries: [
      {
        query: listQuery
      }
    ],
    ...opts
  });

const mutateEdit = opts =>
  client.mutate({
    mutation: gql`
      mutation($id: String!, $trip: TripInput) {
        updateTrip(id: $id, trip: $trip) {
          success
        }
      }
    `,
    refetchQueries: ['GetTrips', 'GetTrip'],
    ...opts
  });

const mutateRemove = opts =>
  client.mutate({
    mutation: gql`
      mutation($id: String!) {
        removeTrip(id: $id) {
          success
        }
      }
    `,
    refetchQueries: ['GetTrips'],
    ...opts
  });

export function addTrip(trip) {
  return dispatch => {
    mutateAdd({
      variables: {
        trip: Trip.toSerializable(trip)
      }
    }).then(() => {
      dispatch({
        type: ADD_TRIP,
        trip: trip
      });
      dispatch(push('/trips'));
    });
  };
}

export function duplicateTrip(trip) {
  // TODO ask for new date start
  return addTrip({ ...trip, id: undefined });
}

export function editTrip(trip, id) {
  return dispatch => {
    mutateEdit({
      variables: {
        id: id,
        trip: Trip.toSerializable(trip)
      }
    }).then(() => {
      dispatch({
        type: EDIT_TRIP,
        trip: trip
      });
    });
    dispatch(push('/trips'));
  };
}

export function removeTrip(id) {
  return dispatch => {
    mutateRemove({
      variables: {
        id: id
      }
    });
  };
}
