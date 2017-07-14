import {push} from 'react-router-redux';
import client from '../singletons/apolloClient';
import {gql} from 'react-apollo';

export const ADD_USER = 'ADD_USER';
export const EDIT_USER = 'EDIT_USER';

const mutateAdd = (opts) => client.mutate({
  mutation: gql`
    mutation ($user: UserInput!) {
      createUser(user: $user) {
        id
      }
    }
  `,
  refetchQueries: ['GetUsers'],
  ...opts
});

const mutateEdit = (opts) => client.mutate({
  mutation: gql`
    mutation ($id: String!, $user: UserInput) {
      updateUser(id: $id, user: $user) {
        success
      }
    }
  `,
  refetchQueries: ['GetUsers', 'GetUser'],
  ...opts
});

const mutateRemove = (opts) => client.mutate({
  mutation: gql`
    mutation ($id: String!) {
      removeUser(id: $id) {
        success
      }
    }
  `,
  refetchQueries: ['GetUsers'],
  ...opts
});

export function addUser(user) {
  return (dispatch) => {
    mutateAdd({
      variables: {
        user: user
      }
    }).then(() => {
      dispatch({
        type: ADD_USER,
        user: user
      });
    });
    dispatch(push('/users'));
  };
}

export function editUser(user, id) {
  return (dispatch) => {
    mutateEdit({
      variables: {
        id: id,
        user: user
      }
    }).then(() => {
      dispatch({
        type: EDIT_USER,
        user: user
      });
    });
    dispatch(push('/users'));
  };
}

export function removeUser(id) {
  return (dispatch) => {
    mutateRemove({
      variables: {
        id: id
      }
    });
  };
}
