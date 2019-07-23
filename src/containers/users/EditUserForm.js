import React from 'react';
import {connect} from 'react-redux';
import * as actions from '../../actions/userActions';
import {gql, graphql, compose} from 'react-apollo';
import {bindActionCreators} from 'redux';
import UserForm from './UserForm';
import withProgress from '../../components//withProgress';
import {getFormValues} from 'redux-form';
import * as User from '../../data/User';

const EditUserForm = (props) => (
  <UserForm onSave={props.onSave} initialValues={props.user} ownerId={props.ownerId}>
  </UserForm>
);

const mapStateToProps = (state, ownProps) => {
  const values = getFormValues('user')(state);
  return {
    passwordDisabled: values && !values.updatePassword,
    ownerId: ownProps.match.params.id
  };
};

const mapDispatchToProps = (dispatch, ownProps) => bindActionCreators({
  onSave: (user) => {
    const userData = User.create(user, user.updatePassword ? user.password : undefined, !!user.isAdmin);
    return actions.editUser(userData, ownProps.match.params.id);
  }
}, dispatch);

export default compose(
  graphql(gql`
    query GetUser ($id: String!) {
      getUser(id: $id) {
        firstName,
        surname,
        degrees,
        address,
        isAdmin,
        email,
        approved
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
    errorMessage: (error) => `Error while fetching the user: ${error.message}`,
    dataMappings: {
      user: 'getUser'
    }
  })
)(EditUserForm);
