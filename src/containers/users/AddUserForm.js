import React, {Component} from 'react';
import {connect} from 'react-redux';
import * as actions from '../../actions/userActions';
import UserForm from './UserForm';
import {Field} from 'redux-form';
import {ReduxFormInput} from '../../components/FormHelpers';
import * as User from '../../data/User';
import {inlineRequired as required} from '../../core/validation';
import {bindActionCreators} from 'redux';

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

const mapDispatchToProps = (dispatch, ownProps) => bindActionCreators({
  onSave: (user) => actions.addUser(User.create(user, user.password, !!user.isAdmin))
}, dispatch);

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(AddUserForm);
