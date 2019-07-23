import './LoginForm.css';

import React, {Component} from 'react';
import {Row, Col, ButtonToolbar, Button} from 'react-bootstrap';
import 'react-datetime/css/react-datetime.css';
import {connect} from 'react-redux';
import * as actions from '../../actions/authActions';
import {Field, reduxForm} from 'redux-form';
import {compose} from 'react-apollo';
import {ReduxFormInput} from '../../components/FormHelpers';
import ErrorMessage from '../../components/ErrorMessage';
import WarningMessage from "../../components/WarningMessage";
import {required} from '../../core/validation';
import {bindActionCreators} from 'redux';
import { GoogleLogin } from 'react-google-login';
import { LoginResults } from '../../data/LoginResults';

class LoginForm extends Component {

  render() {
    return (
      <Row>
        <Col sm={12}>
          <form onSubmit={this.props.handleSubmit}>
            {this.props.message}
            <Field name="username" label="Username:" id="username" component={ReduxFormInput} type="text" />
            <Field name="password" label="Password:" id="password" component={ReduxFormInput} type="password" />
            <Row>
              <Col xsOffset={4} xs={4} smOffset={3} sm={4} mdOffset={4} md={4} lgOffset={4} lg={4}>
                <ButtonToolbar>
                  <Button bsStyle="primary" type="submit">Login</Button>
                  <GoogleLogin
                      clientId="914978031481-bk8e8bj1ur0vhq4qlh7n7875drin9r0e.apps.googleusercontent.com"
                      buttonText="Login with Google"
                      onSuccess={this.props.onGoogleSuccess}
                      onFailure={responseGoogle}
                      cookiePolicy={'single_host_origin'}
                  />
                </ButtonToolbar>
              </Col>
            </Row>
          </form>
        </Col>
      </Row>
    );
  }

}

const validate = (values) => ({
  ...required(values, 'username', 'password')
});

const mapStateToProps = (state) => {
  let message;
  const loginResult = state.user.get('loginResult');
  switch (loginResult) {
    case LoginResults.FAILED:
      message = <ErrorMessage>{'Login failed. Try again later.'}</ErrorMessage>;
      break;
    case LoginResults.WRONG_DOMAIN:
      message = <ErrorMessage>{'Used email does not belong to given hosted domain.'}</ErrorMessage>;
      break;
    case LoginResults.NEED_APPROVAL:
      message = <WarningMessage>{'NEW: Account needs to be approved by admin first.'}</WarningMessage>;
      break;
    default: message = <span/>;
  }
  return {
    message: message
  }
};

const mapDispatchToProps = (dispatch, ownProps) => bindActionCreators({
  onSubmit: (values) => actions.login(values.username, values.password),
  onGoogleSuccess: (response) => actions.login(response.tokenObj.id_token)
}, dispatch);

const responseGoogle = (response) => console.log(response);

export default compose(
  connect(
    mapStateToProps,
    mapDispatchToProps
  ),
  reduxForm({
    form: 'login',
    validate
  })
)(LoginForm);
