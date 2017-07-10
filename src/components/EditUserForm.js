import React from 'react';
import {connect} from 'react-redux';
import * as actions from '../dispatch/actions';
import {gql, graphql, compose} from 'react-apollo';

import UserForm from './UserForm';
import WithProgress from './WithProgress';
import {Field, getFormValues} from 'redux-form';
import {ReduxFormInput, ReduxFormCheckbox} from './FormHelpers';

class EditUserForm extends WithProgress {

  errorMessage(error) {
    return `Error while fetching the user: ${error.message}`;
  }

  renderData(data) {
    return (
      <UserForm onSave={this.props.onSave} initialValues={data.getUser}>
        <Field name="updatePassword" label="Update password:" id="updatePassword" component={ReduxFormCheckbox} />
        <Field name="password" label="Password:" id="password" type="password" component={ReduxFormInput} optional={({
          disabled: this.props.passwordDisabled
        })} />
      </UserForm>
    );
  }

}

const mapStateToProps = (state) => {
  const values = getFormValues('user')(state);
  return {
    passwordDisabled: values && !values.updatePassword
  };
};

const mapDispatchToProps = (dispatch, ownProps) => {
  return {
    onSave: (user) => {
      dispatch(actions.editUser(Object.assign({
        name: user.name,
        isAdmin: !!user.isAdmin
      }, user.updatePassword ? {
        password: user.password
      } : {}), ownProps.match.params.id, ownProps.mutate));
    }
  };
}

export default compose(
  graphql(gql`
    query GetUser ($id: String!) {
      getUser(id: $id) {
        name,
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
  )
)(EditUserForm);
