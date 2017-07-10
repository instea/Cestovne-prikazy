import './LoginForm.css';

import React, { Component } from 'react';
import {Row, Col, ButtonToolbar, Button, FormGroup, FormControl, ControlLabel, HelpBlock} from 'react-bootstrap';
import 'react-datetime/css/react-datetime.css';
import {connect} from 'react-redux';
import {goBack} from 'react-router-redux';
import * as actions from '../dispatch/actions';
import {Field, reduxForm} from 'redux-form';
import {gql, graphql, compose} from 'react-apollo';

const FieldWrapper = (field) => (
  <Row>
    <FormGroup controlId={"fc" + field.id} validationState={field.meta.touched && field.meta.error ? "error" : undefined}>
      <Col componentClass={ControlLabel} xs={4} sm={3} smOffset={0} md={2} mdOffset={2}>
        {field.label}
      </Col>
      <Col xs={8} sm={9} md={6}>
        {field.children}
        {field.meta.touched && field.meta.error && <HelpBlock>{field.meta.error}</HelpBlock>}
      </Col>
    </FormGroup>
  </Row>
);

const ReduxFormInput = (field) => (
  <FieldWrapper {...field}>
    <FormControl type={field.type} {...field.input} />
  </FieldWrapper>
);

const required = (val) => !val && 'Required';

class LoginForm extends Component {

  render() {
    return (
      <Row>
        <Col sm={12}>
          <form onSubmit={this.props.handleSubmit}>
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

const mapStateToProps = (state) => ({});

const mapDispatchToProps = (dispatch, ownProps) => ({
  onSubmit: (values) => {
    dispatch(actions.login(values.username, values.password, ownProps.dbLogin, ownProps.userPing));
    dispatch(goBack());
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
      refetchQueries: ['GetUser', 'GetTrips']
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
