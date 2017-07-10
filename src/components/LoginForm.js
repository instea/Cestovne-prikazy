import './LoginForm.css';

import React, { Component } from 'react';
import {Row, Col, ButtonToolbar, Button} from 'react-bootstrap';
import 'react-datetime/css/react-datetime.css';
import {connect} from 'react-redux';
import * as actions from '../dispatch/actions';
import {Field, reduxForm} from 'redux-form';
import {gql, graphql, compose} from 'react-apollo';
import {ReduxFormInput, required} from './FormHelpers';
import ErrorMessage from './ErrorMessage';

class LoginForm extends Component {

  render() {
    return (
      <Row>
        <Col sm={12}>
          <form onSubmit={this.props.handleSubmit}>
            {this.props.errMessage ? <ErrorMessage>{this.props.errMessage}</ErrorMessage> : <span />}
            <Field name="username" label="Username:" id="username" component={ReduxFormInput} type="text" validate={required} />
            <Field name="password" label="Password:" id="password" component={ReduxFormInput} type="password" validate={required} />
            <Row>
              <Col xsOffset={4} xs={4} smOffset={3} sm={4} mdOffset={4} md={4} lgOffset={4} lg={4}>
                <ButtonToolbar>
                  <Button bsStyle="primary" type="submit">Login</Button>
                </ButtonToolbar>
              </Col>
            </Row>
          </form>
        </Col>
      </Row>
    );
  }

}

const mapStateToProps = (state) => ({
  errMessage: state.user.get('failed') ? 'Incorrect username or password!' : ''
});

const mapDispatchToProps = (dispatch, ownProps) => ({
  onSubmit: (values) => {
    dispatch(actions.login(values.username, values.password, ownProps.dbLogin, ownProps.userPing));
  }
});

export default compose(
  graphql(gql`
    mutation ($user: Credentials) {
      loginUser(user: $user) {
        success,
        message,
        payload
      }
    }
  `, {
    name: 'dbLogin',
    options: {
      refetchQueries: ['GetTrips', 'GetUser']
    }
  }),
  graphql(gql`
    mutation {
      userPing {
        success
      }
    }
  `, {
    name: 'userPing',
    options: {
      refetchQueries: ['GetUserInfo', 'GetTrips', 'GetUsers']
    }
  }),
  connect(
    mapStateToProps,
    mapDispatchToProps
  ),
  reduxForm({
    form: 'login'
  })
)(LoginForm);
