import React, {Component} from 'react';
import {connect} from 'react-redux';
import * as actions from '../dispatch/actions';
import UserForm from './UserForm';
import {gql, graphql, compose} from 'react-apollo';
import {Field} from 'redux-form';
import {ReduxFormInput, required} from './FormHelpers';

class AddUserForm extends Component {

  render() {
    return (
      <UserForm onSave={this.props.onSave} initialValues={this.props.initialValues}>
        <Field name="password" label="Password:" id="password" type="password" component={ReduxFormInput} validate={required} />
      </UserForm>
    );
  }

}

const mapStateToProps = (state) => ({});

const mapDispatchToProps = (dispatch, ownProps) => ({
  onSave: (user) => {
    dispatch(actions.addUser({
      name: user.name,
      password: user.password,
      isAdmin: !!user.isAdmin
    }, ownProps.mutate));
  }
});

export default compose(
  graphql(gql`
    mutation ($user: UserInput!) {
      createUser(user: $user) {
        id
      }
    }
  `, {
    options: {
      refetchQueries: ['GetUsers']
    }
  }),
  connect(
    mapStateToProps,
    mapDispatchToProps
  )
)(AddUserForm);
