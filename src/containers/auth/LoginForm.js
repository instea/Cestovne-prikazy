import './LoginForm.css';

import React, {Component} from 'react';
import {Row, Col, ButtonToolbar} from 'react-bootstrap';
import 'react-datetime/css/react-datetime.css';
import {connect} from 'react-redux';
import * as actions from '../../actions/authActions';
import {compose} from 'react-apollo';
import {bindActionCreators} from 'redux';
import { GoogleLogin } from '@react-oauth/google';
import {getLoginResult} from '../../selectors/user';
import LoginResultMessage from '../../components/LoginResultMessage';

class LoginForm extends Component {

  render() {
    return (
      <Row>
        <Col sm={12}>
          <LoginResultMessage loginResult={this.props.loginResult}/>
          <Row>
            <Col xsOffset={4} xs={4} smOffset={3} sm={4} mdOffset={4} md={4} lgOffset={4} lg={4}>
              <ButtonToolbar>
                <GoogleLogin onSuccess={this.props.onGoogleSuccess} onError={onGoogleFailure} hosted_domain={process.env.REACT_APP_HOSTED_DOMAIN || ''}/>
              </ButtonToolbar>
            </Col>
          </Row>
        </Col>
      </Row>
    );
  }

}

const mapStateToProps = (state) => ({
  loginResult: getLoginResult(state)
});

const mapDispatchToProps = (dispatch, ownProps) => bindActionCreators({
  onGoogleSuccess: (response) => actions.login(response.credential)
}, dispatch);

const onGoogleFailure = (response) => console.log(response);

export default compose(
  connect(
    mapStateToProps,
    mapDispatchToProps
  )
)(LoginForm);
