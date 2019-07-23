import './LoginForm.css';

import React, {Component} from 'react';
import {Row, Col, ButtonToolbar} from 'react-bootstrap';
import 'react-datetime/css/react-datetime.css';
import {connect} from 'react-redux';
import * as actions from '../../actions/authActions';
import { reduxForm} from 'redux-form';
import {compose} from 'react-apollo';
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
            <Row>
              <Col xsOffset={4} xs={4} smOffset={3} sm={4} mdOffset={4} md={4} lgOffset={4} lg={4}>
                <ButtonToolbar>
                  <GoogleLogin
                      clientId="914978031481-bk8e8bj1ur0vhq4qlh7n7875drin9r0e.apps.googleusercontent.com"
                      buttonText="Login with Google"
                      onSuccess={this.props.onGoogleSuccess}
                      onFailure={onGoogleFailure}
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
      message = <WarningMessage>{'Account needs to be approved by admin first.'}</WarningMessage>;
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

const onGoogleFailure = (response) => console.log(response);

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
