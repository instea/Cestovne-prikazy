import React from 'react';
import {connect} from 'react-redux';
import * as actions from '../actions/userActions';
import {gql, graphql, compose} from 'react-apollo';

import UserForm from './UserForm';
import withProgress from './withProgress';
import {Field, getFormValues} from 'redux-form';
import {ReduxFormInput, ReduxFormCheckbox} from './FormHelpers';
import * as User from '../data/User';

const EditUserForm = (props) => (
  <UserForm onSave={props.onSave} initialValues={props.user}>
    <Field name="updatePassword" label="Update password:" id="updatePassword" component={ReduxFormCheckbox} />
    <Field name="password" label="Password:" id="password" type="password" component={ReduxFormInput} disabled={props.passwordDisabled} />
  </UserForm>
);

const mapStateToProps = (state) => {
  const values = getFormValues('user')(state);
  return {
    passwordDisabled: values && !values.updatePassword
  };
};

const mapDispatchToProps = (dispatch, ownProps) => {
  return {
    onSave: (user) => {
      const userData = User.create(user, user.updatePassword ? user.password : undefined, !!user.isAdmin);
      dispatch(actions.editUser(userData, ownProps.match.params.id, ownProps.mutate));
    }
  };
};

export default compose(
  graphql(gql`
    query GetUser ($id: String!) {
      getUser(id: $id) {
        username,
        firstName,
        surname,
        degrees,
        address,
        isAdmin
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
    mutation ($id: String!, $user: UserInput) {
      updateUser(id: $id, user: $user) {
        success
      }
    }
  `, {
    options: {
      refetchQueries: ['GetUser', 'GetUsers']
    }
  }),
  connect(
    mapStateToProps,
    mapDispatchToProps
  ),
  withProgress({
    errorMessage: (error) => `Error while fetching the user: ${error.message}`,
    dataMappings: {
      user: 'getUser'
    }
  })
)(EditUserForm);
